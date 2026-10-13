import { SimpleGrid } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCurrentStates } from '@/entities/machine';
import { usePeriod } from '@/features/period-filter';
import { api, type AnalyticsScope } from '@/shared/api';
import { levelOf } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatHours, formatPercent, runShare, unplannedSec } from '@/shared/lib';
import { KpiTile, Panel, type PanelContext } from '@/shared/ui';

export function EnterpriseKpi({ ctx }: { ctx: PanelContext }) {
  const { t } = useTranslation();
  const period = usePeriod();
  const q = useQuery({ ...api.summary((ctx.scope ?? 'ENTERPRISE') as AnalyticsScope, ctx.id!, period.params), placeholderData: keepPreviousData });
  const states = useCurrentStates(ctx.id);
  const cur = q.data?.current.metrics;
  const prev = q.data?.previous?.metrics;
  const counts = new Map((states.data?.stateCounts ?? []).map((c) => [c.state, c.count]));
  const running = counts.get('RUN') ?? 0;
  const stopped = (counts.get('IDLE') ?? 0) + (counts.get('DOWN') ?? 0);
  const share = cur ? runShare(cur) : null;
  const prevShare = prev ? runShare(prev) : null;
  const d = share != null && prevShare != null ? share - prevShare : null;

  return (
    <Panel
      title={t('overview.title')}
      state={{ isLoading: q.isLoading && !q.data, isError: q.isError, error: q.error, refetch: () => void q.refetch() }}
      rows={() => (cur ? Object.entries(cur).filter(([, v]) => typeof v !== 'object').map(([k, v]) => ({ metric: k, value: v as number | null })) : [])}
      exportName="enterprise-kpi"
      minBodyHeight={100}
    >
      {cur && (
        <SimpleGrid type="container" cols={{ base: 2, '560px': 3, '900px': 5 }} spacing="sm">
          <KpiTile
            label={t('overview.runShare')}
            value={formatPercent(share)}
            level={levelOf(share)}
            delta={d == null ? null : { text: `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} п.п.`, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', good: d === 0 ? null : d > 0, hint: t('machine.vsPrev') }}
          />
          <KpiTile label={t('overview.downtime')} value={formatHours(unplannedSec(cur), 0)} />
          <KpiTile label={t('machine.availability')} value={formatPercent(cur.availability)} level={levelOf(cur.availability)} />
          <KpiTile label={t('overview.running')} value={running} level="good" />
          <KpiTile label={t('overview.stopped')} value={stopped} level={stopped > 0 ? 'bad' : null} />
        </SimpleGrid>
      )}
    </Panel>
  );
}
