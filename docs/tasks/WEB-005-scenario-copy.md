# WEB-005 — копирование сценария генерации

## Scope

В списке сценариев (`/generator`, вкладка «Сценарии») у администратора появилась кнопка «Копировать».
Окно предлагает код `<КОД>_COPY` и название «… (копия)», описание можно оставить пустым — сервер возьмёт исходное.
После создания список переключается на отключённые сценарии и открывается редактор копии.

## Evidence

- Контракт синхронизирован с `fkit-bi-generator/docs/contracts/generator-api-draft.yaml` (`copyScenario`, `ScenarioCopy`),
  типы перегенерированы (`npm run api:generate`).
- Клиент: `gen.copyScenario`; мок MSW `POST /scenarios/:scenarioId/copy` (контрактный тест «моки ⊂ спека»).
- UI: `src/pages/generator/CopyScenarioModal.tsx`, `ScenariosTab.tsx`.

## Verification

- `npm test` (86), `npm run typecheck`, `npm run lint`, `npm run build`.
- Известная нестабильность до этой задачи: `contract.test.ts` → `MetricTimeseries` иногда даёт availability > 1 в моках
  (воспроизводится на develop без изменений).
