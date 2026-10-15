import type { BehaviorModel, RunMode, RunStatus } from '@/shared/api';
import { TELEMETRY_QUALITY } from '@/shared/i18n';

export const RUN_STATUS: Record<RunStatus, { label: string; color: string }> = {
  SCHEDULED: { label: 'Запланирован', color: 'indigo' },
  QUEUED: { label: 'В очереди', color: 'gray' },
  RUNNING: { label: 'Выполняется', color: 'blue' },
  STOP_REQUESTED: { label: 'Останавливается', color: 'orange' },
  COMPLETED: { label: 'Завершён', color: 'green' },
  STOPPED: { label: 'Остановлен', color: 'yellow' },
  CANCELLED: { label: 'Отменён', color: 'gray' },
  FAILED: { label: 'Ошибка', color: 'red' },
};

export const RUN_MODE: Record<RunMode, string> = {
  REALTIME: 'Реальное время',
  HISTORICAL: 'Исторический',
  SCHEDULED: 'По расписанию',
};

export const RUN_MODE_HINT: Record<RunMode, string> = {
  REALTIME: 'Телеметрия формируется сейчас и пишется по мере «прохождения» времени.',
  HISTORICAL: 'Телеметрия за прошедший период формируется быстро, целиком.',
  SCHEDULED: 'Запуск стартует в указанное время.',
};

export const CYCLE_MODE = { ONCE: 'Один проход', LOOP: 'По кругу' } as const;

export const MODEL_LABEL: Record<BehaviorModel, string> = {
  CONSTANT: 'Константа',
  UNIFORM: 'Равномерное распределение',
  NORMAL: 'Нормальное распределение',
  RAMP: 'Линейное изменение',
  SINE: 'Синусоида',
  COUNTER_RATE: 'Счётчик с приращением',
  PULSE: 'Импульсы вкл/выкл',
  BERNOULLI: 'Случайное да/нет',
  SEQUENCE: 'Последовательность значений',
};

export const QUALITY_LABEL = {
  GOOD: TELEMETRY_QUALITY.GOOD.label,
  UNCERTAIN: TELEMETRY_QUALITY.UNCERTAIN.label,
  BAD: TELEMETRY_QUALITY.BAD.label,
} as const;
