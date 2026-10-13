# Epic 2: конфигурационное путешествие Web

## Изменения

- Добавлен вход через Analytics Auth API; access token хранится в `sessionStorage`. Bootstrap-пользователь не создаётся из интерфейса.
- Добавлены последовательные разделы предприятия, линий/машин, компонентов/сигналов и state configuration. Используются отдельные Analytics endpoints, без составного config request.
- Ввод сохраняется в `sessionStorage`; после 401 пользователь входит повторно и возвращается к черновику. Ошибки API, детали конфликтов и field errors отображаются рядом с формой.
- Состояния конфигурации можно проверить без записи, заменить атомарно и проверить readiness перед активацией машины.
- Клиентские схемы генерируются из Analytics OpenAPI и Auth OpenAPI через `npm run generate:api`.

## Состояние проверки

Типовая проверка и production build выполняются после завершения работы по Epic 2, как указано в его спецификации.

## Перенос в WEB-BI

Экран перенесён в раздел «Администрирование» (`src/pages/admin/EquipmentSetup.tsx`) на общий API-клиент
(`src/shared/api`, базовый путь `/api/analytics/api/v1`) и Mantine; шаги, тексты, черновик в `sessionStorage`
и тесты сохранены (`EquipmentSetup.test.tsx`). Типы генерируются `npm run generate:api` из `openapi/analytics-api.yaml`.
