import { z } from 'zod';
import { parseLocal } from '@/shared/lib';

export const incidentFormSchema = z
  .object({
    machineId: z.string().min(1, 'incident.errRequired'),
    from: z.string().min(1, 'incident.errRequired'),
    to: z.string().nullable(),
    ongoing: z.boolean(),
    reasonId: z.string(),
    stateOverride: z.enum(['', 'SETUP', 'PLANNED_STOP']),
    comment: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    const now = Date.now() + 60_000;
    const from = parseLocal(v.from);
    if (from > now) ctx.addIssue({ code: 'custom', path: ['from'], message: 'incident.errFuture' });
    if (!v.reasonId && !v.stateOverride) ctx.addIssue({ code: 'custom', path: ['reasonId'], message: 'incident.errReasonOrState' });
    if (!v.ongoing) {
      if (!v.to) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: 'incident.errRequired' });
        return;
      }
      const to = parseLocal(v.to);
      if (to <= from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'incident.errToBeforeFrom' });
      if (to > now) ctx.addIssue({ code: 'custom', path: ['to'], message: 'incident.errFuture' });
    }
  });

export type IncidentForm = z.infer<typeof incidentFormSchema>;
