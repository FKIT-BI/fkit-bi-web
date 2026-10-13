import { z } from 'zod';
import { PERIOD_PRESETS } from '../lib/period';

export const REFRESH_OPTIONS = ['off', '30s', '1m', '5m'] as const;
export type RefreshOption = (typeof REFRESH_OPTIONS)[number];
export const REFRESH_MS: Record<RefreshOption, number | null> = { off: null, '30s': 30_000, '1m': 60_000, '5m': 300_000 };

export const dashboardSearchSchema = z.object({
  range: z.enum(PERIOD_PRESETS).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  shift: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional().catch(undefined),
  refresh: z.enum(REFRESH_OPTIONS).optional().catch(undefined),
  kiosk: z.coerce.boolean().optional().catch(undefined),
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;
export const DASHBOARD_SEARCH_KEYS = ['range', 'from', 'to', 'shift', 'refresh', 'kiosk'] as const;
