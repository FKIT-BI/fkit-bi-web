import { SegmentedControl, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { reasonKeyOf, UNKNOWN_DECAL, useReasons } from '@/entities/loss-reason';
import { useDrilldown } from '@/features/losses-drilldown';
import { useNarrowPeriod, usePeriod } from '@/features/period-filter';
import { api, type AnalyticsScope, type AppliedResolution, type LossPoint } from '@/shared/api';
import { UNKNOWN_REASON } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { DAY, formatDate, formatDateTime, formatDuration, formatPercent, formatTime } from '@/shared/lib';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

type Mode = 'time' | 'pareto';
const TOP = 8;

function bucketLabel(p: LossPoint, res: AppliedResolution, multiDay: boolean) {
  const start = Date.parse(p.bucketStart);
  if (res === '1d') return formatDate(start).slice(0, 5);
  return multiDay ? `${formatDate(start).slice(0, 5)} ${formatTime(start)}` : formatTime(start);
}

export function LossesChart({ ctx }: { ctx: PanelContext }) {
  const scope = (ctx.scope ?? 'MACHINE') as AnalyticsScope;
  const scopeId = (ctx.id ?? ctx.machineId)!;
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>((ctx.mode as Mode) ?? 'time');
  const period = usePeriod();
  const reasons = useReasons();
  const narrow = useNarrowPeriod();
  const setDrill = useDrilldown((s) => s.set);

  const ts = useQuery({
    ...api.lossTimeseries(scope, scopeId, { ...period.params, resolution: period.to - period.from <= 2 * DAY ? '1h' : '1d', top: TOP }),
    enabled: mode === 'time',
    placeholderData: keepPreviousData,
  });
  const par = useQuery({
    ...api.lossPareto(scope, scopeId, { ...period.params, top: TOP }),
    enabled: mode === 'pareto',
    placeholderData: keepPreviousData,
  });
  const q = mode === 'time' ? ts : par;

  const res = ts.data?.resolution ?? '1h';
  const unit = res === '1d' ? 3600 : 60;
  const unitLabel = res === '1d' ? 'ч' : 'мин';
  const points = useMemo(() => ts.data?.points ?? [], [ts.data]);
  const multiDay = points.length > 1 && formatDate(Date.parse(points[0].bucketStart)) !== formatDate(Date.parse(points[points.length - 1].bucketStart));

  const timeOption = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of points) for (const r of p.byReason) totals.set(reasonKeyOf(r), (totals.get(reasonKeyOf(r)) ?? 0) + r.durationSec);
    const order = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return {
      grid: { left: 48, right: 16, top: 48, bottom: 28 },
      legend: { type: 'scroll', top: 0, left: 0, right: 0, itemWidth: 12, itemHeight: 10 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: Array<{ dataIndex: number; seriesName: string; value: number; color: string }>) => {
          const b = points[ps[0]?.dataIndex];
          if (!b) return '';
          const rows = ps
            .filter((p) => p.value > 0)
            .sort((a, c) => c.value - a.value)
            .map((p) => `<div style="display:flex;gap:12px;justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b>${formatDuration(p.value * unit)}</b></div>`)
            .join('');
          const total = ps.reduce((s, p) => s + p.value, 0);
          return `<div style="margin-bottom:4px">${formatDateTime(Date.parse(b.bucketStart))} – ${formatTime(Date.parse(b.bucketEnd))}</div>${rows || '—'}<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px">Всего: <b>${formatDuration(total * unit)}</b></div>`;
        },
      },
      xAxis: { type: 'category', data: points.map((p) => bucketLabel(p, res, multiDay)), axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', name: unitLabel, nameTextStyle: { align: 'right' } },
      series: order.map((key) => ({
        id: key,
        name: reasons.nameOf(key),
        type: 'bar',
        stack: 'losses',
        barMaxWidth: 36,
        emphasis: { focus: 'series' },
        itemStyle: { color: reasons.colorOf(key), decal: key === UNKNOWN_REASON ? UNKNOWN_DECAL : undefined },
        data: points.map((p) => {
          const sec = p.byReason.filter((r) => reasonKeyOf(r) === key).reduce((s, r) => s + r.durationSec, 0);
          return Math.round((sec / unit) * 100) / 100;
        }),
      })),
    };
  }, [points, reasons, res, unit, unitLabel, multiDay]);

  const paretoOption = useMemo(() => {
    const rows = par.data?.rows ?? [];
    return {
      grid: { left: 48, right: 48, top: 24, bottom: 56 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const r = rows[ps[0]?.dataIndex];
          return r
            ? `<b>${reasons.nameOf(reasonKeyOf(r))}</b><br/>${formatDuration(r.durationSec)} · ${formatPercent(r.share)} потерь<br/>Накопленно: ${formatPercent(r.cumulativeShare)}`
            : '';
        },
      },
      xAxis: {
        type: 'category',
        data: rows.map((r) => reasons.nameOf(reasonKeyOf(r))),
        axisLabel: { interval: 0, rotate: rows.length > 6 ? 25 : 0, fontSize: 11 },
      },
      yAxis: [
        { type: 'value', name: 'ч' },
        { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        {
          type: 'bar',
          name: t('losses.title'),
          barMaxWidth: 48,
          data: rows.map((r) => ({
            value: Math.round((r.durationSec / 3600) * 100) / 100,
            itemStyle: { color: reasons.colorOf(reasonKeyOf(r)), decal: r.kind === 'UNCLASSIFIED' ? UNKNOWN_DECAL : undefined },
          })),
        },
        {
          type: 'line',
          name: t('losses.cumulative'),
          yAxisIndex: 1,
          symbolSize: 6,
          lineStyle: { color: '#ccccdc' },
          itemStyle: { color: '#ccccdc' },
          data: rows.map((r) => Math.round(r.cumulativeShare * 1000) / 10),
          markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#8e8e9e' }, data: [{ yAxis: 80 }] },
        },
      ],
    };
  }, [par.data, reasons, t]);

  const isEmpty = mode === 'time' ? !!ts.data && points.every((p) => p.byReason.length === 0) : !!par.data && par.data.rows.length === 0;

  return (
    <Panel
      title={t('losses.title')}
      actions={
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          data={[
            { value: 'time', label: t('losses.byTime') },
            { value: 'pareto', label: t('losses.pareto') },
          ]}
        />
      }
      state={{ isLoading: q.isLoading && !q.data, isError: q.isError, error: q.error, isEmpty, refetch: () => void q.refetch() }}
      exportName={`losses-${mode}-${scopeId}`}
      rows={() =>
        mode === 'time'
          ? points.flatMap((p) =>
              p.byReason.map((r) => ({
                bucketStart: formatDateTime(Date.parse(p.bucketStart)),
                bucketEnd: formatDateTime(Date.parse(p.bucketEnd)),
                reason: reasons.nameOf(reasonKeyOf(r)),
                minutes: Math.round(r.durationSec / 60),
              })),
            )
          : (par.data?.rows ?? []).map((r) => ({
              reason: reasons.nameOf(reasonKeyOf(r)),
              hours: Math.round((r.durationSec / 3600) * 100) / 100,
              share: Math.round(r.share * 1000) / 10,
              cumShare: Math.round(r.cumulativeShare * 1000) / 10,
            }))
      }
      minBodyHeight={300}
    >
      {mode === 'time' ? (
        <Chart
          option={timeOption}
          height={300}
          ariaLabel="Столбчатая диаграмма потерь по времени"
          onEvents={{
            click: (p: { seriesId: string; dataIndex: number }) => {
              const b = points[p.dataIndex];
              if (!b) return;
              const from = Date.parse(b.bucketStart);
              const to = Date.parse(b.bucketEnd);
              setDrill({ reasonId: p.seriesId, from, to, label: `${reasons.nameOf(p.seriesId)}, ${formatDateTime(from)}–${formatTime(to)}` });
            },
          }}
          onBrushX={([i0, i1]) => {
            const a = points[Math.max(0, Math.round(i0))];
            const b = points[Math.min(points.length - 1, Math.round(i1))];
            if (a && b && (a !== b || points.length > 1)) narrow(Date.parse(a.bucketStart), Date.parse(b.bucketEnd));
          }}
        />
      ) : (
        <Chart
          option={paretoOption}
          height={300}
          ariaLabel="Диаграмма Парето причин потерь"
          onEvents={{
            click: (p: { dataIndex: number; seriesType: string }) => {
              const r = par.data?.rows[p.dataIndex];
              if (r && p.seriesType === 'bar') setDrill({ reasonId: reasonKeyOf(r), label: reasons.nameOf(reasonKeyOf(r)) });
            },
          }}
        />
      )}
      <Text size="xs" c="dimmed" mt={4}>
        {t('losses.hint')}
      </Text>
    </Panel>
  );
}
