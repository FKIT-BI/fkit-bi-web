export const STATE_CODES = ['RUN', 'IDLE', 'DOWN', 'PLANNED_STOP', 'SETUP', 'OFFLINE'] as const;
export type StateCode = (typeof STATE_CODES)[number];

export type StateCategory = 'run' | 'unplanned' | 'planned' | 'offline';

export const STATE_META: Record<StateCode, { color: string; category: StateCategory }> = {
  RUN: { color: '#3fb950', category: 'run' },
  IDLE: { color: '#e3b341', category: 'unplanned' },
  DOWN: { color: '#f2555a', category: 'unplanned' },
  PLANNED_STOP: { color: '#4c8dff', category: 'planned' },
  SETUP: { color: '#8aa9ff', category: 'planned' },
  OFFLINE: { color: '#6e7681', category: 'offline' },
};

export const isStop = (s: StateCode) => s === 'IDLE' || s === 'DOWN';
export const isLoss = (s: StateCode) => s !== 'RUN' && s !== 'OFFLINE';

export const UNKNOWN_REASON = 'unknown';
export const UNKNOWN_REASON_COLOR = '#c678dd';
