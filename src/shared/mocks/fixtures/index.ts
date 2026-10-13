import type { components } from '../../api/generated/analytics';
import type { ProfileId } from '../generate/profiles';

type S = components['schemas'];

const uuid = (prefix: number, n: number) =>
  `${String(prefix).padStart(8, '0')}-0000-0000-0000-${String(n).padStart(12, '0')}`;

const CREATED = '2026-06-01T00:00:00+03:00';
export const HISTORY_FROM = '2026-06-01T00:00:00+03:00';

export const ENTERPRISE_ID = uuid(10000000, 1);

export const ENTERPRISE: S['Enterprise'] = {
  id: ENTERPRISE_ID,
  code: 'FLEXO_01',
  name: 'Завод полимерной упаковки',
  timezone: 'Europe/Moscow',
  status: 'ACTIVE',
  createdAt: CREATED,
  updatedAt: CREATED,
};

export const SHIFTS: S['Shift'][] = [
  { code: 'DAY', name: 'День', start: '08:00', end: '20:00', n: 1 },
  { code: 'NIGHT', name: 'Ночь', start: '20:00', end: '08:00', n: 2 },
].map((s) => ({
  id: uuid(70000000, s.n),
  enterpriseId: ENTERPRISE_ID,
  code: s.code,
  name: s.name,
  startLocalTime: s.start,
  endLocalTime: s.end,
  validFrom: '2026-06-01',
  validTo: null,
  sortOrder: s.n,
  status: 'ACTIVE',
  used: true,
  createdAt: CREATED,
  updatedAt: CREATED,
}));

export const LINES: S['ProductionLine'][] = [
  { code: 'EXTRUSION', name: 'Линия 1 — Экструзия' },
  { code: 'PRINT_CUT', name: 'Линия 2 — Печать и резка' },
  { code: 'BAGS_PACK', name: 'Линия 3 — Пакеты и упаковка' },
].map((l, i) => ({
  id: uuid(20000000, i + 1),
  enterpriseId: ENTERPRISE_ID,
  code: l.code,
  name: l.name,
  sortOrder: i + 1,
  status: 'ACTIVE',
  createdAt: CREATED,
  updatedAt: CREATED,
}));

const REASON_DEFS = [
  ['r-mech', 'MECH_FAILURE', 'Поломка механики', 'EQUIPMENT', '#e5534b'],
  ['r-elec', 'ELEC_FAILURE', 'Отказ электрики', 'EQUIPMENT', '#f0883e'],
  ['r-jam', 'JAM', 'Замятие / обрыв', 'EQUIPMENT', '#db61a2'],
  ['r-material', 'NO_MATERIAL', 'Нет сырья', 'MATERIAL', '#d4a72c'],
  ['r-operator', 'NO_OPERATOR', 'Нет оператора', 'PERSONNEL', '#a371f7'],
  ['r-quality', 'QC_WAIT', 'Ожидание ОТК', 'QUALITY', '#39c5cf'],
  ['r-cleaning', 'CLEANING', 'Чистка / уборка', 'PROCESS', '#7ee787'],
  ['r-setup', 'CHANGEOVER', 'Переналадка', 'CHANGEOVER', '#8aa9ff'],
  ['r-maintenance', 'MAINTENANCE', 'ТО', 'EQUIPMENT', '#4c8dff'],
  ['r-lunch', 'LUNCH', 'Обед', 'OTHER', '#2f5fbf'],
] as const;

export type ReasonKey = (typeof REASON_DEFS)[number][0];

export const LOSS_REASONS: S['LossReason'][] = REASON_DEFS.map(([, code, name, category, color], i) => ({
  id: uuid(60000000, i + 1),
  enterpriseId: ENTERPRISE_ID,
  code,
  name,
  description: null,
  category,
  color,
  status: 'ACTIVE',
  used: true,
  createdAt: CREATED,
  updatedAt: CREATED,
}));

export const REASON_ID = Object.fromEntries(REASON_DEFS.map(([key], i) => [key, LOSS_REASONS[i].id])) as Record<
  ReasonKey,
  string
>;

export type MockMachine = S['Machine'] & { lineId: string; nominalRate: number; profile: ProfileId };

interface MachineDef {
  n: number;
  line: number;
  code: string;
  name: string;
  type: string;
  rate: number;
  profile: ProfileId;
  manufacturer: string;
  year: number;
  width: number;
}

