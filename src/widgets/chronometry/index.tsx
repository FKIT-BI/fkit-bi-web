import { ActionIcon, Group, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useElementSize } from '@mantine/hooks';
import { useEffect, useMemo, useState } from 'react';
import { UNKNOWN_DECAL, useReasons, type ReasonsDict } from '@/entities/loss-reason';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, type ChronoInterval, type Chronometry as ChronoData } from '@/shared/api';
import { isStop, STATE_META, UNKNOWN_REASON } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import type { TFunction } from 'i18next';
import { addDaysToDate, formatDate, formatDuration, formatTime, getAppTimezone, shiftAt } from '@/shared/lib';
import { canEditIncidents, useNow, useUiStore } from '@/shared/model';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

const TOP = 5;

interface Seg {
  row: number;
  it: ChronoInterval;
  color: string;
  unknown: boolean;
}

function ganttOption(data: ChronoData, reasons: ReasonsDict, t: TFunction, compact: boolean) {
  const rows = [t('chrono.states'), ...data.reasons.map((r) => reasons.nameOf(r.reasonId))];
  const totals = [
    formatDuration(data.states.filter((s) => s.stateCode !== 'RUN').reduce((a, s) => a + (s.to - s.from) / 1000, 0)),
    ...data.reasons.map((r) => `${Math.round(r.totalSec / 60)} мин`),
  ];
  const segs: Seg[] = [
    ...data.states.map((it) => ({ row: 0, it, color: STATE_META[it.stateCode].color, unknown: false })),
    ...data.reasons.flatMap((r, i) =>
      r.intervals.map((it) => ({
        row: i + 1,
        it,
        color: reasons.colorOf(r.reasonId),
        unknown: r.reasonId === UNKNOWN_REASON,
      })),
    ),
  ];

  return {
    segs,
    option: {
      grid: { left: compact ? 92 : 130, right: compact ? 56 : 70, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const s = segs[p.dataIndex];
          if (!s) return '';
          const it = s.it;
          const title = s.row === 0 ? t(`state.${it.stateCode}`) : rows[s.row];
          const reason = s.row === 0 && it.stateCode !== 'RUN' ? `<br/>${reasons.nameOf(it.reasonId)}` : '';
          const comment = it.incident?.comment ? `<br/><i>«${it.incident.comment}»</i> — ${it.incident.author}` : '';
          return `<b>${title}</b>${reason}<br/>${formatTime(it.from)} – ${formatTime(it.to)} · ${formatDuration((it.to - it.from) / 1000)}${comment}`;
        },
      },
      xAxis: {
        type: 'time',
        min: data.shiftStart,
        max: data.shiftEnd,
        splitNumber: 6,
        axisLabel: { formatter: (v: number) => formatTime(v), hideOverlap: true },
        splitLine: { show: true },
      },
      yAxis: [
        { type: 'category', data: rows, inverse: true, axisTick: { show: false }, axisLabel: { width: compact ? 84 : 120, overflow: 'truncate', fontSize: compact ? 10 : 12 } },
        { type: 'category', data: totals, inverse: true, position: 'right', axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontWeight: 'bold', fontSize: compact ? 10 : 12 } },
      ],
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2], y: 0 },
          data: segs.map((s) => [s.row, s.it.from, s.it.to]),
          renderItem: (params: { dataIndex: number }, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
            const s = segs[params.dataIndex];
            const start = api.coord([api.value(1), api.value(0)]);
            const end = api.coord([api.value(2), api.value(0)]);
            const h = api.size([0, 1])[1] * (s.row === 0 ? 0.8 : 0.6);
            return {
              type: 'rect',
              shape: { x: start[0], y: start[1] - h / 2, width: Math.max(end[0] - start[0], 1), height: h },
              style: {
                fill: s.color,
                stroke: s.unknown ? '#fff' : undefined,
                lineWidth: s.unknown ? 0.5 : 0,
                decal: s.unknown ? UNKNOWN_DECAL : undefined,
              },
            };
          },
        },
      ],
    },
  };
}

