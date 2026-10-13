import { SimpleGrid } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePeriod } from '@/features/period-filter';
import { api, type Scope } from '@/shared/api';
import { levelOf } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatHours, formatPercent } from '@/shared/lib';
import { KpiTile, Panel, type PanelContext } from '@/shared/ui';

export function EnterpriseKpi({ ctx }: { ctx: PanelContext }) {
  const { t } = useTranslation();
  const period = usePeriod();
  const q = useQuery({ ...api.summary((ctx.scope ?? 'enterprise') as Scope, ctx.id!, period.params), placeholderData: keepPreviousData });
  const cur = q.data?.current;
  const prev = q.data?.previous;
  const share = (m?: typeof cur) => (m && m.calendarSec > 0 ? m.runSec / m.calendarSec : null);
  const s = q.data?.statesNow ?? {};
  const running = s.RUN ?? 0;
  const stopped = (s.IDLE ?? 0) + (s.DOWN ?? 0);
  const d = share(cur) != null && share(prev) != null ? share(cur)! - share(prev)! : null;

  return (
    <Panel
      title={t('overview.title')}
      state={{ isLoading: q.isLoading && !q.data, isError: q.isError, error: q.error, refetch: () => void q.refetch() }}
      rows={() => (cur ? Object.entries(cur).map(([k, v]) => ({ metric: k, value: v })) : [])}
      exportName="enterprise-kpi"
      minBodyHeight={100}
    >
      {cur && (
        <SimpleGrid type="container" cols={{ base: 2, '560px': 3, '900px': 5 }} spacing="sm">
          <KpiTile
            label={t('overview.runShare')}
            value={formatPercent(share(cur))}
            level={levelOf(share(cur))}
            delta={d == null ? null : { text: `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} п.п.`, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', good: d === 0 ? null : d > 0, hint: t('machine.vsPrev') }}
          />
          <KpiTile label={t('overview.downtime')} value={formatHours(cur.unplannedSec, 0)} />
          <KpiTile label={t('machine.availability')} value={formatPercent(cur.availability)} level={levelOf(cur.availability)} />
          <KpiTile label={t('overview.running')} value={running} level="good" />
          <KpiTile label={t('overview.stopped')} value={stopped} level={stopped > 0 ? 'bad' : null} />
        </SimpleGrid>
      )}
    </Panel>
  );
}
