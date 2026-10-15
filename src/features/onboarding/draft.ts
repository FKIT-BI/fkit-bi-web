import type { ComponentKind, MachineStateConfigurationInput, SignalKind, SignalValueType } from '@/shared/api';
import type { SignalTemplate } from './templates';

/** Шаги мастера (спецификация онбординга, 4.1). */
export const STEPS = [
  { title: 'Предприятие', short: 'Завод и часовой пояс' },
  { title: 'Смены и причины', short: 'Когда работаем и почему стоим' },
  { title: 'Линия', short: 'Группа машин' },
  { title: 'Машина', short: 'Название и норма' },
  { title: 'Сигналы', short: 'Что машина передаёт' },
  { title: 'Состояние', short: 'Как понять, что работает' },
  { title: 'Запуск', short: 'Проверка и подключение' },
] as const;

export const LAST_STEP = STEPS.length - 1;

export interface ComponentDraft {
  key: string;
  id?: string | null;
  name: string;
  kind: ComponentKind;
}

export interface SignalDraft {
  key: string;
  /** id сохранённого сигнала; пусто — ещё не создан. */
  id?: string | null;
  code?: string | null;
  templateId: string;
  name: string;
  /** Ключ узла из `components`; '' — вся машина. */
  componentKey: string;
  semanticCode: string;
  customSemanticCode: string;
  valueType: SignalValueType;
  signalKind: SignalKind;
  unitCode: string;
  staleAfterMs: number | '';
  expectedIntervalMs: number | '';
  validMin: number | '';
  validMax: number | '';
  featured: boolean;
  /** После первых данных менять смысл сигнала нельзя. */
  locked?: boolean;
  /** Сигнал машины-образца, из которого скопирован (для переноса правил). */
  sourceSignalId?: string | null;
}

export interface MachineFields {
  name: string;
  machineType: string;
  nominalRate: number | '';
  productionUnit: string;
  inventoryNo: string;
  manufacturer: string;
  model: string;
  year: number | '';
}

export interface WizardDraft {
  step: number;
  /** Шаги, сохранённые на сервере. */
  saved: number[];
  enterpriseMode: 'existing' | 'new';
  enterpriseId: string;
  /** Предприятие создано этим мастером — шаг 1 правит его, а не создаёт заново. */
  enterpriseCreated: boolean;
  enterpriseName: string;
  timezone: string;
  shiftTemplate: string;
  customShifts: Array<{ name: string; start: string; end: string }>;
  addReasons: boolean;
  lineMode: 'existing' | 'new' | 'none';
  lineId: string;
  lineCreated: boolean;
  lineName: string;
  machineId: string;
  machine: MachineFields;
  components: ComponentDraft[];
  signals: SignalDraft[];
  /** Сохранённые сигналы, убранные из списка: при сохранении шага отключаются. */
  removedSignalIds: string[];
  /** Машина-образец: её правила переносятся на новые сигналы. */
  copyFromMachineId: string;
  rules: MachineStateConfigurationInput | null;
}

export const EMPTY_MACHINE: MachineFields = { name: '', machineType: '', nominalRate: '', productionUnit: '', inventoryNo: '', manufacturer: '', model: '', year: '' };

export function emptyDraft(): WizardDraft {
  return {
    step: 0,
    saved: [],
    enterpriseMode: 'existing',
    enterpriseId: '',
    enterpriseCreated: false,
    enterpriseName: '',
    timezone: '',
    shiftTemplate: 'two12',
    customShifts: [],
    addReasons: true,
    lineMode: 'existing',
    lineId: '',
    lineCreated: false,
    lineName: '',
    machineId: '',
    machine: EMPTY_MACHINE,
    components: [],
    signals: [],
    removedSignalIds: [],
    copyFromMachineId: '',
    rules: null,
  };
}

/** Черновик для следующей машины на той же линии: предприятие, смены и линия уже настроены. */
export function nextMachineDraft(d: WizardDraft): WizardDraft {
  return { ...emptyDraft(), enterpriseId: d.enterpriseId, lineMode: d.lineMode === 'none' ? 'none' : 'existing', lineId: d.lineId, step: 3, saved: [0, 1, 2], copyFromMachineId: d.machineId };
}

export const DRAFT_KEY = 'fkit-bi-onboarding-draft';

export function loadDraft(): WizardDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...emptyDraft(), ...(JSON.parse(raw) as Partial<WizardDraft>) } : null;
  } catch {
    return null;
  }
}

export function storeDraft(d: WizardDraft | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // хранилище недоступно (приватный режим) — мастер работает без восстановления
  }
}

let seq = 0;
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function signalFromTemplate(t: SignalTemplate, unitCode: string | null, featured: boolean): SignalDraft {
  return {
    key: newKey('sig'),
    templateId: t.id,
    name: t.name,
    componentKey: '',
    semanticCode: t.semanticCode,
    customSemanticCode: '',
    valueType: t.valueType,
    signalKind: t.signalKind,
    unitCode: unitCode ?? '',
    staleAfterMs: 60_000,
    expectedIntervalMs: '',
    validMin: '',
    validMax: '',
    featured,
  };
}
