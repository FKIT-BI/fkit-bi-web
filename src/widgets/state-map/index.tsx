import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useElementSize } from '@mantine/hooks';
import { useMemo } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { usePeriod } from '@/features/period-filter';
import { api, type MachineState } from '@/shared/api';
import { STATE_CODES, STATE_META } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, formatDuration } from '@/shared/lib';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

export function StateMap(_: { ctx: PanelContext }) {
  const { t } = useTranslation();
  const period = usePeriod();
  const tree = useEnterpriseTree();
  const navigate = useNavigate();
  const machines = tree.machines;
  const qs = useQueries({
    queries: machines.map((m) => ({ ...api.stateIntervals(m.id, { from: period.from, to: period.to, asOf: period.params.asOf }), placeholderData: <T,>(p: T) => p })),
  });
  const loaded = qs.every((q) => q.data);
  const dataKey = qs.map((q) => q.dataUpdatedAt).join();

  const { ref, width } = useElementSize();
  const compact = width > 0 && width < 640;
  const { option, segs } = useMemo(() => {
    const rows = machines.map((m) => {
      const line = tree.lines.find((l) => l.id === m.lineId);
      return compact ? m.name : `${line?.name.split(' — ')[0] ?? ''} · ${m.name}`;
    });
    const segs: Array<{ row: number; state: MachineState; from: number; to: number }> = [];
    qs.forEach((q, row) =>
      q.data?.items.forEach((it) => segs.push({ row, state: it.effectiveState, from: Date.parse(it.from), to: Date.parse(it.to) })),
    );
    return {
      segs,
      option: {
        grid: { left: compact ? 118 : 210, right: 12, top: compact ? 48 : 28, bottom: 24 },
        legend: { type: 'scroll', top: 0, left: 0, data: STATE_CODES.map((s) => t(`state.${s}`)), selectedMode: false },
        tooltip: {
          trigger: 'item',
          formatter: (p: { dataIndex: number; seriesIndex: number }) => {
            const s = segs[p.dataIndex];
            if (!s || p.seriesIndex !== 0) return '';
            return `<b>${machines[s.row].name}</b><br/>${t(`state.${s.state}`)}<br/>${formatDateTime(s.from)} – ${formatDateTime(s.to)} · ${formatDuration((s.to - s.from) / 1000)}`;
          },
        },
        xAxis: { type: 'time', min: period.from, max: Math.min(period.to, period.now), axisLabel: { hideOverlap: true } },
        yAxis: { type: 'category', data: rows, inverse: true, axisTick: { show: false }, axisLabel: { width: compact ? 110 : 200, overflow: 'truncate', fontSize: compact ? 10 : 12 } },
        series: [
          {
            type: 'custom',
            encode: { x: [1, 2], y: 0 },
            data: segs.map((s) => [s.row, s.from, s.to]),
            renderItem: (params: { dataIndex: number }, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
              const s = segs[params.dataIndex];
              const a = api.coord([api.value(1), api.value(0)]);
              const b = api.coord([api.value(2), api.value(0)]);
              const h = api.size([0, 1])[1] * 0.7;
              return { type: 'rect', shape: { x: a[0], y: a[1] - h / 2, width: Math.max(b[0] - a[0], 0.5), height: h }, style: { fill: STATE_META[s.state].color } };
            },
          },
          ...STATE_CODES.map((s) => ({ type: 'bar', name: t(`state.${s}`), data: [], itemStyle: { color: STATE_META[s].color } })),
        ],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, machines, tree.lines, period, t, compact]);

  return (
    <Panel
      title={t('overview.stateMap')}
      state={{ isLoading: !loaded && qs.every((q) => !q.data), isError: qs.some((q) => q.isError), error: qs.find((q) => q.error)?.error, refetch: () => qs.forEach((q) => void q.refetch()) }}
      exportName="state-map"
      rows={() => segs.map((s) => ({ machine: machines[s.row].name, state: t(`state.${s.state}`), from: formatDateTime(s.from), to: formatDateTime(s.to) }))}
    >
      <div ref={ref}>
      <Chart
        option={option}
        height={(compact ? 60 : 40) + machines.length * 26}
        ariaLabel="Карта состояний машин"
        onEvents={{
          click: (p: { dataIndex: number; seriesIndex: number }) => {
            const s = segs[p.dataIndex];
            if (s && p.seriesIndex === 0) void navigate({ to: '/machines/$machineId', params: { machineId: machines[s.row].id } });
          },
        }}
      />
      </div>
    </Panel>
  );
}
