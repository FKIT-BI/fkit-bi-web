import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useElementSize } from '@mantine/hooks';
import { useMemo } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { usePeriod } from '@/features/period-filter';
import { api, type Summary } from '@/shared/api';
import { STATE_META } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatPercent } from '@/shared/lib';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

export function MachineRating(_: { ctx: PanelContext }) {
  const { t } = useTranslation();
  const period = usePeriod();
  const tree = useEnterpriseTree();
  const navigate = useNavigate();
  const qs = useQueries({
    queries: tree.machines.map((m) => ({ ...api.summary('machine', m.id, period.params), placeholderData: (p: Summary | undefined) => p })),
  });
  const dataKey = qs.map((q) => q.dataUpdatedAt).join();

  const rows = useMemo(
    () =>
      tree.machines
        .map((m, i) => {
          const c = qs[i]?.data?.current;
          const T = c?.calendarSec || 1;
          return {
            id: m.id,
            name: m.name,
            run: c ? c.runSec / T : 0,
            unplanned: c ? c.unplannedSec / T : 0,
            planned: c ? c.plannedSec / T : 0,
            offline: c ? c.offlineSec / T : 0,
          };
        })
        .sort((a, b) => a.run - b.run),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey, tree.machines],
  );

  const { ref, width } = useElementSize();
  const compact = width > 0 && width < 520;
  const option = useMemo(() => {
    const series = [
      ['run', t('state.RUN'), STATE_META.RUN.color],
      ['unplanned', 'Неплановый простой', STATE_META.DOWN.color],
      ['planned', 'Плановые остановки', STATE_META.PLANNED_STOP.color],
      ['offline', t('state.OFFLINE'), STATE_META.OFFLINE.color],
    ] as const;
    return {
      grid: { left: compact ? 110 : 170, right: 16, top: compact ? 48 : 28, bottom: 8 },
      legend: { type: 'scroll', top: 0, left: 0 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatPercent(v / 100) },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', data: rows.map((r) => r.name), inverse: true, axisLabel: { width: compact ? 100 : 160, overflow: 'truncate', fontSize: compact ? 10 : 12 } },
      series: series.map(([key, name, color]) => ({
        type: 'bar',
        stack: 'all',
        name,
        barMaxWidth: 18,
        itemStyle: { color },
        label: key === 'run' ? { show: true, formatter: (p: { value: number }) => `${p.value.toFixed(0)}%`, color: '#111', fontSize: 10 } : undefined,
        data: rows.map((r) => Math.round(r[key] * 1000) / 10),
      })),
    };
  }, [rows, t, compact]);

  return (
    <Panel
      title={t('overview.rating')}
      state={{ isLoading: qs.every((q) => !q.data), isError: qs.some((q) => q.isError), error: qs.find((q) => q.error)?.error, refetch: () => qs.forEach((q) => void q.refetch()) }}
      exportName="machine-rating"
      rows={() => rows.map((r) => ({ machine: r.name, run: formatPercent(r.run), unplanned: formatPercent(r.unplanned), planned: formatPercent(r.planned), offline: formatPercent(r.offline) }))}
    >
      <div ref={ref}>
      <Chart
        option={option}
        height={(compact ? 60 : 40) + rows.length * 24}
        ariaLabel="Рейтинг машин по доле полезной работы"
        onEvents={{ click: (p: { dataIndex: number }) => void navigate({ to: '/machines/$machineId', params: { machineId: rows[p.dataIndex].id } }) }}
      />
      </div>
    </Panel>
  );
}
