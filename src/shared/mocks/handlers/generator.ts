/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are untrusted input validated by hand */
import { HttpResponse } from 'msw';
import type { components } from '../../api/generated/generator';
import { toIso } from '../../lib/time';
import { db } from '../db';
import { registerPersisted, replaceArray } from '../persist';
import { signalsOf } from '../fixtures';
import { apiError, GEN_BASE, makeRoute, notFound, query } from './utils';

type G = components['schemas'];
const route = makeRoute(GEN_BASE);

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const PHASE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const MODELS = ['CONSTANT', 'UNIFORM', 'NORMAL', 'RAMP', 'SINE', 'COUNTER_RATE', 'PULSE', 'BERNOULLI', 'SEQUENCE'];
const ACTIVE = ['SCHEDULED', 'QUEUED', 'RUNNING', 'STOP_REQUESTED'];
const HISTORICAL_WALL_MS = 20_000;
const STOP_DELAY_MS = 2_000;
const MEASUREMENTS_PER_SEC = 12;

const iso = (ms: number) => toIso(ms, db.tz());
const body = async (r: Request) => ((await r.json().catch(() => ({}))) ?? {}) as Record<string, any>;
const invalid = (fieldErrors: G['FieldError'][]) => apiError(422, 'VALIDATION_FAILED', 'Request body is invalid', fieldErrors);
const conflict = (code: string, message: string) => apiError(409, code, message);

interface MockRun {
  id: string;
  scenarioId: string;
  enterpriseId: string;
  mode: G['RunMode'];
  attemptNo: number;
  randomSeed: number;
  requestedAt: number;
  scheduledStartAt: number | null;
  startedAt: number | null;
  durationMs: number | null;
  eventFrom: number | null;
  eventTo: number | null;
  machineIds: string[];
  stopRequestedAt: number | null;
  cancelled: boolean;
  failure: G['RunFailure'] | null;
  idempotency: { key: string; fingerprint: string } | null;
}

const uuid = (n: number) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const seedMachines = [db.machines[0], db.machines[1]];

const demoSignal = (m: (typeof db.machines)[number], code: string) => signalsOf(m).find((s) => s.code === code)!.id;
const gb = (extra: object) => ({ generationIntervalMs: 5000, sourceQuality: 'GOOD', missingProbability: 0, ...extra }) as G['BehaviorConfiguration'];

const scenarios: G['ScenarioDetail'][] = [
  {
    id: uuid(1),
    enterpriseId: db.enterprises[0].id,
    code: 'EXTRUSION_DEMO',
    name: 'Экструзия: норма и перегрев',
    description: 'Нормальная работа линии, затем перегрев и остановка',
    status: 'ACTIVE',
    cycleMode: 'LOOP',
    machineTargets: seedMachines.map((m) => ({
      machineId: m.id,
      baseBehaviors: [
        { signalId: demoSignal(m, 'SPEED'), behavior: gb({ model: 'NORMAL', mean: m.nominalRate, standardDeviation: 20 }) },
        { signalId: demoSignal(m, 'TEMPERATURE'), behavior: gb({ model: 'NORMAL', mean: 65, standardDeviation: 2 }) },
      ],
    })),
    phases: [
      { code: 'NORMAL', name: 'Нормальная работа', durationMs: 600_000, expectedState: 'RUN', behaviorOverrides: [] },
      {
        code: 'OVERHEAT',
        name: 'Перегрев',
        durationMs: 180_000,
        expectedState: 'DOWN',
        behaviorOverrides: [
          { signalId: demoSignal(seedMachines[0], 'TEMPERATURE'), action: 'REPLACE', behavior: gb({ model: 'RAMP', from: 65, to: 110, durationMs: 180_000, repeat: false }) },
        ],
      },
    ],
    validation: { valid: true, errorCount: 0, warningCount: 0, issues: [] },
    createdAt: iso(Date.now() - 86_400_000),
    updatedAt: iso(Date.now() - 86_400_000),
  },
  {
    id: uuid(2),
    enterpriseId: db.enterprises[0].id,
    code: 'NIGHT_IDLE',
    name: 'Ночные простои',
    description: null,
    status: 'DISABLED',
    cycleMode: 'ONCE',
    machineTargets: [{ machineId: db.machines[2].id, baseBehaviors: [] }],
    phases: [{ code: 'IDLE', name: 'Простой', durationMs: 3_600_000, expectedState: 'IDLE', behaviorOverrides: [] }],
    validation: { valid: true, errorCount: 0, warningCount: 1, issues: [{ severity: 'WARNING', code: 'NO_BASE_BEHAVIORS', path: 'machineTargets[0].baseBehaviors', message: 'У машины нет поведений сигналов — телеметрия не будет сформирована' }] },
    createdAt: iso(Date.now() - 3 * 86_400_000),
    updatedAt: iso(Date.now() - 3 * 86_400_000),
  },
];

