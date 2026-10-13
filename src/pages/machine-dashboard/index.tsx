import { useParams } from '@tanstack/react-router';
import { Dashboard, type DashboardConfig } from '@/shared/ui';

export const machineDashboard: DashboardConfig = {
  id: 'machine',
  panels: [
    { id: 'card', type: 'machine-card', span: 6 },
    { id: 'stats', type: 'current-stats', span: 6 },
    { id: 'losses', type: 'losses-chart', span: 12 },
    { id: 'chrono', type: 'chronometry', span: 12 },
    { id: 'intervals', type: 'intervals-table', span: 12 },
  ],
};

export default function MachineDashboardPage() {
  const { machineId } = useParams({ strict: false }) as { machineId: string };
  return <Dashboard key={machineId} config={machineDashboard} ctx={{ scope: 'MACHINE', id: machineId, machineId }} />;
}
