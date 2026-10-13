import type { StateCode } from '../../config/states';
import { addDaysToDate, atLocal, dayjs, dayStartMs, HOUR, MINUTE } from '../../lib/time';
import { MOCK_CONFIG } from '../config';
import type { MockMachine } from '../fixtures';
import { DURATION_LIMITS, PROFILES, type Profile } from './profiles';
import { lognormal, randInt, seededRandom, weightedPick, type Rnd } from './random';

export interface GenInterval {
  machineId: string;
  stateCode: StateCode;
  from: number;
  to: number;
  reasonId: string | null;
  speed: number;
}

function machineReasonWeights(machine: MockMachine, profile: Profile) {
  const rnd = seededRandom(`${MOCK_CONFIG.seed}:bias:${machine.id}`);
  const bias = (w: Record<string, number>) =>
    Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * (0.2 + 2 * rnd() ** 2)]));
  return { DOWN: bias(profile.reasonWeights.DOWN), IDLE: bias(profile.reasonWeights.IDLE) };
}
const weightsCache = new Map<string, ReturnType<typeof machineReasonWeights>>();

function sampleDuration(rnd: Rnd, profile: Profile, state: 'RUN' | 'IDLE' | 'DOWN'): number {
  const p = state === 'RUN' ? profile.run : state === 'IDLE' ? profile.idle : profile.down;
  const [min, max] = DURATION_LIMITS[state];
  return Math.min(max, Math.max(min, lognormal(rnd, p.median, p.sigma))) * MINUTE;
}

export function generateDay(machine: MockMachine, date: string, tz: string): GenInterval[] {
  const rnd = seededRandom(`${MOCK_CONFIG.seed}:${machine.id}:${date}`);
  const profile = PROFILES[machine.profile];
  let weights = weightsCache.get(machine.id);
  if (!weights) weightsCache.set(machine.id, (weights = machineReasonWeights(machine, profile)));

  const d0 = dayStartMs(date, tz);
  const d1 = dayStartMs(addDaysToDate(date, 1), tz);
  const at = (hhmm: string) => atLocal(date, hhmm, tz);
  const base = { machineId: machine.id, speed: 0 };

  const planned: GenInterval[] = [];
  const place = (ev: GenInterval) => {
    if (ev.from < d0 || ev.to > d1) return;
    if (planned.some((p) => p.from < ev.to && ev.from < p.to)) return;
    planned.push(ev);
  };
  place({ ...base, stateCode: 'PLANNED_STOP', from: at('00:00'), to: at('00:30'), reasonId: 'r-lunch' });
  place({ ...base, stateCode: 'PLANNED_STOP', from: at('12:00'), to: at('12:30'), reasonId: 'r-lunch' });
  if (dayjs(date).day() === 3) {
    place({ ...base, stateCode: 'PLANNED_STOP', from: at('14:00'), to: at('16:00'), reasonId: 'r-maintenance' });
  }
  if (rnd() < profile.setupRate) {
    const from = rnd() < 0.5 ? at('08:00') : at('20:00');
    place({ ...base, stateCode: 'SETUP', from, to: from + randInt(rnd, 20, 60) * MINUTE, reasonId: 'r-setup' });
  }
  if (rnd() < profile.offlineRate) {
    const from = d0 + randInt(rnd, 1, 21) * HOUR + randInt(rnd, 0, 59) * MINUTE;
    place({ ...base, stateCode: 'OFFLINE', from, to: from + randInt(rnd, 30, 120) * MINUTE, reasonId: null });
  }
  planned.sort((a, b) => a.from - b.from);

  const out: GenInterval[] = [];
  const isNight = (t: number) => t < at('08:00') || t >= at('20:00');
  let cursor = d0;
  const fill = (gapFrom: number, gapTo: number) => {
    let state: 'RUN' | 'IDLE' | 'DOWN' = 'RUN';
    for (let cur = gapFrom; cur < gapTo; ) {
      let dur = Math.min(sampleDuration(rnd, profile, state), gapTo - cur);
      if (gapTo - (cur + dur) < MINUTE) dur = gapTo - cur;
      out.push({
        machineId: machine.id,
        stateCode: state,
        from: cur,
        to: cur + dur,
        reasonId:
          state === 'RUN' ? null : rnd() < MOCK_CONFIG.labelRate ? weightedPick(rnd, weights![state]) : null,
        speed: state === 'RUN' ? profile.perf + (rnd() - 0.5) * 0.1 : 0,
      });
      cur += dur;
      if (state === 'RUN') {
        const pIdle = Math.min(0.9, profile.pIdle * (isNight(cur) ? profile.nightIdleFactor : 1));
        state = rnd() < pIdle ? 'IDLE' : 'DOWN';
      } else {
        state = 'RUN';
      }
    }
  };
  for (const ev of planned) {
    if (ev.from > cursor) fill(cursor, ev.from);
    out.push(ev);
    cursor = ev.to;
  }
  if (cursor < d1) fill(cursor, d1);
  return out;
}