const MACHINE_DEFS: MachineDef[] = [
  { n: 101, line: 1, code: 'EXTRUDER_1', name: 'Экструдер ЭК-1', type: 'Экструдер', rate: 1200, profile: 'stable', manufacturer: 'Reifenhäuser', year: 2018, width: 1600 },
  { n: 102, line: 1, code: 'EXTRUDER_2', name: 'Экструдер ЭК-2', type: 'Экструдер', rate: 1200, profile: 'problem', manufacturer: 'Reifenhäuser', year: 2011, width: 1600 },
  { n: 103, line: 1, code: 'COOLER_1', name: 'Охладитель ОХ-1', type: 'Охладитель', rate: 1500, profile: 'stable', manufacturer: 'Frigel', year: 2019, width: 1600 },
  { n: 104, line: 1, code: 'WINDER_1', name: 'Намотчик НМ-1', type: 'Намотчик', rate: 1400, profile: 'average', manufacturer: 'Kampf', year: 2015, width: 1600 },
  { n: 201, line: 2, code: 'FLEXO_1', name: 'Флексопечать ФП-1', type: 'Флексопечатная машина', rate: 900, profile: 'average', manufacturer: 'W&H', year: 2016, width: 1300 },
  { n: 202, line: 2, code: 'SLITTER_1', name: 'Резчик РЗ-1', type: 'Бобинорезка', rate: 1000, profile: 'stable', manufacturer: 'Kampf', year: 2020, width: 1300 },
  { n: 203, line: 2, code: 'SLITTER_2', name: 'Резчик РЗ-2', type: 'Бобинорезка', rate: 1000, profile: 'problem', manufacturer: 'Atlas', year: 2009, width: 1300 },
  { n: 204, line: 2, code: 'LAMINATOR_1', name: 'Ламинатор ЛМ-1', type: 'Ламинатор', rate: 800, profile: 'average', manufacturer: 'Nordmeccanica', year: 2014, width: 1300 },
  { n: 301, line: 3, code: 'BAG_MAKER_1', name: 'Пакетоделательная ПД-1', type: 'Пакетоделательная машина', rate: 3000, profile: 'stable', manufacturer: 'Hemingstone', year: 2021, width: 800 },
  { n: 302, line: 3, code: 'BAG_MAKER_2', name: 'Пакетоделательная ПД-2', type: 'Пакетоделательная машина', rate: 3000, profile: 'average', manufacturer: 'Hemingstone', year: 2017, width: 800 },
  { n: 303, line: 3, code: 'PACKER_1', name: 'Упаковщик УП-1', type: 'Упаковочный автомат', rate: 2400, profile: 'problem', manufacturer: 'Ulma', year: 2012, width: 600 },
  { n: 304, line: 3, code: 'PALLETIZER_1', name: 'Паллетайзер ПЛ-1', type: 'Паллетайзер', rate: 600, profile: 'stable', manufacturer: 'Fanuc', year: 2022, width: 1200 },
];

export const MACHINES: MockMachine[] = MACHINE_DEFS.map((m) => ({
  id: uuid(30000000, m.n),
  enterpriseId: ENTERPRISE_ID,
  lineId: LINES[m.line - 1].id,
  code: m.code,
  name: m.name,
  machineType: m.type,
  inventoryNo: `ИН-${String(m.n).padStart(5, '0')}`,
  manufacturer: m.manufacturer,
  model: null,
  commissioningYear: m.year,
  nominalRate: m.rate,
  productionUnit: 'шт',
  sortOrder: m.n % 100,
  status: 'ACTIVE',
  coverageFrom: HISTORY_FROM,
  parameters: [
    { code: 'MAX_WIDTH', name: 'Макс. ширина полотна', valueType: 'NUMBER', value: m.width, unitCode: 'мм', sortOrder: 1 },
    { code: 'SHIFT_CREW', name: 'Экипаж смены', valueType: 'NUMBER', value: m.profile === 'problem' ? 1 : 2, unitCode: 'чел', sortOrder: 2 },
  ],
  createdAt: CREATED,
  updatedAt: CREATED,
  profile: m.profile,
}));

export interface SignalDef {
  code: string;
  name: string;
  semanticCode: string;
  kind: S['SignalKind'];
  valueType: S['SignalValueType'];
  unit: string;
  max: (m: MockMachine) => number;
}

export const SIGNAL_DEFS: SignalDef[] = [
  { code: 'SPEED', name: 'Скорость', semanticCode: 'SPEED', kind: 'GAUGE', valueType: 'DOUBLE', unit: 'шт/ч', max: (m) => Math.round(m.nominalRate * 1.2) },
  { code: 'LOAD', name: 'Загрузка', semanticCode: 'LOAD', kind: 'GAUGE', valueType: 'DOUBLE', unit: '%', max: () => 120 },
  { code: 'TEMPERATURE', name: 'Температура', semanticCode: 'TEMPERATURE', kind: 'GAUGE', valueType: 'DOUBLE', unit: '°C', max: () => 120 },
  { code: 'OUTPUT_COUNTER', name: 'Счётчик выпуска', semanticCode: 'OUTPUT_COUNTER', kind: 'COUNTER', valueType: 'LONG', unit: 'шт', max: () => 1e9 },
];

export const signalsOf = (m: MockMachine): S['TelemetrySignal'][] =>
  SIGNAL_DEFS.map((s, i) => ({
    id: `40000000-0000-0000-0000-${m.id.slice(-6)}${String(i + 1).padStart(6, '0')}`,
    machineId: m.id,
    componentId: null,
    code: s.code,
    name: s.name,
    description: null,
    valueType: s.valueType,
    signalKind: s.kind,
    semanticCode: s.semanticCode,
    customSemanticCode: null,
    unitCode: s.unit,
    expectedIntervalMs: 5000,
    staleAfterMs: 60000,
    validMin: 0,
    validMax: s.max(m),
    featured: true,
    displayOrder: i + 1,
    status: 'ACTIVE',
    hasRawData: true,
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
