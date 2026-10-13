export interface Thresholds {
  good: number;
  warn: number;
}

export const DEFAULT_AVAILABILITY_THRESHOLDS: Thresholds = { good: 0.85, warn: 0.6 };

export type Level = 'good' | 'warn' | 'bad';

export function levelOf(value: number | null | undefined, t: Thresholds = DEFAULT_AVAILABILITY_THRESHOLDS): Level | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value >= t.good) return 'good';
  if (value >= t.warn) return 'warn';
  return 'bad';
}

export const LEVEL_COLOR: Record<Level, string> = {
  good: 'var(--mantine-color-green-6)',
  warn: 'var(--mantine-color-yellow-6)',
  bad: 'var(--mantine-color-red-6)',
};
