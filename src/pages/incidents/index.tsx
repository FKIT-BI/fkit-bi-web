import { Badge, Button, Group, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEnterpriseTree } from '@/entities/enterprise';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, qk, type ManualIncident } from '@/shared/api';
import { isStop } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, formatDuration } from '@/shared/lib';
import { canEditIncidents, useUiStore } from '@/shared/model';
import { Panel } from '@/shared/ui';

const EFFECT_LABEL: Record<ManualIncident['effectType'], string> = {
  LOSS_ANNOTATION: 'Причина',
  STATE_OVERRIDE: 'Состояние',
  STATE_OVERRIDE_WITH_REASON: 'Состояние + причина',
};

export default function IncidentsPage() {
  const { t } = useTranslation();
  const period = usePeriod();
  const tree = useEnterpriseTree();
  const open = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);
  const qc = useQueryClient();
  const enterpriseId = tree.enterprise?.id ?? '';
  const range = { from: period.from, to: period.to };

  const incidents = useQuery({ ...api.enterpriseIncidents(enterpriseId, range), enabled: !!enterpriseId, placeholderData: keepPreviousData });
  const unclassified = useQueries({
    queries: tree.machines.map((m) => ({
      ...api.stateIntervals(m.id, { ...range, asOf: period.params.asOf }, { unclassifiedOnly: true, lossOnly: true }),
      placeholderData: <T,>(p: T) => p,
    })),
  });
  const unassigned = unclassified
    .flatMap((q, i) => (q.data?.items ?? []).map((it) => ({ ...it, machine: tree.machines[i] })))
    .filter((i) => isStop(i.effectiveState))
    .sort((a, b) => Date.parse(b.from) - Date.parse(a.from));

  const invalidate = () =>
    Promise.all([qk.incidents, qk.intervals, qk.analytics, qk.operations].map((queryKey) => qc.invalidateQueries({ queryKey })));
  const closeNow = useMutation({
    mutationFn: (id: string) => api.closeIncident(id, Date.now()),
    onSuccess: async () => {
      await invalidate();
      notifications.show({ color: 'green', message: t('incident.closed') });
    },
    onError: (e) => notifications.show({ color: 'red', message: e.message }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelIncident(id),
    onSuccess: async () => {
      await invalidate();
      notifications.show({ color: 'green', message: t('incident.cancelled') });
    },
    onError: (e) => notifications.show({ color: 'red', message: e.message }),
  });
  const editable = canEditIncidents(role);

  return (
    <Stack gap={8}>
      <Panel
        title={
          <>
            {t('incidents.unassigned')}
            <Badge color="grape" variant="light" ml={6}>
              {unassigned.length}
            </Badge>
          </>
        }
        state={{
          isLoading: unclassified.some((q) => q.isLoading && !q.data),
          isError: unclassified.some((q) => q.isError),
          error: unclassified.find((q) => q.error)?.error,
          isEmpty: unclassified.every((q) => q.data) && unassigned.length === 0,
          refetch: () => unclassified.forEach((q) => void q.refetch()),
        }}
        exportName="unassigned-stops"
        rows={() =>
          unassigned.map((i) => ({
            machine: i.machine.name,
            state: t(`state.${i.effectiveState}`),
            from: formatDateTime(Date.parse(i.from)),
            duration: formatDuration(i.durationSec),
          }))
        }
        minBodyHeight={120}
      >
        <Table.ScrollContainer minWidth={700} mah={360}>
          <Table fz="sm" striped stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('incident.machine')}</Table.Th>
                <Table.Th>{t('intervals.state')}</Table.Th>
                <Table.Th>{t('intervals.from')}</Table.Th>
                <Table.Th>{t('intervals.duration')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {unassigned.slice(0, 300).map((i) => (
                <Table.Tr key={`${i.machine.id}-${i.from}`}>
                  <Table.Td>
                    <Link to="/machines/$machineId" params={{ machineId: i.machine.id }}>
                      {i.machine.name}
                    </Link>
                  </Table.Td>
                  <Table.Td>{t(`state.${i.effectiveState}`)}</Table.Td>
                  <Table.Td>{formatDateTime(Date.parse(i.from))}</Table.Td>
                  <Table.Td>{formatDuration(i.durationSec)}</Table.Td>
                  <Table.Td>
                    {editable && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="grape"
                        onClick={() => open({ machineId: i.machine.id, from: Date.parse(i.from), to: i.openEnded ? null : Date.parse(i.to) })}
                      >
                        {t('intervals.setReason')}
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>

      <Panel
        title={t('incidents.title')}
        state={{
          isLoading: incidents.isLoading,
          isError: incidents.isError,
          error: incidents.error,
          isEmpty: incidents.data?.length === 0,
          refetch: () => void incidents.refetch(),
        }}
        exportName="incidents"
        rows={() =>
          (incidents.data ?? []).map((i) => ({
            machine: i.machine.name,
            line: i.machine.lineName ?? '',
            from: formatDateTime(Date.parse(i.from)),
            to: i.to ? formatDateTime(Date.parse(i.to)) : '',
            effect: EFFECT_LABEL[i.effectType],
            state: i.stateOverride ? t(`state.${i.stateOverride}`) : '',
            reason: i.lossReason?.name ?? '',
            comment: i.comment ?? '',
            author: i.author ?? '',
            createdAt: formatDateTime(Date.parse(i.createdAt)),
          }))
        }
        minBodyHeight={120}
      >
        <Table.ScrollContainer minWidth={1000}>
          <Table fz="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('incident.machine')}</Table.Th>
                <Table.Th>{t('intervals.from')}</Table.Th>
                <Table.Th>{t('intervals.to')}</Table.Th>
                <Table.Th>{t('incidents.effect')}</Table.Th>
                <Table.Th>{t('intervals.reason')}</Table.Th>
                <Table.Th>{t('intervals.comment')}</Table.Th>
                <Table.Th>{t('intervals.author')}</Table.Th>
                <Table.Th>{t('incidents.createdAt')}</Table.Th>
                {editable && <Table.Th>{t('incidents.actions')}</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(incidents.data ?? []).map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>
                    <Link to="/machines/$machineId" params={{ machineId: i.machineId }}>
                      {i.machine.name}
                    </Link>
                  </Table.Td>
                  <Table.Td>{formatDateTime(Date.parse(i.from))}</Table.Td>
                  <Table.Td>{i.to ? formatDateTime(Date.parse(i.to)) : <Badge size="xs" variant="dot">{t('intervals.ongoing')}</Badge>}</Table.Td>
                  <Table.Td>
                    {EFFECT_LABEL[i.effectType]}
                    {i.stateOverride ? `: ${t(`state.${i.stateOverride}`)}` : ''}
                  </Table.Td>
                  <Table.Td>{i.lossReason?.name ?? '—'}</Table.Td>
                  <Table.Td>{i.comment}</Table.Td>
                  <Table.Td>{i.author}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {formatDateTime(Date.parse(i.createdAt))}
                    </Text>
                  </Table.Td>
                  {editable && (
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        {!i.to && (
                          <Button size="compact-xs" variant="light" loading={closeNow.isPending && closeNow.variables === i.id} onClick={() => closeNow.mutate(i.id)}>
                            {t('incident.close')}
                          </Button>
                        )}
                        <Button size="compact-xs" variant="subtle" color="red" loading={cancel.isPending && cancel.variables === i.id} onClick={() => cancel.mutate(i.id)}>
                          {t('incident.cancelIncident')}
                        </Button>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
    </Stack>
  );
}
