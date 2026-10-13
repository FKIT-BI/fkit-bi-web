import { lazy, type ComponentType } from 'react';
import type { PanelContext, PanelDefinition } from '@/shared/ui';

type Loader = () => Promise<Record<string, ComponentType<{ ctx: PanelContext }>>>;
const lazyWidget = (load: Loader, name: string) => lazy(() => load().then((m) => ({ default: m[name] })));

const defs: PanelDefinition[] = [
  { type: 'machine-card', component: lazyWidget(() => import('@/widgets/machine-card'), 'MachineCard'), defaultSize: { span: 6 } },
  { type: 'current-stats', component: lazyWidget(() => import('@/widgets/current-stats'), 'CurrentStats'), defaultSize: { span: 6 } },
  { type: 'losses-chart', component: lazyWidget(() => import('@/widgets/losses-chart'), 'LossesChart'), defaultSize: { span: 12 } },
  { type: 'chronometry', component: lazyWidget(() => import('@/widgets/chronometry'), 'Chronometry'), defaultSize: { span: 12 } },
  { type: 'intervals-table', component: lazyWidget(() => import('@/widgets/intervals-table'), 'IntervalsTable'), defaultSize: { span: 12 } },
  { type: 'enterprise-kpi', component: lazyWidget(() => import('@/widgets/enterprise-kpi'), 'EnterpriseKpi'), defaultSize: { span: 12 } },
  { type: 'state-map', component: lazyWidget(() => import('@/widgets/state-map'), 'StateMap'), defaultSize: { span: 12 } },
  { type: 'machine-rating', component: lazyWidget(() => import('@/widgets/machine-rating'), 'MachineRating'), defaultSize: { span: 6 } },
];

export const dashboardRegistry = Object.fromEntries(defs.map((d) => [d.type, d]));
