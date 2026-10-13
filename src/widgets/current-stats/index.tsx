import { SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useMachine } from '@/entities/machine';
import { api, type OpcTag } from '@/shared/api';
import { STATE_META } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatTime, formatDateTimeSec, HOUR } from '@/shared/lib';
import { useNow } from '@/shared/model';
import { Chart, Panel, type PanelContext } from '@/shared/ui';

const GREEN = STATE_META.RUN.color;
const YELLOW = STATE_META.IDLE.color;
const RED = STATE_META.DOWN.color;

function gaugeOption(tag: OpcTag, value: number | undefined, good: number, warn: number) {
  const max = tag.max;
  return {
    series: [
      {
        type: 'gauge',
        min: tag.min,
        max,
        radius: '95%',
        center: ['50%', '60%'],
        startAngle: 210,
        endAngle: -30,
        progress: { show: false },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [warn / 1.2, RED],
              [good / 1.2, YELLOW],
              [1, GREEN],
            ],
          },
        },
        pointer: { width: 4, length: '60%', itemStyle: { color: 'auto' } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { width: 1, color: 'auto' } },
        axisLabel: { distance: 14, fontSize: 9, color: 'inherit', formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)) },
        title: { offsetCenter: [0, '72%'], fontSize: 12, color: 'inherit' },
        detail: {
          offsetCenter: [0, '38%'],
          fontSize: 18,
          fontWeight: 700,
          color: 'inherit',
          formatter: (v: number) => `${v.toLocaleString('ru-RU')} ${tag.unit}`,
        },
        data: [{ value: value ?? 0, name: tag.label }],
      },
    ],
  };
}

function Sparkline({ machineId, tag, now, color }: { machineId: string; tag: OpcTag; now: number; color: string }) {
  const q = useQuery({
    ...api.telemetrySeries(machineId, tag.signal, { from: now - HOUR, to: now }),
    placeholderData: keepPreviousData,
  });
  const option = useMemo(
    () => ({
      grid: { left: 36, right: 8, top: 8, bottom: 18 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number) => `${v.toLocaleString('ru-RU')} ${tag.unit}`,
        axisPointer: { label: { formatter: (p: { value: number }) => formatDateTimeSec(p.value) } },
      },
      xAxis: { type: 'time', splitNumber: 2, axisLabel: { formatter: (v: number) => formatTime(v), fontSize: 9, hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, splitNumber: 2, axisLabel: { fontSize: 9 } },
      series: [
        {
          type: 'line',
          name: tag.label,
          showSymbol: false,
          data: q.data?.points ?? [],
          lineStyle: { width: 1.5, color },
          areaStyle: { color, opacity: 0.12 },
          itemStyle: { color },
        },
      ],
    }),
    [q.data, tag, color],
  );
  return (
    <div>
      <Text size="xs" c="dimmed">
        {tag.label}, {tag.unit}
      </Text>
      <Chart option={option} height={70} group={`telemetry-${machineId}`} ariaLabel={`${tag.label} за последний час`} />
    </div>
  );
}

export function CurrentStats({ ctx }: { ctx: PanelContext }) {
  const machineId = ctx.machineId!;
  const { t } = useTranslation();
  const now = useNow();
  const machine = useMachine(machineId);
  const latest = useQuery({ ...api.telemetryLatest(machineId, now), placeholderData: keepPreviousData });

  const m = machine.data;
  const tags = new Map(m?.opcTags.map((x) => [x.signal, x]));
  const th = m?.thresholds.availability ?? { good: 0.85, warn: 0.6 };
  const speed = tags.get('speed');
  const load = tags.get('load');
  const values = latest.data?.values ?? {};

  return (
    <Panel
      title={
        <>
          {t('stats.title')}
          {latest.data && (
            <Text span size="xs" c="dimmed" fw={400} ml={8}>
              {t('stats.updated', { time: formatDateTimeSec(latest.data.ts) })}
            </Text>
          )}
        </>
      }
      state={{
        isLoading: machine.isLoading || (latest.isLoading && !latest.data),
        isError: machine.isError || latest.isError,
        error: machine.error ?? latest.error,
        refetch: () => void latest.refetch(),
      }}
      exportName={`machine-${machineId}-telemetry`}
      rows={() => (m?.opcTags ?? []).map((tag) => ({ signal: tag.label, tag: tag.tag, value: values[tag.signal], unit: tag.unit }))}
      minBodyHeight={240}
    >
      {m && (
        <SimpleGrid type="container" cols={{ base: 1, '640px': 2 }} spacing="md">
          <Stack gap={4} miw={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {t('stats.passport')}
            </Text>
            <Table fz="xs" verticalSpacing={3} withRowBorders={false}>
              <Table.Tbody>
                {[{ label: t('machine.inventoryNo'), value: m.inventoryNo }, ...m.params].map((p) => (
                  <Table.Tr key={p.label}>
                    <Table.Td c="dimmed" pl={0}>{p.label}</Table.Td>
                    <Table.Td fw={500}>{p.value}</Table.Td>
                  </Table.Tr>
                ))}
                {m.opcTags
                  .filter((tag) => tag.signal === 'temperature' || tag.signal === 'counter')
                  .map((tag) => (
                    <Table.Tr key={tag.signal}>
                      <Table.Td c="dimmed" pl={0}>{tag.label}</Table.Td>
                      <Table.Td fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {values[tag.signal]?.toLocaleString('ru-RU') ?? '—'} {tag.unit}
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </Stack>
          <Stack gap={4} miw={0}>
            <SimpleGrid cols={2} spacing="xs">
              {speed && <Chart option={gaugeOption(speed, values.speed, th.good, th.warn)} height={150} ariaLabel={speed.label} />}
              {load && <Chart option={gaugeOption(load, values.load, th.good, th.warn)} height={150} ariaLabel={load.label} />}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              {t('stats.lastHour')}
            </Text>
            <SimpleGrid cols={2} spacing="xs">
              {speed && <Sparkline machineId={machineId} tag={speed} now={now} color="#5794f2" />}
              {tags.get('temperature') && <Sparkline machineId={machineId} tag={tags.get('temperature')!} now={now} color="#ff9830" />}
            </SimpleGrid>
          </Stack>
        </SimpleGrid>
      )}
    </Panel>
  );
}
