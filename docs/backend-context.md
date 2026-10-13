# Контекст бэкенда для фронта (мини-дока)

Краткая выжимка из `fkit-bi-infra`, `fkit-bi-analytics`, `fkit-bi-generator`. Источник истины по контракту —
`openapi/analytics-api.yaml` и `openapi/generator-api.yaml` (обновляются `npm run api:sync`). Если дока и спека расходятся — прав спека.

## 1. Сервисы и как с ними общаться

| Сервис | Стек | Что делает | Фронт ходит? |
| --- | --- | --- | --- |
| **fkit-bi-analytics** | Java 21, Spring Boot, Liquibase | CRUD структуры (предприятия, смены, причины потерь, линии, машины, компоненты, сигналы, правила состояний), оперативный мониторинг, KPI/потери/хронометраж, интервалы состояний, ручные инциденты, фоновый перерасчёт, auth | Да |
| **fkit-bi-generator** | Java 21, Spring Boot | Сценарии и запуски генерации (REALTIME / HISTORICAL / SCHEDULED); пишет сырую телеметрию в БД через JDBC `TelemetrySink` | Да |
| **PostgreSQL 16** | — | Общая БД. Миграции Liquibase — **только** у Analytics | Нет |
| **fkit-bi-infra** | docker compose, nginx | Dev-стенд, edge-прокси, CI/деплой | Нет |
| **fkit-web-bi** (этот репо) | React/Vite/TS | UI | — |

- Между analytics и generator нет HTTP-вызовов; связь только через общую БД.
- Kafka/ETL/продакшен/прогнозирование — вне демо.
- Состояние сценариев/запусков генератора на демо может жить в памяти (после рестарта не гарантируется).

### Маршрутизация (edge nginx, `fkit-bi-infra/nginx/default.conf`)

```
/api/analytics/  → analytics:8080/   (префикс срезается)
/api/generator/  → generator:8080/
/                → web (статика фронта)
```

Фронт ходит **только по относительным путям**:
`/api/analytics/api/v1/...` и `/api/generator/api/v1/...` (в спеках `servers: ../api/v1`).
Локально то же делает прокси Vite (`.env.backend-local`: analytics `:8080`, generator `:8081`; `.env.stand`: `api.bi.kitexp.ru`, `generator.bi.kitexp.ru`).
Dev-стенд по IP: `http://45.132.176.28:8080`. Health: `/actuator/health` (не через фронт).

## 2. Общие правила API

- **Auth**: `POST /auth/login {username, password}` → `{accessToken, tokenType: "Bearer", expiresIn: 1800, user{id, username, displayName, canCreateUsers}}`.
  Токен JWT на 30 мин, шлём `Authorization: Bearer`. Лимит логина 10/мин (429 + `Retry-After`). `POST /auth/users` — только bootstrap-пользователь (`canCreateUsers`), 5/мин.
  В коде: токен в sessionStorage, middleware в `shared/api/client.ts`, на 401 — выход на логин. Refresh-токена нет.
- **ID** — UUID. Даты — ISO 8601 UTC (`date-time`); `shiftDate` — локальная дата `YYYY-MM-DD`.
- **Ошибка** (`ErrorResponse`): `{code, message, traceId, fieldErrors[{path, code, message}], details{}}`. `message` и `fieldErrors[].message` — безопасный русский текст; `path` — имя поля формы/query (`productionUnit`, `limit`, `parameters[0].unitCode`). Коды: 400 BadRequest (query, диапазон, `INVALID_RANGE`), 401, 403, 404, 409 Conflict (инварианты, `IDEMPOTENCY_KEY_REUSED`), 422 (поля/конфигурация), 429, 500 (только текст + `traceId`, stack trace в логе сервиса).
  Во фронте: `formatApiError` (общий текст + «код обращения»), ошибки полей — у контрола; retry только для сети/429/5xx (≤2 раз), 4xx и mutations не повторяются.
- **Статусы ресурсов** `ConfigStatus`: `ACTIVE | DISABLED`; без `?status=` списки отдают только ACTIVE. Удаления нет — смена статуса через `PUT .../status`.
- **Пагинация**: два вида — страничная (`page` от 0, `size` ≤200, мета `{number,size,totalElements,totalPages}`) и курсорная (`cursor` opaque, `limit` 1..500, по умолчанию 100, мета `{limit,hasMore,nextCursor}`; интервалы состояний, инциденты, запуски). Журналы инцидентов во фронте собирают все страницы (`allCursorItems`).
- **Идемпотентность**: create-запросы инцидентов и `POST /runs` требуют заголовок `Idempotency-Key` (8–128 символов), один ключ на ретраи одного запроса.
- Лимиты размера ответов: timeseries ≤1000 точек, telemetry series ≤720, хронометраж ≤10000 интервалов.
- Строгость схем: `additionalProperties: false` — лишние поля в теле запроса дадут 400/422.

