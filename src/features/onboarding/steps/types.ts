import type { WizardDraft } from '../draft';

/** Сохранение шага: пустой список — успех, иначе тексты ошибок для пользователя. */
export type StepSave = () => Promise<string[]>;

export interface StepProps {
  draft: WizardDraft;
  patch: (p: Partial<WizardDraft>) => void;
  /** Шаг сообщает мастеру, как себя сохранить (вызывается на каждой отрисовке). */
  register: (save: StepSave) => void;
  goTo: (step: number) => void;
  /** Начать следующую машину на той же линии. */
  onNextMachine?: () => void;
}

/** Ключи запросов совпадают с админкой, чтобы кэш и обновление после сохранения были общими. */
export const sk = (...parts: string[]) => ['setup', ...parts] as const;
