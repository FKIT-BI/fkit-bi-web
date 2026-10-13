# FKIT-BI · WEB-BI

Веб-интерфейс аналитики простоев: по каждой машине — сколько времени она работала полезно, сколько простаивала и почему.
Клиент работает по контракту бэкенда (Analytics и Generator API); в режиме `mock` все запросы перехватывает MSW
в браузере, и данные генерирует сам фронтенд.

## Запуск

```bash
npm install
npm run dev          # мок: MSW в браузере, вход любым логином (3+ символа) и паролем от 12 символов
npm run dev:local    # реальный бэкенд локально: Analytics → localhost:8080, Generator → localhost:8081
npm run dev:stand    # Dev-стенд: Analytics → api.bi.kitexp.ru, Generator → generator.bi.kitexp.ru
npm run build        # статика в dist/ (VITE_API_MODE по умолчанию mock)
npm test             # формулы, генератор, контракт моков со схемами бэкенда
npm run lint         # ESLint + границы слоёв FSD
npm run api:sync     # скачать свежие analytics/generator OpenAPI со стенда в openapi/
npm run api:generate # пересоздать типы src/shared/api/generated/*.ts
```

Полезные параметры адреса: `?range=today|shift|yesterday|7d|30d|custom&from=&to=`, `&shift=DAY|NIGHT` (код смены),
`&refresh=30s|1m|5m`, `&kiosk=1` (без сайдбара и шапки; Esc — выход), `&mockError=1` (аналитика отвечает 500).

## Хосты API

Клиент всегда ходит на относительные пути, как на стенде за edge-прокси:
`/api/analytics/api/v1/...` и `/api/generator/api/v1/...`.

| Где | Как задаётся |
| --- | --- |
| Локально с бэкендом | `.env.backend-local` → прокси Vite на `VITE_ANALYTICS_PROXY_TARGET` / `VITE_GENERATOR_PROXY_TARGET` |
| Локально против стенда | `.env.stand` → прокси Vite на `https://api.bi.kitexp.ru` / `https://generator.bi.kitexp.ru` |
| Свои адреса | `.env.local` или `.env.<mode>.local` (не коммитятся), те же переменные |
| Контейнер | `ANALYTICS_API_URL`, `GENERATOR_API_URL` при старте → `window.__ENV__` (`docker/env.sh`) |

Префикс `/api/analytics` прокси отрезает, как edge-nginx на стенде. Режим `mock|real` фиксируется при сборке
(`VITE_API_MODE`): в real-сборку мок-код не попадает.

```bash
docker build -t fkit-web-bi .                                   # real
docker build --build-arg API_MODE=mock -t fkit-web-bi:demo .    # демо без сервера
docker run -p 8080:80 -e ANALYTICS_API_URL=https://api.bi.kitexp.ru fkit-web-bi
```

## Контракт

- Источник истины — спеки бэкенда: [`openapi/analytics-api.yaml`](openapi/analytics-api.yaml),
  [`openapi/generator-api.yaml`](openapi/generator-api.yaml) (копии с `bi.kitexp.ru`, обновляются `npm run api:sync`).
- Типы генерируются `openapi-typescript` в `src/shared/api/generated/`, клиент — типизированный `openapi-fetch`
  (`src/shared/api/client.ts`): пути, параметры и тела проверяются компилятором. Bearer-токен из `/auth/login`
  подставляется middleware; на 401 — выход на страницу входа.
- `src/shared/api/contract.test.ts`: каждый маршрут мока существует в спеке бэкенда, а каждый ответ мока
  валидируется JSON Schema из спеки (Ajv 2020-12), включая ошибки, пагинацию и ручные инциденты.

## Генератор мок-данных (`src/shared/mocks`)

Детерминированный (seed в `config.ts`), ленивый — по суткам на машину, seed от `(machineId, дата)`.
1 предприятие, 3 линии, 12 машин (профили stable ≈ 85% RUN, average ≈ 74%, problem ≈ 55–60%), 10 причин, 90 дней истории.
Сущности и UUID — как в бэкенде (`fixtures/`).
**Состояние мок-базы хранится в localStorage** (`fkit-bi:mock-db:v3`, `shared/mocks/persist.ts`): предприятия, смены, линии, машины, компоненты, сигналы, правила, причины, инциденты, сценарии и запуски генератора переживают перезагрузку. Сохранение — после каждой записывающей операции, сброс — «Сбросить демо-данные» в меню профиля (только в `mock`). Обеды 00:00/12:00, ТО по средам 14–16, переналадки в начале смены; RUN → IDLE/DOWN — марковская цепь с логнормальными
длительностями, ночью IDLE чаще; ~70% простоев с причиной. Сегодняшний день обрезан «сейчас», последний интервал открыт.
Ручные инциденты (причина и/или переопределение состояния SETUP/PLANNED_STOP) накладываются поверх с разрезанием интервалов и хранятся в localStorage. Все агрегаты (`calc/`) считаются по формулам
`src/shared/lib/metrics.ts` из тех же интервалов — KPI, диаграммы и хронометраж сходятся.

