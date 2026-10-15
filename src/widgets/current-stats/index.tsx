import { SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { machinePassport } from '@/entities/machine';
import { api, type CurrentSignalValue } from '@/shared/api';
import { STATE_META } from '@/shared/config';
import { enumLabel, FRESHNESS, TELEMETRY_QUALITY, unitLabel, useTranslation } from '@/shared/i18n';
import { formatDateTimeSec, formatTime, HOUR } from '@/shared/lib';
import { useNow } from '@/shared/model';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

const GREEN = STATE_META.RUN.color;
const YELLOW = STATE_META.IDLE.color;
const RED = STATE_META.DOWN.color;
const SPARK_HOURS = 6;

const numeric = (v: unknown) => (typeof v === 'number' ? v : null);
const fmt = (v: unknown, unit?: string | null) =>
  v == null ? '—' : `${typeof v === 'number' ? v.toLocaleString('ru-RU') : String(v)}${unit ? ` ${unitLabel(unit)}` : ''}`;

function gaugeOption(s: CurrentSignalValue, max: number, good: number, warn: number) {
  return {
    series: [
      {
        type: 'gauge',
        min: 0,
        max,
        radius: '95%',
        center: ['50%', '60%'],
        startAngle: 210,
        endAngle: -30,
        axisLine: { lineStyle: { width: 10, color: [[warn / 1.2, RED], [good / 1.2, YELLOW], [1, GREEN]] } },
        pointer: { width: 4, length: '60%', itemStyle: { color: 'auto' } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { width: 1, color: 'auto' } },
        axisLabel: { distance: 14, fontSize: 9, color: 'inherit', formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)) },
        title: { offsetCenter: [0, '72%'], fontSize: 12, color: 'inherit' },
        detail: { offsetCenter: [0, '38%'], fontSize: 18, fontWeight: 700, color: 'inherit', formatter: () => fmt(numeric(s.lastUsableValue), s.unitCode) },
        data: [{ value: numeric(s.lastUsableValue) ?? 0, name: s.name }],
      },
    ],
  };
}

function Sparkline({ machineId, signal, now, color }: { machineId: string; signal: CurrentSignalValue; now: number; color: string }) {
  const to = Math.floor(now / 60_000) * 60_000;
  const q = useQuery({
    ...api.telemetrySeries(machineId, signal.signalId, { from: to - SPARK_HOURS * HOUR, to, resolution: '5m' }),
    placeholderData: keepPreviousData,
  });
  const option = useMemo(
    () => ({
      grid: { left: 36, right: 8, top: 8, bottom: 18 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number) => fmt(v, signal.unitCode),
        axisPointer: { label: { formatter: (p: { value: number }) => formatDateTimeSec(p.value) } },
      },
      xAxis: { type: 'time', splitNumber: 2, axisLabel: { formatter: (v: number) => formatTime(v), fontSize: 9, hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, splitNumber: 2, axisLabel: { fontSize: 9 } },
      series: [
        {
          type: 'line',
          name: signal.name,
          showSymbol: false,
          data: (q.data?.points ?? []).map((p) => [Date.parse(p.bucketStart), 'avg' in p ? p.avg : p.last]),
          lineStyle: { width: 1.5, color },
          areaStyle: { color, opacity: 0.12 },
          itemStyle: { color },
        },
      ],
    }),
    [q.data, signal, color],
  );
  return (
    <div>
      <Text size="xs" c="dimmed">
        {signal.name}
        {signal.unitCode ? `, ${unitLabel(signal.unitCode)}` : ''}
      </Text>
      <Chart option={option} height={70} group={`telemetry-${machineId}`} ariaLabel={`${signal.name} за ${SPARK_HOURS} ч`} />
    </div>
  );
}

export function CurrentStats({ ctx }: { ctx: PanelContext }) {
  const machineId = ctx.machineId!;
  const { t } = useTranslation();
  const now = useNow();
  const current = useQuery({ ...api.machineCurrent(machineId, now), placeholderData: keepPreviousData });
  const machine = useQuery(api.machine(machineId));

  const data = current.data;
  const signals = [...(data?.featuredSignals ?? [])].sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99));
  const gauges = signals.filter((s) => s.signalKind === 'GAUGE' && numeric(s.lastUsableValue) != null).slice(0, 2);
  const listed = signals.filter((s) => !gauges.includes(s));
  const sparks = signals.filter((s) => s.signalKind === 'GAUGE').filter((s) => s.semanticCode !== 'LOAD').slice(0, 2);
  const nominal = data?.machine.nominalRate ?? null;
  const gaugeMax = (s: CurrentSignalValue) =>
    s.semanticCode === 'SPEED' && nominal ? Math.round(nominal * 1.2) : unitLabel(s.unitCode) === '%' ? 120 : Math.max(100, Math.ceil(((numeric(s.lastUsableValue) ?? 0) * 1.5) / 10) * 10);

  return (
    <Panel
      title={
        <>
          {t('stats.title')}
          {data?.currency.dataThrough && (
            <Text span size="xs" c="dimmed" fw={400} ml={8}>
              {t('stats.updated', { time: formatDateTimeSec(Date.parse(data.currency.dataThrough)) })}
            </Text>
          )}
        </>
      }
      state={{
        isLoading: current.isLoading && !current.data,
        isError: current.isError,
        error: current.error,
        refetch: () => void current.refetch(),
      }}
      exportName={`machine-${data?.machine.code ?? machineId}-telemetry`}
      rows={() => signals.map((s) => ({ signal: s.name, code: s.code, value: numeric(s.lastUsableValue), unit: unitLabel(s.unitCode), freshness: enumLabel(FRESHNESS, s.freshness), quality: enumLabel(TELEMETRY_QUALITY, s.quality, '') }))}
      minBodyHeight={240}
    >
      {data && (
        <SimpleGrid type="container" cols={{ base: 1, '640px': 2 }} spacing="md">
          <Stack gap={4} miw={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {t('stats.passport')}
            </Text>
            <Table fz="xs" verticalSpacing={3} withRowBorders={false}>
              <Table.Tbody>
                {machinePassport(machine.data ?? data.machine).map((p) => (
                  <Table.Tr key={p.label}>
                    <Table.Td c="dimmed" pl={0}>{p.label}</Table.Td>
                    <Table.Td fw={500}>{p.value}</Table.Td>
                  </Table.Tr>
                ))}
                {listed.map((s) => (
                  <Table.Tr key={s.signalId}>
                    <Table.Td c="dimmed" pl={0}>{s.name}</Table.Td>
                    <Table.Td fw={600} style={{ fontVariantNumeric: 'tabular-nums' }} c={s.freshness === 'FRESH' ? undefined : 'dimmed'}>
                      {fmt(s.lastUsableValue, s.unitCode)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
          <Stack gap={4} miw={0}>
            <SimpleGrid cols={2} spacing="xs">
              {gauges.map((s) => (
                <Chart key={s.signalId} option={gaugeOption(s, gaugeMax(s), 0.85, 0.6)} height={150} ariaLabel={s.name} />
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              за последние {SPARK_HOURS} ч
            </Text>
            <SimpleGrid cols={2} spacing="xs">
              {sparks.map((s, i) => (
                <Sparkline key={s.signalId} machineId={machineId} signal={s} now={now} color={i === 0 ? '#5794f2' : '#ff9830'} />
              ))}
            </SimpleGrid>
          </Stack>
        </SimpleGrid>
      )}
    </Panel>
  );
}
