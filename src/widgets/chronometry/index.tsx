import { ActionIcon, Group, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { UNKNOWN_DECAL, useReasons, type ReasonsDict } from '@/entities/loss-reason';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, incidentById, type ChronometryOccurrence, type EffectiveStateInterval, type ManualIncident } from '@/shared/api';
import { isLoss, isStop, STATE_META, UNKNOWN_REASON } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { addDaysToDate, dayStartMs, formatDate, formatDuration, formatTime, getAppShifts, getAppTimezone, shiftAt, type ShiftDef } from '@/shared/lib';
import { canEditIncidents, useNow, useUiStore } from '@/shared/model';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

const TOP = 5;

interface Seg {
  row: number;
  it: EffectiveStateInterval;
  color: string;
  unknown: boolean;
}

const reasonKey = (it: EffectiveStateInterval) => it.lossReason?.id ?? UNKNOWN_REASON;

function ganttOption(occ: ChronometryOccurrence, reasons: ReasonsDict, incidents: Map<string, ManualIncident>, t: TFunction, compact: boolean) {
  const losses = occ.intervals.filter((i) => isLoss(i.effectiveState));
  const totals = new Map<string, number>();
  for (const i of losses) totals.set(reasonKey(i), (totals.get(reasonKey(i)) ?? 0) + i.durationSec);
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
  const rowOf = new Map(top.map(([k], i) => [k, i + 1]));
  const rows = [t('chrono.states'), ...top.map(([k]) => reasons.nameOf(k))];
  const lossSec = occ.totals.filter((s) => s.state !== 'RUN').reduce((a, s) => a + s.durationSec, 0);
  const right = [formatDuration(lossSec), ...top.map(([, sec]) => `${Math.round(sec / 60)} мин`)];
  const segs: Seg[] = [
    ...occ.intervals.map((it) => ({ row: 0, it, color: STATE_META[it.effectiveState].color, unknown: false })),
    ...losses
      .filter((it) => rowOf.has(reasonKey(it)))
      .map((it) => ({ row: rowOf.get(reasonKey(it))!, it, color: reasons.colorOf(reasonKey(it)), unknown: reasonKey(it) === UNKNOWN_REASON })),
  ];
  const fontSize = compact ? 10 : 12;

  return {
    segs,
    rowsCount: rows.length,
    option: {
      grid: { left: compact ? 92 : 130, right: compact ? 56 : 70, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const s = segs[p.dataIndex];
          if (!s) return '';
          const it = s.it;
          const from = Date.parse(it.from);
          const to = Date.parse(it.to);
          const title = s.row === 0 ? t(`state.${it.effectiveState}`) : rows[s.row];
          const reason = s.row === 0 && isLoss(it.effectiveState) ? `<br/>${reasons.nameOf(reasonKey(it))}` : '';
          const manual = it.stateSource === 'MANUAL' ? ' · вручную' : '';
          const inc = incidents.get(it.reasonIncidentId ?? '') ?? incidents.get(it.stateIncidentId ?? '');
          const comment = inc?.comment ? `<br/><i>«${inc.comment}»</i>${inc.author ? ` — ${inc.author}` : ''}` : '';
          return `<b>${title}</b>${manual}${reason}<br/>${formatTime(from)} – ${formatTime(to)} · ${formatDuration(it.durationSec)}${comment}`;
        },
      },
      xAxis: {
        type: 'time',
        min: Date.parse(occ.occurrenceFrom),
        max: Date.parse(occ.occurrenceTo),
        splitNumber: 6,
        axisLabel: { formatter: (v: number) => formatTime(v), hideOverlap: true },
        splitLine: { show: true },
      },
      yAxis: [
        { type: 'category', data: rows, inverse: true, axisTick: { show: false }, axisLabel: { width: compact ? 84 : 120, overflow: 'truncate', fontSize } },
        { type: 'category', data: right, inverse: true, position: 'right', axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontWeight: 'bold', fontSize } },
      ],
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2], y: 0 },
          data: segs.map((s) => [s.row, Date.parse(s.it.from), Date.parse(s.it.to)]),
          renderItem: (params: { dataIndex: number }, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
            const s = segs[params.dataIndex];
            const start = api.coord([api.value(1), api.value(0)]);
            const end = api.coord([api.value(2), api.value(0)]);
            const h = api.size([0, 1])[1] * (s.row === 0 ? 0.8 : 0.6);
            return {
              type: 'rect',
              shape: { x: start[0], y: start[1] - h / 2, width: Math.max(end[0] - start[0], 1), height: h },
              style: { fill: s.color, stroke: s.unknown ? '#fff' : undefined, lineWidth: s.unknown ? 0.5 : 0, decal: s.unknown ? UNKNOWN_DECAL : undefined },
            };
          },
        },
      ],
    },
  };
}

