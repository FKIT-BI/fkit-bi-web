import type { z } from 'zod';
import type { EnterpriseSchema, LineSchema, LossReasonSchema, MachineSchema } from '../../api/contract';
import type { ProfileId } from '../generate/profiles';

type Wire<S extends z.ZodType> = z.input<S>;
export type MockMachine = Wire<typeof MachineSchema> & { profile: ProfileId };

export const ENTERPRISE: Wire<typeof EnterpriseSchema> = {
  id: 'ent-1',
  name: 'Завод полимерной упаковки',
  timezone: 'Europe/Moscow',
  shiftSchedule: [
    { id: 'day', name: 'День', start: '08:00', end: '20:00' },
    { id: 'night', name: 'Ночь', start: '20:00', end: '08:00' },
  ],
};

export const LINES: Wire<typeof LineSchema>[] = [
  { id: 'line-1', enterpriseId: 'ent-1', name: 'Линия 1 — Экструзия', order: 1 },
  { id: 'line-2', enterpriseId: 'ent-1', name: 'Линия 2 — Печать и резка', order: 2 },
  { id: 'line-3', enterpriseId: 'ent-1', name: 'Линия 3 — Пакеты и упаковка', order: 3 },
];

export const LOSS_REASONS: Wire<typeof LossReasonSchema>[] = [
  { id: 'r-mech', name: 'Поломка механики', group: 'Неисправности', isPlanned: false, color: '#e5534b' },
  { id: 'r-elec', name: 'Отказ электрики', group: 'Неисправности', isPlanned: false, color: '#f0883e' },
  { id: 'r-jam', name: 'Замятие / обрыв', group: 'Неисправности', isPlanned: false, color: '#db61a2' },
  { id: 'r-material', name: 'Нет сырья', group: 'Организационные', isPlanned: false, color: '#d4a72c' },
  { id: 'r-operator', name: 'Нет оператора', group: 'Организационные', isPlanned: false, color: '#a371f7' },
  { id: 'r-quality', name: 'Ожидание ОТК', group: 'Организационные', isPlanned: false, color: '#39c5cf' },
  { id: 'r-cleaning', name: 'Чистка / уборка', group: 'Организационные', isPlanned: false, color: '#7ee787' },
  { id: 'r-setup', name: 'Переналадка', group: 'Плановые', isPlanned: true, color: '#8aa9ff' },
  { id: 'r-maintenance', name: 'ТО', group: 'Плановые', isPlanned: true, color: '#4c8dff' },
  { id: 'r-lunch', name: 'Обед', group: 'Плановые', isPlanned: true, color: '#2f5fbf' },
];

function machine(
  id: string,
  lineId: string,
  order: number,
  name: string,
  type: string,
  nominalRate: number,
  profile: ProfileId,
  extra: { manufacturer: string; year: number },
): MockMachine {
  const tagBase = `ns=2;s=${lineId.toUpperCase()}.${id.toUpperCase()}`;
  return {
    id,
    lineId,
    order,
    name,
    type,
    inventoryNo: `ИН-${id.replace(/\D/g, '').padStart(5, '0')}`,
    nominalRate,
    archived: false,
    profile,
    params: [
      { label: 'Тип', value: type },
      { label: 'Производитель', value: extra.manufacturer },
      { label: 'Год ввода', value: String(extra.year) },
      { label: 'Номинальная скорость', value: `${nominalRate.toLocaleString('ru-RU')} шт/ч` },
    ],
    opcTags: [
      { tag: `${tagBase}.Speed`, signal: 'speed', label: 'Скорость', unit: 'шт/ч', min: 0, max: Math.round(nominalRate * 1.2) },
      { tag: `${tagBase}.Load`, signal: 'load', label: 'Загрузка', unit: '%', min: 0, max: 120 },
      { tag: `${tagBase}.Temp`, signal: 'temperature', label: 'Температура', unit: '°C', min: 0, max: 120 },
      { tag: `${tagBase}.Counter`, signal: 'counter', label: 'Счётчик за смену', unit: 'шт', min: 0, max: nominalRate * 12 },
    ],
    stateRules: [
      { state: 'IDLE', rule: 'скорость < 5% номинала дольше 2 мин' },
      { state: 'DOWN', rule: 'сигнал аварии = 1' },
      { state: 'OFFLINE', rule: 'нет данных с OPC дольше 5 мин' },
    ],
    thresholds: { availability: { good: 0.85, warn: 0.6 } },
  };
}

export const MACHINES: MockMachine[] = [
  machine('m-101', 'line-1', 1, 'Экструдер ЭК-1', 'Экструдер', 1200, 'stable', { manufacturer: 'Reifenhäuser', year: 2018 }),
  machine('m-102', 'line-1', 2, 'Экструдер ЭК-2', 'Экструдер', 1200, 'problem', { manufacturer: 'Reifenhäuser', year: 2011 }),
  machine('m-103', 'line-1', 3, 'Охладитель ОХ-1', 'Охладитель', 1500, 'stable', { manufacturer: 'Frigel', year: 2019 }),
  machine('m-104', 'line-1', 4, 'Намотчик НМ-1', 'Намотчик', 1400, 'average', { manufacturer: 'Kampf', year: 2015 }),
  machine('m-201', 'line-2', 1, 'Флексопечать ФП-1', 'Флексопечатная машина', 900, 'average', { manufacturer: 'W&H', year: 2016 }),
  machine('m-202', 'line-2', 2, 'Резчик РЗ-1', 'Бобинорезка', 1000, 'stable', { manufacturer: 'Kampf', year: 2020 }),
  machine('m-203', 'line-2', 3, 'Резчик РЗ-2', 'Бобинорезка', 1000, 'problem', { manufacturer: 'Atlas', year: 2009 }),
  machine('m-204', 'line-2', 4, 'Ламинатор ЛМ-1', 'Ламинатор', 800, 'average', { manufacturer: 'Nordmeccanica', year: 2014 }),
  machine('m-301', 'line-3', 1, 'Пакетоделательная ПД-1', 'Пакетоделательная машина', 3000, 'stable', { manufacturer: 'Hemingstone', year: 2021 }),
  machine('m-302', 'line-3', 2, 'Пакетоделательная ПД-2', 'Пакетоделательная машина', 3000, 'average', { manufacturer: 'Hemingstone', year: 2017 }),
  machine('m-303', 'line-3', 3, 'Упаковщик УП-1', 'Упаковочный автомат', 2400, 'problem', { manufacturer: 'Ulma', year: 2012 }),
  machine('m-304', 'line-3', 4, 'Паллетайзер ПЛ-1', 'Паллетайзер', 600, 'stable', { manufacturer: 'Fanuc', year: 2022 }),
];