const runs: MockRun[] = [];

registerPersisted('generator', {
  save: () => ({ scenarios, runs }),
  load: (v) => {
    const s = v as { scenarios?: unknown; runs?: unknown };
    replaceArray(scenarios, s.scenarios);
    replaceArray(runs, s.runs);
  },
});

const err = (severity: G['IssueSeverity'], code: string, path: string, message: string): G['ValidationIssue'] => ({ severity, code, path, message });

function validateScenario(b: Record<string, any>, selfId?: string): G['ScenarioValidationResult'] {
  const issues: G['ValidationIssue'][] = [];
  const targets: any[] = Array.isArray(b.machineTargets) ? b.machineTargets : [];
  const phases: any[] = Array.isArray(b.phases) ? b.phases : [];
  if (!targets.length) issues.push(err('ERROR', 'NO_MACHINES', 'machineTargets', 'Выберите хотя бы одну машину'));
  if (!phases.length) issues.push(err('ERROR', 'NO_PHASES', 'phases', 'Добавьте хотя бы одну фазу'));
  const seen = new Set<string>();
  targets.forEach((t, i) => {
    const m = db.machines.find((x) => x.id === t.machineId);
    if (!m) return void issues.push(err('ERROR', 'MACHINE_NOT_FOUND', `machineTargets[${i}].machineId`, 'Машина не найдена'));
    if (seen.has(m.id)) issues.push(err('ERROR', 'DUPLICATE_MACHINE', `machineTargets[${i}].machineId`, 'Машина указана дважды'));
    seen.add(m.id);
    if (m.status !== 'ACTIVE') issues.push(err('ERROR', 'MACHINE_NOT_ACTIVE', `machineTargets[${i}].machineId`, `Машина ${m.code} не активна`));
    const known = new Set(db.signals(m).map((s) => s.id));
    (t.baseBehaviors ?? []).forEach((bb: any, j: number) => {
      if (!known.has(bb.signalId)) issues.push(err('ERROR', 'SIGNAL_NOT_FOUND', `machineTargets[${i}].baseBehaviors[${j}].signalId`, 'Сигнал не найден у этой машины'));
      if (!MODELS.includes(bb.behavior?.model)) issues.push(err('ERROR', 'INVALID_MODEL', `machineTargets[${i}].baseBehaviors[${j}].behavior.model`, 'Неизвестная модель поведения'));
    });
    if (!(t.baseBehaviors ?? []).length) issues.push(err('WARNING', 'NO_BASE_BEHAVIORS', `machineTargets[${i}].baseBehaviors`, 'У машины нет поведений сигналов — телеметрия не будет сформирована'));
  });
  const codes = new Set<string>();
  phases.forEach((p, i) => {
    if (!PHASE_CODE.test(p.code ?? '')) issues.push(err('ERROR', 'INVALID_CODE', `phases[${i}].code`, 'Код фазы: A–Z, цифры и _, с буквы'));
    if (codes.has(p.code)) issues.push(err('ERROR', 'DUPLICATE_PHASE', `phases[${i}].code`, 'Код фазы повторяется'));
    codes.add(p.code);
    if (!(p.durationMs >= 1000)) issues.push(err('ERROR', 'INVALID_DURATION', `phases[${i}].durationMs`, 'Длительность не меньше 1 секунды'));
  });
  void selfId;
  const errorCount = issues.filter((x) => x.severity === 'ERROR').length;
  return { valid: errorCount === 0, errorCount, warningCount: issues.length - errorCount, issues };
}

