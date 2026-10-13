import { useEnterpriseTree } from '@/entities/enterprise';
import { Dashboard, type DashboardConfig } from '@/shared/ui';

export const enterpriseOverview: DashboardConfig = {
  id: 'enterprise',
  panels: [
    { id: 'kpi', type: 'enterprise-kpi', span: 12 },
    { id: 'map', type: 'state-map', span: 12 },
    { id: 'rating', type: 'machine-rating', span: 6 },
    { id: 'pareto', type: 'losses-chart', span: 6 },
  ],
};

export default function EnterpriseOverviewPage() {
  const { enterprise } = useEnterpriseTree();
  if (!enterprise) return null;
  return <Dashboard config={enterpriseOverview} ctx={{ scope: 'ENTERPRISE', id: enterprise.id, mode: 'pareto' }} />;
}
