import { Button, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEnterpriseTree } from '@/entities/enterprise';
import { StateBadge, useCurrentStates, useMachine } from '@/entities/machine';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, type Metrics } from '@/shared/api';
import { levelOf } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDuration, formatHours, formatPercent } from '@/shared/lib';
import { canEditIncidents, useUiStore } from '@/shared/model';
import { KpiTile, Panel, type PanelContext } from '@/shared/ui';

const share = (m: Metrics) => (m.calendarSec > 0 ? m.runSec / m.calendarSec : null);

function delta(cur: number | null, prev: number | null, fmt: (d: number) => string, higherIsBetter: boolean) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  const dir = Math.abs(d) < 1e-9 ? 'flat' : d > 0 ? 'up' : 'down';
  return {
    text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d))}`,
    dir,
    good: dir === 'flat' ? null : d > 0 === higherIsBetter,
  } as const;
}

export function MachineCard({ ctx }: { ctx: PanelContext }) {
  const machineId = ctx.machineId!;
  const { t } = useTranslation();
  const period = usePeriod();
  const tree = useEnterpriseTree();
  const machine = useMachine(machineId);
  const summary = useQuery({ ...api.summary('machine', machineId, period.params), placeholderData: keepPreviousData });
  const states = useCurrentStates(tree.enterprise?.id);
  const openIncident = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);

  const m = machine.data;
  const cur = summary.data?.current;
  const prev = summary.data?.previous;
  const state = states.byMachine.get(machineId);
  const line = tree.lines.find((l) => l.id === m?.lineId);
  const thresholds = m?.thresholds.availability;
  const hint = t('machine.vsPrev');

  return (
    <Panel
      title={t('machine.title')}
      state={{
        isLoading: machine.isLoading || (summary.isLoading && !summary.data),
        isError: machine.isError || summary.isError,
        error: machine.error ?? summary.error,
        refetch: () => void Promise.all([machine.refetch(), summary.refetch()]),
      }}
      exportName={`machine-${machineId}-summary`}
      rows={() =>
        cur && prev
          ? (Object.keys(cur) as (keyof Metrics)[]).map((k) => ({ metric: k, current: cur[k], previous: prev[k] }))
          : []
      }
      minBodyHeight={240}
    >
      {m && cur && prev && (
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
            <div style={{ minWidth: 0 }}>
              <Title order={3} lh={1.2}>
                {m.name}
              </Title>
              <Text size="sm" c="dimmed">
                {line?.name} · {m.type} · {t('machine.inventoryNo')} {m.inventoryNo}
              </Text>
            </div>
            {state && <StateBadge state={state.stateCode} sinceSec={(period.now - state.since) / 1000} />}
          </Group>

          <SimpleGrid type="container" cols={{ base: 1, '420px': 3 }} spacing="sm">
            <KpiTile
              label={t('machine.runShare')}
              value={formatPercent(share(cur))}
              level={levelOf(share(cur), thresholds)}
              delta={{ ...delta(share(cur), share(prev), (d) => `${(d * 100).toFixed(1)} п.п.`, true)!, hint }}
            />
            <KpiTile
              label={t('machine.downtime')}
              value={formatHours(cur.unplannedSec)}
              delta={{ ...delta(cur.unplannedSec, prev.unplannedSec, (d) => formatHours(d), false)!, hint }}
            />
            <KpiTile
              label={t('machine.stops')}
              value={cur.stops}
              delta={{ ...delta(cur.stops, prev.stops, (d) => String(d), false)!, hint }}
            />
          </SimpleGrid>

          <SimpleGrid type="container" cols={{ base: 2, '520px': 3 }} spacing={4} verticalSpacing={2}>
            {[
              [t('machine.availability'), formatPercent(cur.availability)],
              [t('machine.performance'), formatPercent(cur.performance)],
              [t('machine.planned'), formatHours(cur.plannedSec)],
              [t('machine.mtbf'), cur.mtbfMin != null ? formatDuration(cur.mtbfMin * 60) : '—'],
              [t('machine.mttr'), cur.mttrMin != null ? formatDuration(cur.mttrMin * 60) : '—'],
              [t('machine.noData'), formatHours(cur.offlineSec)],
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

          <Group justify="flex-end">
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