## 3. Analytics API (`/api/v1`)

### Справочники и конфигурация (админка `/admin`)
`/enterprises`, `/enterprises/{id}/shifts`, `/enterprises/{id}/loss-reasons`, `/enterprises/{id}/lines`, `/enterprises/{id}/machines`,
`/lines/{id}/machines`, `/lines/{id}/machine-assignments`, `/machines/{id}/components`, `/components/{id}/parent`,
`/machines/{id}/telemetry-signals`, `/machines/{id}/state-configuration` (+ `/validate`), `/machines/{id}/activation-readiness`,
`/enterprises/{id}/equipment-tree` (дерево для сайдбара). У большинства — GET/POST/PUT и `PUT .../status`.

Справочник единиц: `GET /reference/measurement-units` → `[{code, name, symbol, quantityCode}]` (только ACTIVE). Единицы машины/сигнала/параметра — только `code` из справочника; `nominalRate` (>0) и `productionUnit` задаются парой.

### Мониторинг и аналитика (используется фронтом)
| Эндпоинт | Для чего |
| --- | --- |
| `GET /enterprises/{id}/operations/overview?lineId&includeDisabled` | карточки машин + счётчики по состояниям (обзор предприятия) |
| `GET /machines/{id}/operations/current` | паспорт + текущее состояние + featured-сигналы |
| `GET /machines/{id}/current-state` | готовая проекция текущего состояния |
| `GET /machines/{id}/telemetry/current?signalId[]&featuredOnly` | текущие значения сигналов, `quality` + `freshness` |
| `GET /machines/{id}/telemetry/series?signalId&from&to&resolution` | числовой ряд сигнала (GAUGE/COUNTER; STATE → 409) |
| `GET /analytics/summary?scope&scopeId&from&to` **или** `shiftId+shiftDate`, `compare=NONE\|PREVIOUS_PERIOD` | KPI периода + сравнение |
| `GET /analytics/metrics/timeseries?scope&scopeId&from&to&resolution` | ряд KPI («Динамика», пока не в UI) |
| `GET /analytics/losses/timeseries` / `/losses/pareto` (`top` 1–20) | потери по времени/причинам, Парето |
| `GET /machines/{id}/chronometry?shiftDate[&shiftId]` | хронометраж смен локальной даты |
| `GET /machines/{id}/state-intervals?from&to&state[]&lossReasonId&unclassifiedOnly&lossOnly&source&cursor&limit` | таблица эффективных интервалов |

Live-периоды («Сегодня», текущая смена): `to` может быть в будущем — backend считает до текущего момента, возвращает исходный `requestedTo` и `partial=true`; `PREVIOUS_PERIOD` сравнивает такую же прошедшую часть. Обрезать период на фронте не нужно.
Общие query: `scope` ∈ `MACHINE|LINE|ENTERPRISE` + `scopeId`; `resolution` ∈ `AUTO|5m|15m|1h|1d`; период задаётся либо `from+to`, либо `shiftId+shiftDate`.

### Домены-перечисления
- `MachineState`: `RUN, IDLE, DOWN, SETUP, PLANNED_STOP, OFFLINE` (`UserMachineState` — без OFFLINE; `ManualStateOverride`: `SETUP | PLANNED_STOP`).
- `StateSource`: `CALCULATED | MANUAL`. `Freshness`: `NO_DATA|FRESH|STALE`. `TelemetryQuality`: `GOOD|UNCERTAIN|BAD`. `EvaluationQuality`: `COMPLETE|DEGRADED`. `SignalKind`: `GAUGE|COUNTER|STATE`.

### Инциденты (ручные)
- `GET /enterprises/{id}/incidents`, `GET|POST /machines/{id}/incidents`, `GET|PUT|DELETE /incidents/{id}`, `PUT /incidents/{id}/close`.
- `ManualIncidentCreate`: обязательно `from`; `to: null` = продолжается; **нужно хотя бы одно** из `stateOverride` (SETUP/PLANNED_STOP) или `lossReasonId`; опц. `comment`, `author`. Требует `Idempotency-Key`.
- Ручной инцидент накладывается поверх расчётных интервалов (источник `MANUAL`), сырую телеметрию не меняет.

