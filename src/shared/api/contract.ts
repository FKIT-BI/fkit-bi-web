import { z } from 'zod';
import { STATE_CODES } from '../config/states';

const ts = z.string().transform((s, ctx) => {
  const v = Date.parse(s);
  if (Number.isNaN(v)) {
    ctx.addIssue({ code: 'custom', message: `Некорректная дата: ${s}` });
    return z.NEVER;
  }
  return v;
});

export const StateCodeSchema = z.enum(STATE_CODES);

export const ShiftDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.string(),
  end: z.string(),
});

export const EnterpriseSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  shiftSchedule: z.array(ShiftDefSchema),
});

export const LineSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  name: z.string(),
  order: z.number(),
});

export const OpcTagSchema = z.object({
  tag: z.string(),
  signal: z.string(),
  label: z.string(),
  unit: z.string(),
  min: z.number(),
  max: z.number(),
});

export const MachineSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  name: z.string(),
  type: z.string(),
  inventoryNo: z.string(),
  nominalRate: z.number(),
  order: z.number(),
  archived: z.boolean().default(false),
  params: z.array(z.object({ label: z.string(), value: z.string() })),
  opcTags: z.array(OpcTagSchema),
  stateRules: z.array(z.object({ state: StateCodeSchema, rule: z.string() })),
  thresholds: z.object({ availability: z.object({ good: z.number(), warn: z.number() }) }),
});

export const LossReasonInputSchema = z.object({
  name: z.string(),
  group: z.string(),
  isPlanned: z.boolean(),
  color: z.string(),
});

export const LossReasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string(),
  isPlanned: z.boolean(),
  color: z.string(),
});

export const IncidentSchema = z.object({
  id: z.string(),
  machineId: z.string(),
  from: ts,
  to: ts.nullable(),
  reasonId: z.string(),
  comment: z.string(),
  author: z.string(),
  createdAt: ts,
});

export const EnterpriseInputSchema = EnterpriseSchema.omit({ id: true });
export const LineInputSchema = LineSchema.omit({ id: true, enterpriseId: true });
export const MachineInputSchema = MachineSchema.omit({ id: true });

export const IncidentInputSchema = z.object({
  machineId: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  reasonId: z.string(),
  comment: z.string().max(500),
  author: z.string(),
});

export const IntervalIncidentSchema = z.object({ id: z.string(), comment: z.string(), author: z.string() });

export const StateIntervalSchema = z.object({
  machineId: z.string(),
  stateCode: StateCodeSchema,
  from: ts,
  to: ts.nullable(),
  reasonId: z.string().nullable(),
  incident: IntervalIncidentSchema.nullable().optional(),
});

export const MetricsSchema = z.object({
  calendarSec: z.number(),
  runSec: z.number(),
  unplannedSec: z.number(),
  plannedSec: z.number(),
  offlineSec: z.number(),
  availability: z.number().nullable(),
  performance: z.number().nullable(),
  output: z.number().nullable(),
  stops: z.number(),
  mtbfMin: z.number().nullable(),
  mttrMin: z.number().nullable(),
});

export const CurrentStateSchema = z.object({
  machineId: z.string(),
  stateCode: StateCodeSchema,
  since: ts,
  reasonId: z.string().nullable(),
});

export const SummarySchema = z.object({
  scope: z.enum(['enterprise', 'line', 'machine']),
  id: z.string(),
  from: ts,
  to: ts,
  current: MetricsSchema,
  previous: MetricsSchema,
  statesNow: z.record(z.string(), z.number()).optional(),
});

export const LossesBucketSchema = z.object({
  bucketStart: ts,
  bucketEnd: ts,
  byReason: z.record(z.string(), z.number()),
});

export const ParetoRowSchema = z.object({
  reasonId: z.string(),
  sec: z.number(),
  share: z.number(),
  cumShare: z.number(),
});

export const ChronoIntervalSchema = z.object({
  stateCode: StateCodeSchema,
  from: ts,
  to: ts,
  reasonId: z.string().nullable(),
  incident: IntervalIncidentSchema.nullable().optional(),
});

export const ChronometrySchema = z.object({
  shiftStart: ts,
  shiftEnd: ts,
  states: z.array(ChronoIntervalSchema),
  reasons: z.array(
    z.object({ reasonId: z.string(), totalSec: z.number(), intervals: z.array(ChronoIntervalSchema) }),
  ),
});

export const TelemetryLatestSchema = z.object({
  machineId: z.string(),
  ts,
  values: z.record(z.string(), z.number()),
});

export const TelemetrySeriesSchema = z.object({
  signal: z.string(),
  points: z.array(z.tuple([ts, z.number()])),
});

export type ShiftDefDto = z.output<typeof ShiftDefSchema>;
export type Enterprise = z.output<typeof EnterpriseSchema>;
export type Line = z.output<typeof LineSchema>;
export type Machine = z.output<typeof MachineSchema>;
export type OpcTag = z.output<typeof OpcTagSchema>;
export type LossReason = z.output<typeof LossReasonSchema>;
export type Incident = z.output<typeof IncidentSchema>;
export type IncidentInput = z.input<typeof IncidentInputSchema>;
export type EnterpriseInput = z.input<typeof EnterpriseInputSchema>;
export type LineInput = z.input<typeof LineInputSchema>;
export type MachineInput = z.input<typeof MachineInputSchema>;
export type LossReasonInput = z.input<typeof LossReasonInputSchema>;
export type StateInterval = z.output<typeof StateIntervalSchema>;
export type Metrics = z.output<typeof MetricsSchema>;
export type CurrentState = z.output<typeof CurrentStateSchema>;
export type Summary = z.output<typeof SummarySchema>;
export type LossesBucket = z.output<typeof LossesBucketSchema>;
export type ParetoRow = z.output<typeof ParetoRowSchema>;
export type ChronoInterval = z.output<typeof ChronoIntervalSchema>;
export type Chronometry = z.output<typeof ChronometrySchema>;
export type TelemetryLatest = z.output<typeof TelemetryLatestSchema>;
export type TelemetrySeries = z.output<typeof TelemetrySeriesSchema>;

export type Scope = 'enterprise' | 'line' | 'machine';
export type Shift = 'all' | 'day' | 'night';