function ShiftGantt({ machineId, date, shift, tick }: { machineId: string; date: string; shift: 'day' | 'night'; tick: number }) {
  const { t } = useTranslation();
  const reasons = useReasons();
  const openIncident = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);
  const q = useQuery({ ...api.chronometry({ machineId, date, shift, top: TOP, tick }), placeholderData: keepPreviousData });
  const { ref, width } = useElementSize();
  const compact = width > 0 && width < 520;
  const built = useMemo(() => (q.data ? ganttOption(q.data, reasons, t, compact) : null), [q.data, reasons, t, compact]);
  const notStarted = q.data && q.data.states.length === 0;

  return (
    <Panel
      title={`${t(`chrono.${shift}`)} · ${formatDate(q.data?.shiftStart ?? Date.now())} ${q.data ? `${formatTime(q.data.shiftStart)}–${formatTime(q.data.shiftEnd)}` : ''}`}
      state={{ isLoading: q.isLoading && !q.data, isError: q.isError, error: q.error, isEmpty: !!notStarted, refetch: () => void q.refetch() }}
      exportName={`chronometry-${machineId}-${date}-${shift}`}
      rows={() =>
        (q.data?.reasons ?? []).flatMap((r) =>
          r.intervals.map((it) => ({
            reason: reasons.nameOf(r.reasonId),
            from: formatTime(it.from),
            to: formatTime(it.to),
            minutes: Math.round((it.to - it.from) / 60000),
            comment: it.incident?.comment ?? '',
          })),
        )
      }
      minBodyHeight={200}
    >
      <div ref={ref}>
      {built && (
        <Chart
          option={built.option}
          height={40 + 30 * (1 + (q.data?.reasons.length ?? 0))}
          ariaLabel={`Хронометраж смены ${t(`chrono.${shift}`)}`}
          onEvents={{
            click: (p: { dataIndex: number }) => {
              const s = built.segs[p.dataIndex];
              if (s && isStop(s.it.stateCode) && canEditIncidents(role)) {
                openIncident({ machineId, from: s.it.from, to: s.it.to, reasonId: s.it.reasonId ?? undefined });
              }
            },
          }}
        />
      )}
      </div>
    </Panel>
  );
}

export function Chronometry({ ctx }: { ctx: PanelContext }) {
  const machineId = ctx.machineId!;
  const { t } = useTranslation();
  const period = usePeriod();
  const now = useNow();
  const tz = getAppTimezone();

  const last = shiftAt(Math.min(period.to, now) - 1, tz)?.date;
  const first = shiftAt(period.from, tz)?.date;
  const [date, setDate] = useState(last);
  useEffect(() => setDate(last), [last, machineId]);
  const d = date ?? last;

  return (
    <section aria-label={t('chrono.title')}>
      <Group justify="space-between" mb={6} px={2} gap="xs" wrap="wrap">
        <Text fw={600} size="sm">
          {t('chrono.title')} (топ-{TOP})
        </Text>
        <Group gap={4}>
          <Text size="xs" c="dimmed">
            {t('chrono.shiftDate')}
          </Text>
          <Tooltip label={t('chrono.prev')}>
            <ActionIcon variant="default" size="sm" disabled={!d || d <= first} onClick={() => setDate(addDaysToDate(d, -1))} aria-label={t('chrono.prev')}>
              <IconChevronLeft size={14} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" fw={600} w={86} ta="center">
            {d ? d.split('-').reverse().join('.') : '—'}
          </Text>
          <Tooltip label={t('chrono.next')}>
            <ActionIcon variant="default" size="sm" disabled={!d || d >= last} onClick={() => setDate(addDaysToDate(d, 1))} aria-label={t('chrono.next')}>
              <IconChevronRight size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {d && (
        <SimpleGrid type="container" cols={{ base: 1, '1000px': 2 }} spacing="xs">
          <ShiftGantt machineId={machineId} date={d} shift="day" tick={now} />
          <ShiftGantt machineId={machineId} date={d} shift="night" tick={now} />
        </SimpleGrid>
      )}
    </section>
  );
}