### Перерасчёт
`GET|POST /machines/{id}/state-recalculations`, `GET|DELETE /state-recalculations/{id}` — фоновые задачи, статус опрашивается (в UI пока нет).

## 4. Generator API (`/api/v1`)

- **Сценарии**: `GET|POST /scenarios` (`enterpriseId`, `status`, `search`, `page`, `size`), `POST /scenarios/validate`, `GET|PUT /scenarios/{id}`, `PUT /scenarios/{id}/status`.
  Создаётся в `DISABLED`; активация отдельной командой (перепроверяет оборудование). Тело: имя, описание, `cycleMode` (напр. `LOOP`), `machineTargets[{machineId, baseBehaviors}]`, `phases[{code, name, durationMs, expectedState, behaviorOverrides}]`; PUT заменяет конфиг целиком. Валидация возвращает `issues` (severity `ERROR|WARNING`), а не 4xx.
- **Запуски**: `GET|POST /runs`, `POST /runs/validate`, `GET /runs/{id}`, `POST /runs/{id}/stop`, `POST /runs/{id}/retry`.
  - `RunCreate` — union по `mode`: `REALTIME` (`scenarioId, randomSeed, durationMs`), `HISTORICAL` (период), `SCHEDULED` (`scheduledStartAt, durationMs`). `POST /runs` → **202** + `Idempotency-Key`.
  - `RunStatus`: `SCHEDULED, QUEUED, RUNNING, STOP_REQUESTED, COMPLETED, STOPPED, CANCELLED, FAILED`. Прогресс — поллингом `GET /runs/{id}` (`progress`, checkpoint, ошибка с флагом retryable, `analyticsContext`).
  - `stop`: 202 если выполняется, 200 если уже terminal/отменён; повтор идемпотентен. `retry` — только для FAILED с retryable-ошибкой (202).
  - Журнал запусков — курсорный, `requestedAt DESC`.
- UI: страница `/generator` (сценарии, запуски) и «Быстрая генерация» (`features/quick-generate`): сценарий собирается из
  сигналов и правил состояний машин (значения под RUN/IDLE/DOWN…), затем create → activate → run одним действием.

## 5. Как это отражено во фронте

- Типы: `src/shared/api/generated/{analytics,generator}.ts` (`npm run api:generate`); клиент `src/shared/api/client.ts` (openapi-fetch); прямой `fetch` запрещён ESLint.
- Моки (MSW, `src/shared/mocks`) повторяют реальные пути и валидируются Ajv против спеки (`contract.test.ts`) — менял мок/маршрут → прогони `npm test`.
- Режим `mock|real` фиксируется при сборке (`VITE_API_MODE`). Хосты: `ANALYTICS_API_URL` / `GENERATOR_API_URL` в контейнере.
- Реализовано: вход, портал выбора предприятия, обзор предприятия, дашборд машины, журнал и регистрация инцидентов,
  админка конфигурации (CRUD), Generator UI (сценарии и запуски).
  Не реализовано: «Динамика» (`metrics/timeseries`), перерасчёты состояний, управление пользователями (`/auth/users`).

## 6. Известные нюансы и риски

- Спеки бэкенда нестрогие в местах: `Enterprise`, `StateRule` через `allOf` с `additionalProperties:false` — ответы невалидны по строгому JSON Schema (в контрактном тесте ограничение снято).
- `servers: ../api/v1` относительно `/api/analytics/openapi/` даёт `/api/analytics/api/v1`; путь `/api/analytics/v1` — неверный.
- Бэкенд реализован; нормативный контракт — `fkit-bi-analytics/docs/contracts/analytics-api-draft.yaml`. При расхождениях со стендом сверять с `bi.kitexp.ru` и фиксировать в спеке.
- Период опроса UI, частота расчётов и пределы нагрузки на бэкенде не определены; UI обновляет данные поллингом (`shared/model/refresh.ts`), не realtime.
- Секреты не коммитятся; `docker compose down -v` на стенде запрещён (теряется БД).
- Процесс: ветка `main` — база, PR и интеграция в `develop`; push в `develop` деплоит компонент на Dev. Задачи фиксируются в `docs/tasks/`; кросс-сервисные решения — в `fkit-bi-infra`.