## Архитектура (Feature-Sliced Design)

```
src/
  app/       провайдеры, роутер (TanStack Router), тема, раскладка, реестр панелей
  pages/     portal (выбор предприятия), enterprise-overview, machine-dashboard, incidents,
             generator (сценарии и запуски), admin (предприятия, линии/машины, смены, причины, мастер)
  widgets/   machine-card, current-stats, losses-chart, chronometry, intervals-table,
             enterprise-kpi, state-map, machine-rating, sidebar-tree, app-header
  features/  period-filter, shift-filter, auto-refresh, register-incident, losses-drilldown
  entities/  enterprise, machine, loss-reason, incident
  shared/    api (контракт + клиент), mocks, ui (Panel, Chart, KpiTile, Dashboard), lib (формулы, смены, даты),
             config (env, палитра, пороги, схема URL), model (UI-состояние), i18n
```

- **Дашборд = конфиг** `{id, type, w}[]` (`pages/*/index.tsx`), тип → компонент в `app/dashboard-registry.ts`.
  Новая диаграмма — папка в `widgets/` и строка в реестре; виджеты грузятся лениво.
- **Panel** берёт на себя заголовок, меню (на весь экран, CSV, таблица), скелетон, «нет данных», ошибку с повтором.
- **Chart** — тонкая обёртка над ECharts (модульный импорт, темы из дизайн-токенов, общий курсор, выделение по X).
- **«Сейчас»** фиксируется в `shared/model/refresh.ts`; автообновление и кнопка «Обновить» сдвигают его —
  все панели перезапрашиваются согласованно. После ввода инцидента инвалидируются аналитика, интервалы и инциденты.
- Границы слоёв и запрет прямого `fetch` проверяет ESLint (`eslint.config.js`).

## Что ещё не сделано

Виджет «Динамика» (`/analytics/metrics/timeseries`
уже замокан), перерасчёты состояний, react-grid-layout, Storybook, Playwright-скриншоты.

## Портал, администрирование, генерация

- `/` — портал, стартовая страница после входа (`/portal` перенаправляет на `/`), обзор выбранного предприятия — `/overview`: карточки предприятий (доля работы за 24 ч, линии, машины, распределение
  по состояниям), плитки «Журнал инцидентов», «Генерация данных», «Администрирование». Выбор предприятия запоминается
  (`useEnterpriseChoice`), `useEnterpriseTree` берёт выбранное, иначе первое активное. В шапке кнопка «Все предприятия».
- `/admin` — CRUD предприятий, линий, машин (паспорт, компоненты, сигналы, правила состояний), смен, причин потерь;
  отключение вместо удаления; правка только для роли «Администратор», остальным — просмотр. Прежний пошаговый мастер — вкладка «Мастер настройки».
- `/generator` — сценарии (машины, базовое поведение сигналов, фазы, переопределения; проверка и активация) и запуски
  (REALTIME / HISTORICAL / SCHEDULED, проверка с оценкой объёма, стоп, повтор, прогресс поллингом).
- «Быстрая генерация» (кнопка на `/generator` и шаг «Данные для отчётов» в настройке): выбор машин, история за 1–30 суток
  или реальное время, профиль (стабильная / типовая / проблемная). Сценарий строится из правил состояний машин
  (`features/quick-generate/build.ts`), у машин без правил фазы не различаются — сначала настройте правила.
- В `mock`-режиме Generator и админские запросы обслуживает MSW (`mocks/handlers/generator.ts`, `admin.ts`); на `stand`
  эти страницы пишут в реальный бэкенд.

## Навигация (каркас)

Единая шапка во всех разделах: логотип → портал, разделы «Портал / Мониторинг / Инциденты / Генерация / Администрирование»
(на узких экранах — выпадающее меню), переключатель предприятия, роль, тема, профиль. Сайдбар с деревом машин, фильтры
периода и киоск есть только в мониторинге (`/overview`, `/machines/*`, `/incidents`); портал и администрирование работают
и без выбранного предприятия.

## Адаптивность

Сетка дашборда — container queries (Mantine Grid `type="container"`): панели перестраиваются по ширине
области контента, а не окна. Меньше 900 px — сайдбар становится выезжающим меню, фильтры периода
переносятся в отдельную строку, модальные окна на телефоне — на весь экран; от 2560 px масштаб интерфейса ×1.25.
