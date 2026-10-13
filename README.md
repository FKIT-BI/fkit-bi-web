# FKIT-BI · WEB-BI

Веб-интерфейс аналитики простоев: по каждой машине — сколько времени она работала полезно, сколько простаивала и почему.
Этап моков: все запросы перехватывает MSW в браузере, данные генерирует сам фронтенд. Контракт API повторяет будущий BI-service.

## Запуск

```bash
npm install
npm run dev          # http://localhost:5173, VITE_API_MODE=mock
npm run dev:real     # против реального BI-service (.env.real)
npm run build        # статика в dist/ (режим из .env → mock)
npm test             # формулы, генератор, контракт (openapi.yaml ↔ моки ↔ Zod)
npm run api:lint     # валидация openapi.yaml (Redocly)
npm run lint         # ESLint + границы слоёв FSD
```

Полезные параметры адреса: `?range=today|shift|yesterday|7d|30d|custom&from=&to=`, `&shift=day|night`,
`&refresh=30s|1m|5m`, `&kiosk=1` (без сайдбара и шапки; Esc — выход), `&mockError=1` (аналитика отвечает 500).

## Моки ↔ бэкенд

- Режим задаётся **при сборке**: `VITE_API_MODE=mock|real`. В real-сборку мок-код не попадает (динамический импорт).
- Базовый URL API задаётся **при старте контейнера**: `API_BASE_URL` → `window.__ENV__` (`docker/env.sh`).
- Контракт: [`openapi.yaml`](openapi.yaml) — все 28 операций machine controller и calculate service
  (operationId, схемы запросов и ответов, ошибки 400/404/500). Зеркало на фронте —
  [`src/shared/api/contract.ts`](src/shared/api/contract.ts) (Zod), клиент — `src/shared/api/endpoints.ts`.
- `src/shared/api/contract.test.ts` проверяет, что каждая операция спеки реализована в моках (и наоборот),
  что ответы моков проходят Zod-схемы и что запись валидирует тело запроса.
  При появлении бэкенда клиент можно генерировать Orval из того же `openapi.yaml`.

```bash
docker build -t fkit-web-bi .                                   # real
docker build --build-arg API_MODE=mock -t fkit-web-bi:demo .    # демо без сервера
docker run -p 8080:80 -e API_BASE_URL=https://bi.example.local fkit-web-bi
```

## Генератор мок-данных (`src/shared/mocks`)

Детерминированный (seed в `config.ts`), ленивый — по суткам на машину, seed от `(machineId, дата)`.
1 предприятие, 3 линии, 12 машин (профили stable ≈ 85% RUN, average ≈ 74%, problem ≈ 55–60%), 10 причин, 90 дней истории.
Обеды 00:00/12:00, ТО по средам 14–16, переналадки в начале смены; RUN → IDLE/DOWN — марковская цепь с логнормальными
длительностями, ночью IDLE чаще; ~70% простоев с причиной. Сегодняшний день обрезан «сейчас», последний интервал открыт.
Инциденты накладываются поверх и хранятся в localStorage. Все агрегаты (`calc/`) считаются по формулам
`src/shared/lib/metrics.ts` из тех же интервалов — KPI, диаграммы и хронометраж сходятся.

## Архитектура (Feature-Sliced Design)

```
src/
  app/       провайдеры, роутер (TanStack Router), тема, раскладка, реестр панелей
  pages/     enterprise-overview, machine-dashboard, incidents, admin (заглушка)
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

Администрирование (CRUD предприятий, линий, машин, конфигурации, справочника), виджет «Динамика» (нет `kpi/timeseries`),
агрегат хронометража за несколько суток (сейчас перелистывание по дням), react-grid-layout (перетаскивание панелей),
Storybook, Playwright-скриншоты, генерация клиента Orval.

## Адаптивность

Сетка дашборда — container queries (Mantine Grid `type="container"`): панели перестраиваются по ширине
области контента, а не окна. Меньше 900 px — сайдбар становится выезжающим меню, фильтры периода
переносятся в отдельную строку, модальные окна на телефоне — на весь экран; от 2560 px масштаб интерфейса ×1.25.
