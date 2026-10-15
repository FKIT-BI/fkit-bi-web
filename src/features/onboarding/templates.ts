import type { MeasurementUnit, SignalKind, SignalValueType } from '@/shared/api';
import { SEMANTIC_QUANTITY, type SignalSemantic } from '@/shared/i18n';

/**
 * Шаблоны сигналов (спецификация онбординга, 4.6): пользователь выбирает «что машина передаёт»,
 * а шаблон заполняет формат, характер, семантику, единицу и пороги свежести.
 */
export interface SignalTemplate {
  id: string;
  title: string;
  hint: string;
  /** Название нового сигнала по умолчанию. */
  name: string;
  semanticCode: SignalSemantic;
  valueType: SignalValueType;
  signalKind: SignalKind;
}

export const SIGNAL_TEMPLATES: SignalTemplate[] = [
  { id: 'running', title: 'Машина в работе', hint: 'Да/нет: машина сейчас работает', name: 'Машина в работе', semanticCode: 'OPERATING_FLAG', valueType: 'BOOLEAN', signalKind: 'STATE' },
  { id: 'alarm', title: 'Авария', hint: 'Да/нет: есть авария', name: 'Авария', semanticCode: 'ALARM_FLAG', valueType: 'BOOLEAN', signalKind: 'STATE' },
  { id: 'ready', title: 'Готовность', hint: 'Да/нет: машина готова к пуску', name: 'Готовность', semanticCode: 'READY_FLAG', valueType: 'BOOLEAN', signalKind: 'STATE' },
  { id: 'speed', title: 'Скорость', hint: 'Скорость линии или подачи', name: 'Скорость', semanticCode: 'LINEAR_SPEED', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  { id: 'rpm', title: 'Обороты', hint: 'Частота вращения вала или шпинделя', name: 'Обороты', semanticCode: 'ROTATIONAL_SPEED', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  { id: 'temperature', title: 'Температура', hint: 'Температура узла или среды', name: 'Температура', semanticCode: 'TEMPERATURE', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  { id: 'pressure', title: 'Давление', hint: 'Давление в системе', name: 'Давление', semanticCode: 'PRESSURE', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  { id: 'load', title: 'Нагрузка', hint: 'Загрузка машины, %', name: 'Нагрузка', semanticCode: 'LOAD_PERCENT', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  { id: 'current', title: 'Ток двигателя', hint: 'Потребляемый ток', name: 'Ток двигателя', semanticCode: 'CURRENT', valueType: 'DOUBLE', signalKind: 'GAUGE' },
  { id: 'output', title: 'Счётчик продукции', hint: 'Сколько изделий выпущено (растёт)', name: 'Выпуск', semanticCode: 'PRODUCTION_COUNT', valueType: 'LONG', signalKind: 'COUNTER' },
  { id: 'scrap', title: 'Счётчик брака', hint: 'Сколько изделий забраковано', name: 'Брак', semanticCode: 'SCRAP_COUNT', valueType: 'LONG', signalKind: 'COUNTER' },
  { id: 'mode', title: 'Режим работы', hint: 'Авто / ручной / наладка (код режима)', name: 'Режим работы', semanticCode: 'MACHINE_MODE', valueType: 'LONG', signalKind: 'STATE' },
];

export const CUSTOM_TEMPLATE_ID = 'custom';

/** Типичные типы машин и наборы сигналов, которые для них обычно передают. */
export const MACHINE_TYPE_SETS: Record<string, string[]> = {
  Экструдер: ['running', 'alarm', 'speed', 'temperature', 'output'],
  Пресс: ['running', 'alarm', 'pressure', 'output'],
  Термопластавтомат: ['running', 'alarm', 'temperature', 'pressure', 'output', 'scrap'],
  'Упаковочная машина': ['running', 'alarm', 'speed', 'output'],
  'Станок ЧПУ': ['running', 'alarm', 'rpm', 'load', 'output'],
  Конвейер: ['running', 'alarm', 'speed'],
  Миксер: ['running', 'alarm', 'rpm', 'current'],
  'Печатная машина': ['running', 'alarm', 'speed', 'output', 'scrap'],
  Ламинатор: ['running', 'alarm', 'speed', 'temperature'],
  'Резательная машина': ['running', 'alarm', 'speed', 'output'],
};

export const MACHINE_TYPES = Object.keys(MACHINE_TYPE_SETS);

/** Набор шаблонов для типа машины (без учёта регистра); пусто — тип неизвестен. */
export function templatesForMachineType(machineType: string | null | undefined): string[] {
  const t = machineType?.trim().toLowerCase();
  if (!t) return [];
  const key = MACHINE_TYPES.find((k) => k.toLowerCase() === t);
  return key ? MACHINE_TYPE_SETS[key] : [];
}

/** Единица из справочника для семантики (по `quantityCode`); null — подходящей нет. */
export function unitForSemantic(semanticCode: string, units: MeasurementUnit[]): string | null {
  const quantity = SEMANTIC_QUANTITY[semanticCode as SignalSemantic];
  if (!quantity) return null;
  return units.find((u) => u.quantityCode === quantity)?.code ?? null;
}

export const isNumeric = (t: SignalValueType) => t === 'DOUBLE' || t === 'LONG';
