import { Badge, Button, Group, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { StateBadge } from '@/entities/machine';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, type Metrics } from '@/shared/api';
import { levelOf } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDuration, formatHours, formatPercent, runShare, unplannedSec as unplanned } from '@/shared/lib';
import { canEditIncidents, useNow, useUiStore } from '@/shared/model';
import { KpiTile, Panel, type PanelContext } from '@/shared/ui';


function delta(cur: number | null, prev: number | null, fmt: (d: number) => string, higherIsBetter: boolean, hint: string) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  const dir = Math.abs(d) < 1e-9 ? 'flat' : d > 0 ? 'up' : 'down';
  return {
    text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d))}`,
    dir,
    good: dir === 'flat' ? null : d > 0 === higherIsBetter,
    hint,
  } as const;
}

export function MachineCard({ ctx }: { ctx: PanelContext }) {
  const machineId = ctx.machineId!;
  const { t } = useTranslation();
  const period = usePeriod();
  const now = useNow();
  const current = useQuery({ ...api.machineCurrent(machineId, now), placeholderData: keepPreviousData });
  const summary = useQuery({ ...api.summary('MACHINE', machineId, period.params), placeholderData: keepPreviousData });
  const openIncident = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);

  const m = current.data?.machine;
  const state = current.data?.currentState;
  const cur = summary.data?.current.metrics;
  const prev = summary.data?.previous?.metrics ?? null;
  const meta = summary.data?.current.metadata;
  const hint = t('machine.vsPrev');

  return (
    <Panel
      title={t('machine.title')}
      state={{
        isLoading: (current.isLoading && !current.data) || (summary.isLoading && !summary.data),
        isError: current.isError || summary.isError,
        error: current.error ?? summary.error,
        refetch: () => void Promise.all([current.refetch(), summary.refetch()]),
      }}
      exportName={`machine-${m?.code ?? machineId}-summary`}
      rows={() =>
        cur
          ? (Object.keys(cur) as (keyof Metrics)[])
              .filter((k) => typeof cur[k] !== 'object')
              .map((k) => ({ metric: k, current: cur[k] as number | null, previous: (prev?.[k] as number | null) ?? null }))
          : []
      }
      minBodyHeight={240}
    >
      {m && cur && (
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
            <div style={{ minWidth: 0 }}>
              <Title order={3} lh={1.2}>
                {m.name}
              </Title>
              <Text size="sm" c="dimmed">
                {[current.data?.line?.name, m.machineType, m.inventoryNo && `${t('machine.inventoryNo')} ${m.inventoryNo}`].filter(Boolean).join(' · ')}
              </Text>
            </div>
            {state && (
              <Group gap={6}>
                <StateBadge state={state.effectiveState} sinceSec={(now - Date.parse(state.stateSince)) / 1000} />
                {state.stateSource === 'MANUAL' && (
                  <Tooltip label="Состояние задано инцидентом">
                    <Badge size="sm" variant="outline">
                      вручную
                    </Badge>
                  </Tooltip>
                )}
              </Group>
            )}
          </Group>
          {state?.lossReason && (
            <Text size="sm">
              {t('intervals.reason')}: <b>{state.lossReason.name}</b>
            </Text>
          )}

          <SimpleGrid type="container" cols={{ base: 1, '420px': 3 }} spacing="sm">
            <KpiTile
              label={t('machine.runShare')}
              value={formatPercent(runShare(cur))}
              level={levelOf(runShare(cur))}
              delta={delta(runShare(cur), prev && runShare(prev), (d) => `${(d * 100).toFixed(1)} п.п.`, true, hint)}
            />
            <KpiTile
              label={t('machine.downtime')}
              value={formatHours(unplanned(cur))}
              delta={delta(unplanned(cur), prev && unplanned(prev), (d) => formatHours(d), false, hint)}
            />
            <KpiTile
              label={t('machine.stops')}
              value={cur.stopCount}
              delta={delta(cur.stopCount, prev?.stopCount ?? null, (d) => String(d), false, hint)}
            />
          </SimpleGrid>

          <SimpleGrid type="container" cols={{ base: 2, '520px': 4 }} spacing={4} verticalSpacing={2}>
            {[
              [t('machine.availability'), formatPercent(cur.availability)],
              [t('machine.performance'), formatPercent(cur.performance)],
              [t('machine.oee'), formatPercent(cur.oee)],
              [t('machine.planned'), formatHours(cur.setupSec + cur.plannedStopSec)],
              [t('machine.mtbf'), formatDuration(cur.mtbfSec)],
              [t('machine.mttr'), formatDuration(cur.mttrSec)],
              [t('machine.noData'), formatHours(cur.effectiveOfflineSec)],
              [t('machine.coverage'), formatPercent(cur.dataCoverage)],
            ].map(([label, value]) => (
              <Group key={label} gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {label}:
                </Text>
                <Text size="xs" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </Text>
              </Group>
            ))}
          </SimpleGrid>

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {meta?.partial ? t('data.partial') : ''}
              {meta?.recalculating ? ` · ${t('data.recalculating')}` : ''}
            </Text>
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconAlertCircle size={14} />}
              disabled={!canEditIncidents(role)}
              onClick={() => openIncident({ machineId })}
            >
              {t('machine.registerIncident')}
            </Button>
          </Group>
        </Stack>
      )}
    </Panel>
  );
}
