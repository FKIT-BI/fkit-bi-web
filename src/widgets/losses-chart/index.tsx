import { SegmentedControl, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { UNKNOWN_DECAL, useReasons } from '@/entities/loss-reason';
import { useDrilldown } from '@/features/losses-drilldown';
import { useNarrowPeriod, usePeriod } from '@/features/period-filter';
import { api, type LossesBucket, type Scope } from '@/shared/api';
import { UNKNOWN_REASON } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDate, formatDateTime, formatDuration, formatPercent, formatTime, shiftAt, getAppTimezone, type Bucket } from '@/shared/lib';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

type Mode = 'time' | 'pareto';

function bucketLabel(b: LossesBucket, bucket: Bucket, t: (k: string) => string) {
  if (bucket === 'hour') return formatTime(b.bucketStart);
  if (bucket === 'day') return formatDate(b.bucketStart).slice(0, 5);
  const s = shiftAt(b.bucketStart, getAppTimezone());
  return `${formatDate(b.bucketStart).slice(0, 5)} ${t(`shift.${s?.shift.id ?? 'day'}`)}`;
}

export function LossesChart({ ctx }: { ctx: PanelContext }) {
  const scope = (ctx.scope ?? 'machine') as Scope;
  const machineId = (ctx.id ?? ctx.machineId)!;
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>((ctx.mode as Mode) ?? 'time');
  const period = usePeriod();
  const reasons = useReasons();
  const narrow = useNarrowPeriod();
  const setDrill = useDrilldown((s) => s.set);

  const ts = useQuery({
    ...api.lossesTimeseries(scope, machineId, { ...period.params, bucket: period.bucket }),
    enabled: mode === 'time',
    placeholderData: keepPreviousData,
  });
  const par = useQuery({
    ...api.lossesPareto(scope, machineId, { ...period.params, top: 10 }),
    enabled: mode === 'pareto',
    placeholderData: keepPreviousData,
  });
  const q = mode === 'time' ? ts : par;

  const unit = period.bucket === 'hour' ? 60 : 3600;
  const unitLabel = period.bucket === 'hour' ? 'мин' : 'ч';

  const timeOption = useMemo(() => {
    const buckets = ts.data ?? [];
    const totals = new Map<string, number>();
    for (const b of buckets) for (const [r, s] of Object.entries(b.byReason)) totals.set(r, (totals.get(r) ?? 0) + s);
    const order = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    return {
      grid: { left: 48, right: 16, top: 48, bottom: 28 },
      legend: { type: 'scroll', top: 0, left: 0, right: 0, itemWidth: 12, itemHeight: 10 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: Array<{ dataIndex: number; seriesName: string; value: number; color: string }>) => {
          const b = buckets[ps[0]?.dataIndex];
          if (!b) return '';
          const rows = ps
            .filter((p) => p.value > 0)
            .sort((a, c) => c.value - a.value)
            .map((p) => `<div style="display:flex;gap:12px;justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b>${formatDuration(p.value * unit)}</b></div>`)
            .join('');
          const total = ps.reduce((s, p) => s + p.value, 0);
          return `<div style="margin-bottom:4px">${formatDateTime(b.bucketStart)} – ${formatTime(b.bucketEnd)}</div>${rows || '—'}<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px">Всего: <b>${formatDuration(total * unit)}</b></div>`;
        },
      },
      xAxis: { type: 'category', data: buckets.map((b) => bucketLabel(b, period.bucket, t)), axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', name: unitLabel, nameTextStyle: { align: 'right' } },
      series: order.map((r) => ({
        id: r,
        name: reasons.nameOf(r),
        type: 'bar',
        stack: 'losses',
        barMaxWidth: 36,
        emphasis: { focus: 'series' },
        itemStyle: { color: reasons.colorOf(r), decal: r === UNKNOWN_REASON ? UNKNOWN_DECAL : undefined },
        data: buckets.map((b) => Math.round(((b.byReason[r] ?? 0) / unit) * 100) / 100),
      })),
    };
  }, [ts.data, reasons, period.bucket, unit, unitLabel, t]);

  const paretoOption = useMemo(() => {
    const rows = par.data ?? [];
    return {
      grid: { left: 48, right: 48, top: 24, bottom: 56 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const r = rows[ps[0]?.dataIndex];
          return r
            ? `<b>${reasons.nameOf(r.reasonId)}</b><br/>${formatDuration(r.sec)} · ${formatPercent(r.share)} потерь<br/>Накопленно: ${formatPercent(r.cumShare)}`
            : '';
        },
      },
      xAxis: {
        type: 'category',
        data: rows.map((r) => reasons.nameOf(r.reasonId)),
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
            value: Math.round((r.sec / 3600) * 100) / 100,
            itemStyle: { color: reasons.colorOf(r.reasonId), decal: r.reasonId === UNKNOWN_REASON ? UNKNOWN_DECAL : undefined },
          })),
        },
        {
          type: 'line',
          name: t('losses.cumulative'),
          yAxisIndex: 1,
          symbolSize: 6,
          lineStyle: { color: '#ccccdc' },
          itemStyle: { color: '#ccccdc' },
          data: rows.map((r) => Math.round(r.cumShare * 1000) / 10),
          markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#8e8e9e' }, data: [{ yAxis: 80 }] },
        },
      ],
    };
  }, [par.data, reasons, t]);

  const isEmpty =
    mode === 'time'
      ? !!ts.data && ts.data.every((b) => Object.keys(b.byReason).length === 0)
      : !!par.data && par.data.length === 0;

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
      exportName={`losses-${mode}-${machineId}`}
      rows={() =>
        mode === 'time'
          ? (ts.data ?? []).flatMap((b) =>
              Object.entries(b.byReason).map(([r, sec]) => ({
                bucketStart: formatDateTime(b.bucketStart),
                bucketEnd: formatDateTime(b.bucketEnd),
                reason: reasons.nameOf(r),
                minutes: Math.round(sec / 60),
              })),
            )
          : (par.data ?? []).map((r) => ({
              reason: reasons.nameOf(r.reasonId),
              hours: Math.round((r.sec / 3600) * 100) / 100,
              share: Math.round(r.share * 1000) / 10,
              cumShare: Math.round(r.cumShare * 1000) / 10,
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
              const b = ts.data?.[p.dataIndex];
              if (b) setDrill({ reasonId: p.seriesId, from: b.bucketStart, to: b.bucketEnd, label: `${reasons.nameOf(p.seriesId)}, ${formatDateTime(b.bucketStart)}–${formatTime(b.bucketEnd)}` });
            },
          }}
          onBrushX={([i0, i1]) => {
            const buckets = ts.data ?? [];
            const a = buckets[Math.max(0, Math.round(i0))];
            const b = buckets[Math.min(buckets.length - 1, Math.round(i1))];
            if (a && b && (a !== b || buckets.length > 1)) narrow(a.bucketStart, b.bucketEnd);
          }}
        />
      ) : (
        <Chart
          option={paretoOption}
          height={300}
          ariaLabel="Диаграмма Парето причин потерь"
          onEvents={{
            click: (p: { dataIndex: number; seriesType: string }) => {
              const r = par.data?.[p.dataIndex];
              if (r && p.seriesType === 'bar') setDrill({ reasonId: r.reasonId, label: reasons.nameOf(r.reasonId) });
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
