import { ApiError, formatApiError, setup, type Condition, type MachineStateConfigurationInput, type TelemetrySignal } from '@/shared/api';
import { fieldLabel } from '@/shared/i18n';
import { makeCode } from '@/shared/lib';
import { newKey, type ComponentDraft, type SignalDraft, type WizardDraft } from './draft';
import { reasonColor, SHIFT_TEMPLATES, TYPICAL_REASONS } from './presets';
import { isNumeric } from './templates';

/** Ошибка одного объекта шага: ключ строки и понятный текст. */
export interface ItemError {
  key: string;
  message: string;
}

/** Текст ошибки API с подписями полей: «Код: Сигнал с таким кодом уже есть». */
export function explain(e: unknown): string {
  if (e instanceof ApiError && e.fieldErrors.length) return e.fieldErrors.map((f) => (f.path ? `${fieldLabel(f.path)}: ${f.message}` : f.message)).join('; ');
  return formatApiError(e);
}

const isCodeConflict = (e: unknown) => e instanceof ApiError && e.status === 409 && (e.fieldErrors.some((f) => f.path === 'code') || /CODE/.test(e.body?.code ?? ''));

/** Создание с автокодом: при конфликте кода — один повтор с суффиксом (спецификация, 4.1). */
async function withCode<T>(name: string, prefix: string, taken: string[], create: (code: string) => Promise<T>): Promise<T> {
  const code = makeCode(name, prefix, taken);
  try {
    return await create(code);
  } catch (e) {
    if (!isCodeConflict(e)) throw e;
    return create(makeCode(name, prefix, [...taken, code]));
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- Шаг 1. Предприятие ----------

export async function saveEnterprise(d: WizardDraft): Promise<Partial<WizardDraft>> {
  if (d.enterpriseMode === 'existing') return { enterpriseCreated: false };
  if (d.enterpriseCreated && d.enterpriseId) {
    await setup.updateEnterprise(d.enterpriseId, { name: d.enterpriseName.trim(), timezone: d.timezone });
    return {};
  }
  const taken = (await setup.allEnterprises()).map((e) => e.code);
  const created = await withCode(d.enterpriseName, 'ENT', taken, (code) => setup.createEnterprise({ code, name: d.enterpriseName.trim(), timezone: d.timezone }));
  return { enterpriseId: created.id, enterpriseCreated: true };
}

// ---------- Шаг 2. Смены и причины ----------

export interface ShiftsResult {
  errors: ItemError[];
}

/** Создаёт смены по шаблону и типовые причины; уже существующие (по коду) пропускает — повтор безопасен. */
export async function saveShiftsAndReasons(d: WizardDraft): Promise<ShiftsResult> {
  const errors: ItemError[] = [];
  const shifts = await setup.shifts(d.enterpriseId);
  if (!shifts.some((s) => s.status === 'ACTIVE')) {
    const tpl = SHIFT_TEMPLATES.find((t) => t.id === d.shiftTemplate) ?? SHIFT_TEMPLATES[0];
    const list = tpl.id === 'custom' ? d.customShifts.map((s) => ({ code: '', ...s })) : tpl.shifts;
    const taken = shifts.map((s) => s.code);
    for (const [i, s] of list.entries()) {
      const code = makeCode(s.code || s.name, 'SHIFT', []);
      if (taken.includes(code)) continue;
      try {
        await setup.createShift(d.enterpriseId, { code, name: s.name.trim(), startLocalTime: s.start, endLocalTime: s.end, validFrom: today(), validTo: null, sortOrder: i });
        taken.push(code);
      } catch (e) {
        errors.push({ key: `shift-${i}`, message: `Смена «${s.name}»: ${explain(e)}` });
      }
    }
  }
  if (d.addReasons) {
    const reasons = await setup.lossReasons(d.enterpriseId);
    if (!reasons.length) {
      for (const r of TYPICAL_REASONS) {
        try {
          await setup.createLossReason(d.enterpriseId, { code: r.code, name: r.name, description: r.description ?? null, category: r.category, color: reasonColor(r.category) });
        } catch (e) {
          if (!isCodeConflict(e)) errors.push({ key: `reason-${r.code}`, message: `Причина «${r.name}»: ${explain(e)}` });
        }
      }
    }
  }
  return { errors };
}

// ---------- Шаг 3. Линия ----------

export async function saveLine(d: WizardDraft): Promise<Partial<WizardDraft>> {
  if (d.lineMode !== 'new') return { lineCreated: false, lineId: d.lineMode === 'none' ? '' : d.lineId };
  if (d.lineCreated && d.lineId) {
    const line = (await setup.allLines(d.enterpriseId)).find((l) => l.id === d.lineId);
    await setup.updateLine(d.lineId, { name: d.lineName.trim(), sortOrder: line?.sortOrder ?? 0 });
    return {};
  }
  const lines = await setup.allLines(d.enterpriseId);
  const created = await withCode(d.lineName, 'LINE', lines.map((l) => l.code), (code) => setup.createLine(d.enterpriseId, { code, name: d.lineName.trim(), sortOrder: lines.length }));
  return { lineId: created.id, lineCreated: true };
}

// ---------- Шаг 4. Машина ----------

const text = (s: string) => s.trim() || null;

export async function saveMachine(d: WizardDraft): Promise<Partial<WizardDraft>> {
  const m = d.machine;
  const common = {
    name: m.name.trim(),
    machineType: text(m.machineType),
    inventoryNo: text(m.inventoryNo),
    manufacturer: text(m.manufacturer),
    model: text(m.model),
    commissioningYear: m.year === '' ? null : Number(m.year),
    nominalRate: m.nominalRate === '' ? null : Number(m.nominalRate),
    productionUnit: text(m.productionUnit),
  };
  if (d.machineId) {
    const current = await setup.machine(d.machineId);
    await setup.updateMachine(d.machineId, { ...common, sortOrder: current.sortOrder ?? null, parameters: current.parameters });
    if (!current.lineId && d.lineId) await setup.assign(d.lineId, [d.machineId]);
    return {};
  }
  const machines = await setup.machines(d.enterpriseId);
  const created = await withCode(m.name, 'M', machines.map((x) => x.code), (code) =>
    setup.createMachine(d.enterpriseId, { code, lineId: d.lineId || null, sortOrder: machines.length, parameters: [], ...common }),
  );
  return { machineId: created.id };
}

// ---------- Шаг 5. Узлы и сигналы ----------

export interface SignalsResult {
  components: ComponentDraft[];
  signals: SignalDraft[];
  errors: ItemError[];
}

const num = (v: number | '') => (v === '' ? null : Number(v));

function signalBody(s: SignalDraft, componentId: string | null) {
  const numeric = isNumeric(s.valueType);
  return {
    componentId,
    name: s.name.trim(),
    description: null,
    valueType: s.valueType,
    signalKind: s.signalKind,
    semanticCode: s.semanticCode,
    customSemanticCode: s.semanticCode === 'CUSTOM' ? s.customSemanticCode || makeCode(s.name, 'CUSTOM') : null,
    unitCode: numeric ? s.unitCode || null : null,
    expectedIntervalMs: num(s.expectedIntervalMs),
    staleAfterMs: num(s.staleAfterMs),
    validMin: numeric ? num(s.validMin) : null,
    validMax: numeric ? num(s.validMax) : null,
    featured: s.featured,
  };
}

/**
 * Узлы, затем сигналы: новые создаются, сохранённые обновляются, убранные из списка — отключаются
 * (удаления в API нет). Ошибки собираются по строкам, успешные id сразу попадают в результат.
 */
export async function saveSignals(d: WizardDraft, removedIds: string[]): Promise<SignalsResult> {
  const errors: ItemError[] = [];
  const existingComponents = await setup.allComponents(d.machineId);
  const components = [...d.components];
  for (const [i, c] of components.entries()) {
    if (c.id || !d.signals.some((s) => s.componentKey === c.key)) continue;
    try {
      const created = await withCode(c.name, 'CMP', existingComponents.map((x) => x.code), (code) =>
        setup.createComponent(d.machineId, { code, name: c.name.trim(), kind: c.kind, parentComponentId: null, sortOrder: (existingComponents.length + i) * 10, parameters: [] }),
      );
      components[i] = { ...c, id: created.id };
      existingComponents.push(created);
    } catch (e) {
      errors.push({ key: c.key, message: `Узел «${c.name}»: ${explain(e)}` });
    }
  }
  const componentId = (key: string) => components.find((c) => c.key === key)?.id ?? null;
  const existing = await setup.allSignals(d.machineId);
  const taken = existing.map((s) => s.code);
  const signals = [...d.signals];
  for (const [i, s] of signals.entries()) {
    if (s.componentKey && !componentId(s.componentKey)) {
      errors.push({ key: s.key, message: `Сигнал «${s.name}»: сначала нужно сохранить его узел` });
      continue;
    }
    const body = signalBody(s, s.componentKey ? componentId(s.componentKey) : null);
    try {
      if (s.id) {
        const current = existing.find((x) => x.id === s.id);
        const locked = current?.hasRawData;
        await setup.updateSignal(s.id, locked && current ? { ...body, valueType: current.valueType, signalKind: current.signalKind, semanticCode: current.semanticCode, customSemanticCode: current.customSemanticCode ?? null, unitCode: current.unitCode ?? null } : body);
      } else {
        const created = await withCode(s.name, 'SIG', taken, (code) => setup.createSignal(d.machineId, { code, ...body, displayOrder: i }));
        taken.push(created.code);
        signals[i] = { ...s, id: created.id, code: created.code };
      }
    } catch (e) {
      errors.push({ key: s.key, message: `Сигнал «${s.name}»: ${explain(e)}` });
    }
  }
  for (const id of removedIds) {
    try {
      await setup.setSignalStatus(id, 'DISABLED');
    } catch (e) {
      const name = existing.find((x) => x.id === id)?.name ?? 'сигнал';
      errors.push({ key: id, message: `Не удалось отключить «${name}»: ${explain(e)}` });
    }
  }
  return { components, signals, errors };
}

// ---------- Копирование набора с другой машины ----------

/** Сигналы и узлы машины-образца как черновик (без id) — для «подключить ещё одну такую же». */
export async function copyFromMachine(machineId: string): Promise<{ components: ComponentDraft[]; signals: SignalDraft[] }> {
  const [components, signals] = await Promise.all([setup.allComponents(machineId), setup.allSignals(machineId)]);
  const keyOf = new Map<string, string>();
  const drafts: ComponentDraft[] = components
    .filter((c) => c.status === 'ACTIVE')
    .map((c) => {
      const key = newKey('cmp');
      keyOf.set(c.id, key);
      return { key, name: c.name, kind: c.kind };
    });
  return {
    components: drafts,
    signals: signals.filter((s) => s.status === 'ACTIVE').map((s) => ({ ...signalDraftOf(s, keyOf), key: newKey('sig'), id: null, code: null, locked: false, sourceSignalId: s.id })),
  };
}

function signalDraftOf(s: TelemetrySignal, componentKeys: Map<string, string>): SignalDraft {
  return {
    key: s.id,
    id: s.id,
    code: s.code,
    templateId: 'custom',
    name: s.name,
    componentKey: (s.componentId && componentKeys.get(s.componentId)) || '',
    semanticCode: s.semanticCode,
    customSemanticCode: s.customSemanticCode ?? '',
    valueType: s.valueType,
    signalKind: s.signalKind,
    unitCode: s.unitCode ?? '',
    staleAfterMs: s.staleAfterMs ?? '',
    expectedIntervalMs: s.expectedIntervalMs ?? '',
    validMin: s.validMin ?? '',
    validMax: s.validMax ?? '',
    featured: s.featured,
    locked: s.hasRawData,
  };
}

/** Правила образца с подменой сигналов на новые; правила с сигналами без пары отбрасываются. */
export function mapRules(cfg: MachineStateConfigurationInput, mapping: Map<string, string>): MachineStateConfigurationInput {
  const swap = (c: Condition): Condition | null => {
    if (c.type === 'COMPARE') {
      const id = mapping.get(c.signalId);
      return id ? { ...c, signalId: id } : null;
    }
    if (c.type === 'NOT') {
      const inner = swap(c.condition);
      return inner ? { ...c, condition: inner } : null;
    }
    const conditions = c.conditions.map(swap);
    return conditions.every(Boolean) ? { ...c, conditions: conditions as Condition[] } : null;
  };
  const rules = cfg.rules.flatMap((r) => {
    const enter = swap(r.enterCondition);
    const exit = r.exitCondition ? swap(r.exitCondition) : null;
    if (!enter || (r.exitCondition && !exit)) return [];
    return [{ ...r, id: null, enterCondition: enter, exitCondition: exit }];
  });
  return { defaultState: cfg.defaultState, offlineAfterMs: cfg.offlineAfterMs, rules };
}

// ---------- Продолжение настройки ----------

/** Черновик по данным сервера для уже созданной машины; шаг — первый незавершённый. */
export async function draftForMachine(machineId: string, base: WizardDraft): Promise<WizardDraft> {
  const machine = await setup.machine(machineId);
  const [components, signals, cfg] = await Promise.all([setup.allComponents(machineId), setup.allSignals(machineId), setup.stateConfig(machineId)]);
  const keyOf = new Map(components.map((c) => [c.id, c.id]));
  const activeSignals = signals.filter((s) => s.status === 'ACTIVE');
  const step = !activeSignals.length ? 4 : !cfg ? 5 : 6;
  return {
    ...base,
    step,
    saved: [0, 1, 2, 3, ...(activeSignals.length ? [4] : []), ...(cfg ? [5] : [])],
    enterpriseMode: 'existing',
    enterpriseId: machine.enterpriseId,
    lineMode: machine.lineId ? 'existing' : 'none',
    lineId: machine.lineId ?? '',
    machineId,
    machine: {
      name: machine.name,
      machineType: machine.machineType ?? '',
      nominalRate: machine.nominalRate ?? '',
      productionUnit: machine.productionUnit ?? '',
      inventoryNo: machine.inventoryNo ?? '',
      manufacturer: machine.manufacturer ?? '',
      model: machine.model ?? '',
      year: machine.commissioningYear ?? '',
    },
    components: components.filter((c) => c.status === 'ACTIVE').map((c) => ({ key: c.id, id: c.id, name: c.name, kind: c.kind })),
    signals: activeSignals.map((s) => signalDraftOf(s, keyOf)),
    rules: cfg ? { defaultState: cfg.defaultState, offlineAfterMs: cfg.offlineAfterMs, rules: cfg.rules } : null,
  };
}