function checkScenarioHeader(b: Record<string, any>, withCode: boolean) {
  const errors: G['FieldError'][] = [];
  if (withCode) {
    if (!db.enterprises.some((e) => e.id === b.enterpriseId)) errors.push({ path: 'enterpriseId', code: 'NOT_FOUND', message: 'Предприятие не найдено' });
    if (!CODE.test(b.code ?? '')) errors.push({ path: 'code', code: 'INVALID_CODE', message: 'Код: A–Z, цифры и _, от 2 символов, с буквы' });
  }
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200) errors.push({ path: 'name', code: 'INVALID_NAME', message: 'Название от 1 до 200 символов' });
  if (b.cycleMode !== 'ONCE' && b.cycleMode !== 'LOOP') errors.push({ path: 'cycleMode', code: 'INVALID_VALUE', message: 'ONCE или LOOP' });
  return errors;
}

const toSummary = (s: G['ScenarioDetail']): G['ScenarioSummary'] => ({
  id: s.id,
  enterpriseId: s.enterpriseId,
  code: s.code,
  name: s.name,
  status: s.status,
  cycleMode: s.cycleMode,
  machineCount: s.machineTargets.length,
  phaseCount: s.phases.length,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

function view(r: MockRun, now = Date.now()) {
  let status: G['RunStatus'];
  let finishedAt: number | null = null;
  let progressPercent: number | null = null;
  let elapsed = 0;
  const start = r.startedAt ?? r.scheduledStartAt ?? r.requestedAt;
  if (r.cancelled) {
    status = 'CANCELLED';
    finishedAt = r.stopRequestedAt;
  } else if (r.failure) {
    status = 'FAILED';
    finishedAt = Date.parse(r.failure.failedAt);
  } else if (r.scheduledStartAt && now < r.scheduledStartAt) {
    status = 'SCHEDULED';
  } else {
    const begin = r.scheduledStartAt ?? r.startedAt ?? r.requestedAt;
    const wall = r.mode === 'HISTORICAL' ? HISTORICAL_WALL_MS : r.durationMs;
    elapsed = Math.max(0, now - begin);
    const end = wall ? begin + wall : null;
    if (r.stopRequestedAt) {
      const stopAt = r.stopRequestedAt + STOP_DELAY_MS;
      if (now < stopAt) status = 'STOP_REQUESTED';
      else {
        status = 'STOPPED';
        finishedAt = stopAt;
        elapsed = Math.max(0, stopAt - begin);
      }
    } else if (end && now >= end) {
      status = 'COMPLETED';
      finishedAt = end;
      elapsed = wall!;
    } else {
      status = 'RUNNING';
    }
    if (wall) progressPercent = Math.min(100, (elapsed / wall) * 100);
  }
  const scenario = scenarios.find((s) => s.id === r.scenarioId);
  const generated = Math.round((elapsed / 1000) * MEASUREMENTS_PER_SEC * r.machineIds.length);
  const phases = scenario?.phases ?? [];
  const cycleMs = phases.reduce((a, p) => a + p.durationMs, 0) || 1;
  let phaseCode: string | null = null;
  if (status === 'RUNNING' || status === 'STOP_REQUESTED') {
    let off = (r.mode === 'HISTORICAL' ? (elapsed / HISTORICAL_WALL_MS) * ((r.eventTo ?? 0) - (r.eventFrom ?? 0)) : elapsed) % cycleMs;
    for (const p of phases) {
      if (off < p.durationMs) {
        phaseCode = p.code;
        break;
      }
      off -= p.durationMs;
    }
  }
  const generatedThrough =
    r.mode === 'HISTORICAL' && r.eventFrom && r.eventTo
      ? iso(r.eventFrom + (progressPercent ?? 0) / 100 * (r.eventTo - r.eventFrom))
      : elapsed ? iso(start + elapsed) : null;
  const progress: G['RunProgress'] = {
    currentPhaseCode: phaseCode,
    cycleNumber: Math.floor(elapsed / cycleMs),
    generatedThrough,
    progressPercent: progressPercent == null ? null : Math.round(progressPercent * 10) / 10,
    generatedMeasurements: generated,
    writtenMeasurements: generated,
    droppedMeasurements: 0,
    failedBatches: 0,
    lastSuccessfulWriteAt: generated ? iso(Math.min(now, finishedAt ?? now)) : null,
  };
  const startedAt = (status as G['RunStatus']) === 'SCHEDULED' || (status as G['RunStatus']) === 'QUEUED' ? null : (r.scheduledStartAt ?? r.startedAt ?? r.requestedAt);
  const common = {
    id: r.id,
    scenarioId: r.scenarioId,
    enterpriseId: r.enterpriseId,
    mode: r.mode,
    status,
    attemptNo: r.attemptNo,
    requestedAt: iso(r.requestedAt),
    scheduledStartAt: r.scheduledStartAt ? iso(r.scheduledStartAt) : null,
    startedAt: startedAt ? iso(startedAt) : null,
    finishedAt: finishedAt ? iso(finishedAt) : null,
    progress,
  };
  const summary: G['GenerationRunSummary'] = { ...common, machineCount: r.machineIds.length };
  const detail: G['GenerationRunDetail'] = {
    ...common,
    randomSeed: r.randomSeed,
    stopRequestedAt: r.stopRequestedAt ? iso(r.stopRequestedAt) : null,
    eventFrom: r.eventFrom ? iso(r.eventFrom) : null,
    eventTo: r.eventTo ? iso(r.eventTo) : null,
    machineIds: r.machineIds,
    checkpoint: generatedThrough && phaseCode ? { completedThrough: generatedThrough, phaseCode, cycleNumber: progress.cycleNumber, batchSequence: Math.floor(generated / 100) } : null,
    failure: r.failure,
    analyticsContext: {
      enterpriseId: r.enterpriseId,
      machineIds: r.machineIds,
      from: r.eventFrom ? iso(r.eventFrom) : startedAt ? iso(startedAt) : null,
      to: r.eventTo ? iso(r.eventTo) : null,
      generatedThrough,
    },
  };
  return { summary, detail, status };
}

function checkRun(b: Record<string, any>, self?: MockRun) {
  const issues: G['ValidationIssue'][] = [];
  const conflicts: G['RunConflict'][] = [];
  const now = Date.now();
  const scenario = scenarios.find((s) => s.id === b.scenarioId);
  let from: number | null = null;
  let to: number | null = null;
  let machineIds: string[] = [];
  if (!scenario) issues.push(err('ERROR', 'SCENARIO_NOT_FOUND', 'scenarioId', 'Сценарий не найден'));
  else {
    machineIds = scenario.machineTargets.map((t) => t.machineId);
    if (scenario.status !== 'ACTIVE') issues.push(err('ERROR', 'SCENARIO_NOT_ACTIVE', 'scenarioId', 'Сценарий отключён — сначала активируйте его'));
    if (!scenario.validation.valid) issues.push(err('ERROR', 'SCENARIO_INVALID', 'scenarioId', 'У сценария есть ошибки проверки'));
  }
  if (!['REALTIME', 'HISTORICAL', 'SCHEDULED'].includes(b.mode)) issues.push(err('ERROR', 'INVALID_MODE', 'mode', 'Недопустимый режим'));
  if (b.mode === 'HISTORICAL') {
    from = Date.parse(b.from);
    to = Date.parse(b.to);
    if (Number.isNaN(from) || Number.isNaN(to)) issues.push(err('ERROR', 'INVALID_PERIOD', 'from', 'Укажите период'));
    else {
      if (to <= from) issues.push(err('ERROR', 'INVALID_PERIOD', 'to', 'Конец периода должен быть позже начала'));
      if (to > now) issues.push(err('ERROR', 'PERIOD_IN_FUTURE', 'to', 'Исторический период не может заканчиваться в будущем'));
      if (to - from > 31 * 86_400_000) issues.push(err('ERROR', 'PERIOD_TOO_LONG', 'to', 'Не более 31 суток за запуск'));
    }
  } else if (b.mode === 'SCHEDULED') {
    const at = Date.parse(b.scheduledStartAt);
    if (Number.isNaN(at)) issues.push(err('ERROR', 'INVALID_START', 'scheduledStartAt', 'Укажите время старта'));
    else {
      from = at;
      if (at <= now) issues.push(err('ERROR', 'START_IN_PAST', 'scheduledStartAt', 'Время старта должно быть в будущем'));
    }
    if (b.durationMs != null && b.eventTo != null) issues.push(err('ERROR', 'DURATION_AND_END', 'durationMs', 'Укажите либо длительность, либо время окончания'));
    to = b.eventTo ? Date.parse(b.eventTo) : b.durationMs && from ? from + b.durationMs : null;
  } else if (b.mode === 'REALTIME') {
    from = now;
    to = b.durationMs ? now + b.durationMs : null;
  }
  if (b.durationMs != null && !(b.durationMs >= 1000)) issues.push(err('ERROR', 'INVALID_DURATION', 'durationMs', 'Длительность не меньше 1 секунды'));

  for (const other of runs) {
    if (other === self) continue;
    const v = view(other).detail;
    if (!ACTIVE.includes(v.status)) continue;
    const shared = other.machineIds.filter((id) => machineIds.includes(id));
    if (!shared.length) continue;
    const oFrom = other.scheduledStartAt ?? other.startedAt ?? other.requestedAt;
    const oTo = other.durationMs ? oFrom + other.durationMs : Infinity;
    if ((from ?? now) < oTo && (to ?? Infinity) > oFrom) {
      conflicts.push({ code: 'MACHINES_BUSY', machineIds: shared, from: iso(oFrom), to: oTo === Infinity ? null : iso(oTo), conflictingRunId: other.id });
    }
  }
  const spanMs = to && from ? to - from : null;
  const measurements = spanMs ? Math.round((spanMs / 1000) * MEASUREMENTS_PER_SEC * machineIds.length) : null;
  const result: G['RunValidationResult'] = {
    valid: !issues.some((i) => i.severity === 'ERROR') && !conflicts.length,
    mode: (['REALTIME', 'HISTORICAL', 'SCHEDULED'].includes(b.mode) ? b.mode : 'REALTIME') as G['RunMode'],
    normalizedFrom: from ? iso(from) : null,
    normalizedTo: to ? iso(to) : null,
    estimatedMeasurements: measurements,
    estimatedBatches: measurements == null ? null : Math.ceil(measurements / 500),
    estimatedWallDurationSeconds: b.mode === 'HISTORICAL' ? HISTORICAL_WALL_MS / 1000 : spanMs ? Math.round(spanMs / 1000) : null,
    issues,
    conflicts,
  };
  return { result, machineIds, from, to };
}

export const generatorHandlers = [
  route('get', '/scenarios', ({ request }) => {
    const q = query(request);
    const enterpriseId = q.str('enterpriseId');
    if (!enterpriseId) return apiError(400, 'BAD_REQUEST', 'enterpriseId обязателен');
    const status = q.str('status') ?? 'ACTIVE';
    const search = q.str('search')?.toLowerCase();
    const items = scenarios
      .filter((s) => s.enterpriseId === enterpriseId && s.status === status && (!search || `${s.code} ${s.name}`.toLowerCase().includes(search)))
      .map(toSummary);
    const size = Math.min(200, Math.max(1, q.int('size', 50)));
    const page = Math.max(0, q.int('page', 0));
    return HttpResponse.json({ items: items.slice(page * size, page * size + size), page, size, totalElements: items.length, totalPages: Math.ceil(items.length / size) });
  }),
  route('post', '/scenarios/validate', async ({ request }) => {
    const b = await body(request);
    const errors = checkScenarioHeader(b, true);
    if (errors.length) return apiError(400, 'BAD_REQUEST', 'Request body is invalid', errors);
    return HttpResponse.json(validateScenario(b));
  }),
  route('post', '/scenarios', async ({ request }) => {
    const b = await body(request);
    const errors = checkScenarioHeader(b, true);
    if (errors.length) return invalid(errors);
    if (scenarios.some((s) => s.enterpriseId === b.enterpriseId && s.code === b.code)) return conflict('DUPLICATE_CODE', 'Сценарий с таким кодом уже есть');
    const validation = validateScenario(b);
    if (!validation.valid) return invalid(validation.issues.filter((i) => i.severity === 'ERROR').map((i) => ({ path: i.path, code: i.code, message: i.message })));
    const s: G['ScenarioDetail'] = {
      id: crypto.randomUUID(),
      enterpriseId: b.enterpriseId,
      code: b.code,
      name: b.name,
      description: b.description ?? null,
      status: 'DISABLED',
      cycleMode: b.cycleMode,
      machineTargets: b.machineTargets,
      phases: b.phases,
      validation,
      createdAt: iso(Date.now()),
      updatedAt: iso(Date.now()),
    };
    scenarios.push(s);
    return HttpResponse.json(s, { status: 201 });
  }),
  route('get', '/scenarios/:scenarioId', ({ params }) => {
    const s = scenarios.find((x) => x.id === params.scenarioId);
    return s ? HttpResponse.json(s) : notFound('Сценарий');
  }),
  route('put', '/scenarios/:scenarioId', async ({ params, request }) => {
    const s = scenarios.find((x) => x.id === params.scenarioId);
    if (!s) return notFound('Сценарий');
    const b = await body(request);
    const errors = checkScenarioHeader(b, false);
    if (errors.length) return invalid(errors);
    const validation = validateScenario(b, s.id);
    if (!validation.valid) return invalid(validation.issues.filter((i) => i.severity === 'ERROR').map((i) => ({ path: i.path, code: i.code, message: i.message })));
    if (runs.some((r) => r.scenarioId === s.id && ACTIVE.includes(view(r).status))) return conflict('SCENARIO_IN_USE', 'Сценарий используется активным запуском');
    Object.assign(s, { name: b.name, description: b.description ?? null, cycleMode: b.cycleMode, machineTargets: b.machineTargets, phases: b.phases, validation, updatedAt: iso(Date.now()) });
    return HttpResponse.json(s);
  }),
  route('post', '/scenarios/:scenarioId/copy', async ({ params, request }) => {
    const source = scenarios.find((x) => x.id === params.scenarioId);
    if (!source) return notFound('Сценарий');
    const b = await body(request);
    const errors = checkScenarioHeader({ ...b, enterpriseId: source.enterpriseId, cycleMode: source.cycleMode }, true);
    if (errors.length) return invalid(errors);
    if (scenarios.some((s) => s.enterpriseId === source.enterpriseId && s.code === b.code)) return conflict('DUPLICATE_CODE', 'Сценарий с таким кодом уже есть');
    const copy: G['ScenarioDetail'] = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      code: b.code,
      name: b.name,
      description: b.description ?? source.description ?? null,
      status: 'DISABLED',
      validation: validateScenario(source),
      createdAt: iso(Date.now()),
      updatedAt: iso(Date.now()),
    };
    scenarios.push(copy);
    return HttpResponse.json(copy, { status: 201 });
  }),
  route('put', '/scenarios/:scenarioId/status', async ({ params, request }) => {
    const s = scenarios.find((x) => x.id === params.scenarioId);
    if (!s) return notFound('Сценарий');
    const status = (await body(request)).status;
    if (status !== 'ACTIVE' && status !== 'DISABLED') return invalid([{ path: 'status', code: 'INVALID_VALUE', message: 'ACTIVE или DISABLED' }]);
    if (status === 'ACTIVE') {
      const v = validateScenario(s);
      s.validation = v;
      if (!v.valid) return apiError(422, 'SCENARIO_INVALID', 'Сценарий не прошёл проверку', v.issues.filter((i) => i.severity === 'ERROR').map((i) => ({ path: i.path, code: i.code, message: i.message })));
    } else if (runs.some((r) => r.scenarioId === s.id && ACTIVE.includes(view(r).status))) {
      return conflict('SCENARIO_IN_USE', 'Сценарий используется активным запуском');
    }
    s.status = status;
    s.updatedAt = iso(Date.now());
    return HttpResponse.json(s);
  }),

  route('get', '/runs', ({ request }) => {
    const q = query(request);
    const enterpriseId = q.str('enterpriseId');
    if (!enterpriseId) return apiError(400, 'BAD_REQUEST', 'enterpriseId обязателен');
    const statuses = q.sp.getAll('status');
    const items = runs
      .filter((r) => r.enterpriseId === enterpriseId)
      .filter((r) => !q.str('scenarioId') || r.scenarioId === q.str('scenarioId'))
      .filter((r) => !q.str('machineId') || r.machineIds.includes(q.str('machineId')!))
      .filter((r) => !q.str('mode') || r.mode === q.str('mode'))
      .map((r) => view(r).summary)
      .filter((r) => !statuses.length || statuses.includes(r.status))
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
    const limit = Math.min(500, Math.max(1, q.int('limit', 100)));
    const offset = Number(q.str('cursor') ? atob(q.str('cursor')!) : 0);
    const next = offset + limit;
    return HttpResponse.json({ items: items.slice(offset, next), nextCursor: next < items.length ? btoa(String(next)) : null });
  }),
  route('post', '/runs/validate', async ({ request }) => {
    const b = await body(request);
    return HttpResponse.json(checkRun(b).result);
  }),
  route('post', '/runs', async ({ request }) => {
    const key = request.headers.get('Idempotency-Key');
    if (!key || key.length < 8 || key.length > 128) return apiError(400, 'BAD_REQUEST', 'Idempotency-Key обязателен (8–128 символов)');
    const b = await body(request);
    const fingerprint = JSON.stringify(b);
    const same = runs.find((r) => r.idempotency?.key === key);
    if (same) {
      if (same.idempotency!.fingerprint !== fingerprint) return conflict('IDEMPOTENCY_KEY_REUSED', 'Ключ идемпотентности уже использован с другим телом');
      return HttpResponse.json(view(same).detail, { status: 202 });
    }
    const { result, machineIds, from, to } = checkRun(b);
    if (result.issues.some((i) => i.code === 'SCENARIO_NOT_FOUND')) return notFound('Сценарий');
    if (result.conflicts.length) return conflict('MACHINES_BUSY', 'Машины заняты другим запуском');
    if (!result.valid) return invalid(result.issues.filter((i) => i.severity === 'ERROR').map((i) => ({ path: i.path, code: i.code, message: i.message })));
    const scenario = scenarios.find((s) => s.id === b.scenarioId)!;
    const now = Date.now();
    const r: MockRun = {
      id: crypto.randomUUID(),
      scenarioId: scenario.id,
      enterpriseId: scenario.enterpriseId,
      mode: b.mode,
      attemptNo: 1,
      randomSeed: b.randomSeed ?? Math.floor(Math.random() * 1_000_000),
      requestedAt: now,
      scheduledStartAt: b.mode === 'SCHEDULED' ? from : null,
      startedAt: b.mode === 'SCHEDULED' ? null : now,
      durationMs: b.mode === 'HISTORICAL' ? null : to && from ? to - from : null,
      eventFrom: b.mode === 'HISTORICAL' ? from : null,
      eventTo: b.mode === 'HISTORICAL' ? to : b.mode === 'SCHEDULED' ? to : null,
      machineIds,
      stopRequestedAt: null,
      cancelled: false,
      failure: null,
      idempotency: { key, fingerprint },
    };
    runs.push(r);
    return HttpResponse.json(view(r).detail, { status: 202 });
  }),
  route('get', '/runs/:runId', ({ params }) => {
    const r = runs.find((x) => x.id === params.runId);
    return r ? HttpResponse.json(view(r).detail) : notFound('Запуск');
  }),
  route('post', '/runs/:runId/stop', ({ params }) => {
    const r = runs.find((x) => x.id === params.runId);
    if (!r) return notFound('Запуск');
    const v = view(r);
    if (!ACTIVE.includes(v.status)) return HttpResponse.json(v.detail, { status: 200 });
    if (v.status === 'SCHEDULED') {
      r.cancelled = true;
      r.stopRequestedAt = Date.now();
      return HttpResponse.json(view(r).detail, { status: 200 });
    }
    r.stopRequestedAt ??= Date.now();
    return HttpResponse.json(view(r).detail, { status: 202 });
  }),
  route('post', '/runs/:runId/retry', ({ params }) => {
    const r = runs.find((x) => x.id === params.runId);
    if (!r) return notFound('Запуск');
    if (view(r).status !== 'FAILED' || !r.failure?.retryable) return conflict('RUN_NOT_RETRYABLE', 'Повторить можно только FAILED-запуск с retryable-ошибкой');
    r.failure = null;
    r.attemptNo += 1;
    r.startedAt = Date.now();
    r.scheduledStartAt = null;
    return HttpResponse.json(view(r).detail, { status: 202 });
  }),
];
