import { z } from 'zod';
import { parseLocal } from '@/shared/lib';

const base = z.object({
  machineId: z.string().min(1, 'incident.errRequired'),
  from: z.string().min(1, 'incident.errRequired'),
  to: z.string().nullable(),
  ongoing: z.boolean(),
  reasonId: z.string(),
  stateOverride: z.enum(['', 'SETUP', 'PLANNED_STOP']),
  comment: z.string().max(500),
});

export type IncidentForm = z.infer<typeof base>;

/**
 * Mirrors the Analytics incident rules: coverageFrom <= from <= now, a closed incident has from < to <= now,
 * and at least one effect (manual state or loss reason) is set. `exactMs` resolves a field to the precise
 * instant the form was opened with (the picker shows minutes, the backend compares milliseconds).
 */
export const incidentFormSchema = (opts: { coverageFrom?: number | null; exactMs?: (field: 'from' | 'to', value: string) => number } = {}) =>
  base.superRefine((v, ctx) => {
    const now = Date.now();
    const ms = (field: 'from' | 'to', value: string) => opts.exactMs?.(field, value) ?? parseLocal(value);
    const from = ms('from', v.from);
    if (opts.coverageFrom != null && from < opts.coverageFrom) ctx.addIssue({ code: 'custom', path: ['from'], message: 'incident.errBeforeCoverage' });
    if (from > now) ctx.addIssue({ code: 'custom', path: ['from'], message: 'incident.errFuture' });
    if (!v.reasonId && !v.stateOverride) ctx.addIssue({ code: 'custom', path: ['reasonId'], message: 'incident.errReasonOrState' });
    if (!v.ongoing) {
      if (!v.to) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: 'incident.errRequired' });
        return;
      }
      const to = ms('to', v.to);
      if (to <= from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'incident.errToBeforeFrom' });
      if (to > now) ctx.addIssue({ code: 'custom', path: ['to'], message: 'incident.errFuture' });
    }
  });
