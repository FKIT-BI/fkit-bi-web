import type { LossCategory } from '@/shared/api';
import { CATEGORY_COLORS } from '@/shared/config';

export interface ShiftPreset {
  code: string;
  name: string;
  start: string;
  end: string;
}

export interface ShiftTemplate {
  id: string;
  title: string;
  hint: string;
  shifts: ShiftPreset[];
}

/** Шаблоны смен (спецификация онбординга, 4.3). Смена через полночь — конец меньше начала. */
export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { id: 'two12', title: 'Две смены по 12 ч', hint: 'День 08:00–20:00, Ночь 20:00–08:00', shifts: [{ code: 'DAY', name: 'День', start: '08:00', end: '20:00' }, { code: 'NIGHT', name: 'Ночь', start: '20:00', end: '08:00' }] },
  {
    id: 'three8',
    title: 'Три смены по 8 ч',
    hint: '07:00–15:00, 15:00–23:00, 23:00–07:00',
    shifts: [
      { code: 'SHIFT_1', name: '1-я смена', start: '07:00', end: '15:00' },
      { code: 'SHIFT_2', name: '2-я смена', start: '15:00', end: '23:00' },
      { code: 'SHIFT_3', name: '3-я смена', start: '23:00', end: '07:00' },
    ],
  },
  { id: 'one', title: 'Одна смена', hint: '08:00–17:00', shifts: [{ code: 'DAY', name: 'Дневная смена', start: '08:00', end: '17:00' }] },
  { id: 'custom', title: 'Настроить вручную', hint: 'Свои названия и время', shifts: [{ code: '', name: 'Смена 1', start: '08:00', end: '20:00' }] },
];

export interface ReasonPreset {
  code: string;
  name: string;
  category: LossCategory;
  description?: string;
}

/** Типовой справочник причин потерь: по одной-две на категорию. */
export const TYPICAL_REASONS: ReasonPreset[] = [
  { code: 'EQUIPMENT_FAILURE', name: 'Поломка оборудования', category: 'EQUIPMENT', description: 'Незапланированная остановка из-за неисправности' },
  { code: 'NO_MATERIAL', name: 'Нет сырья', category: 'MATERIAL' },
  { code: 'BAD_MATERIAL', name: 'Некачественное сырьё', category: 'MATERIAL' },
  { code: 'NO_OPERATOR', name: 'Нет оператора', category: 'PERSONNEL' },
  { code: 'PROCESS_TUNING', name: 'Наладка процесса', category: 'PROCESS' },
  { code: 'QUALITY_CHECK', name: 'Контроль качества, брак', category: 'QUALITY' },
  { code: 'CHANGEOVER', name: 'Переналадка на другой продукт', category: 'CHANGEOVER' },
  { code: 'NO_POWER', name: 'Нет электроэнергии или воздуха', category: 'EXTERNAL' },
  { code: 'OTHER', name: 'Прочее', category: 'OTHER' },
];

export const reasonColor = (c: LossCategory) => CATEGORY_COLORS[c] ?? null;