function ShiftGantt({ machineId, shift, occ, isLoading, isError, error, refetch, incidents }: {
  machineId: string;
  shift: ShiftDef;
  occ: ChronometryOccurrence | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  incidents: Map<string, ManualIncident>;
}) {
  const { t } = useTranslation();
  const reasons = useReasons();
  const openIncident = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);
  const { ref, width } = useElementSize();
  const compact = width > 0 && width < 520;
  const built = useMemo(() => (occ ? ganttOption(occ, reasons, incidents, t, compact) : null), [occ, reasons, incidents, t, compact]);

  return (
    <Panel
      title={`${shift.name} · ${shift.start}–${shift.end}${occ?.partial ? ' · идёт' : ''}`}
      state={{ isLoading, isError, error, isEmpty: !isLoading && !isError && !occ, refetch }}
      exportName={`chronometry-${machineId}-${occ?.shiftDate ?? ''}-${shift.code}`}
      rows={() =>
        (occ?.intervals ?? []).map((it) => ({
          state: t(`state.${it.effectiveState}`),
          reason: isLoss(it.effectiveState) ? reasons.nameOf(reasonKey(it)) : '',
          from: formatTime(Date.parse(it.from)),
          to: formatTime(Date.parse(it.to)),
          minutes: Math.round(it.durationSec / 60),
          source: it.stateSource,
        }))
      }
      minBodyHeight={200}
    >
      <div ref={ref}>
        {built && (
          <Chart
            option={built.option}
            height={40 + 30 * built.rowsCount}
            ariaLabel={`Хронометраж смены ${shift.name}`}
            onEvents={{
              click: (p: { dataIndex: number }) => {
                const s = built.segs[p.dataIndex];
                if (s && isStop(s.it.effectiveState) && canEditIncidents(role)) {
                  openIncident({ machineId, from: Date.parse(s.it.from), to: s.it.openEnded ? null : Date.parse(s.it.to), reasonId: s.it.lossReason?.id });
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
  const shifts = getAppShifts();

  const last = shiftAt(Math.min(period.to, now) - 1, tz)?.date;
  const first = shiftAt(period.from, tz)?.date;
  const [date, setDate] = useState(last);
  useEffect(() => setDate(last), [last, machineId]);
  const d = date ?? last;

  const q = useQuery({ ...api.chronometry(machineId, d ?? '', now), enabled: !!d, placeholderData: keepPreviousData });
  const incidentsQ = useQuery({
    ...api.machineIncidents(machineId, { from: d ? dayStartMs(d, tz) : 0, to: d ? dayStartMs(addDaysToDate(d, 2), tz) : 0 }),
    enabled: !!d,
  });
  const incidents = useMemo(() => incidentById(incidentsQ.data), [incidentsQ.data]);

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
            <ActionIcon variant="default" size="sm" disabled={!d || !first || d <= first} onClick={() => setDate(addDaysToDate(d!, -1))} aria-label={t('chrono.prev')}>
              <IconChevronLeft size={14} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" fw={600} w={86} ta="center">
            {d ? formatDate(dayStartMs(d, tz)) : '—'}
          </Text>
          <Tooltip label={t('chrono.next')}>
            <ActionIcon variant="default" size="sm" disabled={!d || !last || d >= last} onClick={() => setDate(addDaysToDate(d!, 1))} aria-label={t('chrono.next')}>
              <IconChevronRight size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <SimpleGrid type="container" cols={{ base: 1, '1000px': Math.min(2, shifts.length) }} spacing="xs">
        {shifts.map((s) => (
          <ShiftGantt
            key={s.id}
            machineId={machineId}
            shift={s}
            occ={q.data?.occurrences.find((o) => o.shiftId === s.id)}
            isLoading={q.isLoading && !q.data}
            isError={q.isError}
            error={q.error}
            refetch={() => void q.refetch()}
            incidents={incidents}
          />
        ))}
      </SimpleGrid>
    </section>
  );
}
