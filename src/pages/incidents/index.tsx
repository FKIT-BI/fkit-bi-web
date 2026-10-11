import { Badge, Button, Stack, Table, Text } from '@mantine/core';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEnterpriseTree } from '@/entities/enterprise';
import { useReasons } from '@/entities/loss-reason';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, type StateInterval } from '@/shared/api';
import { isStop } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, formatDuration } from '@/shared/lib';
import { canEditIncidents, useUiStore } from '@/shared/model';
import { Panel } from '@/shared/ui';

export default function IncidentsPage() {
  const { t } = useTranslation();
  const period = usePeriod();
  const tree = useEnterpriseTree();
  const reasons = useReasons();
  const open = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);
  const incidents = useQuery({ ...api.incidents({ from: period.from, to: period.to }), placeholderData: keepPreviousData });
  const intervals = useQueries({
    queries: tree.machines.map((m) => ({ ...api.intervals(m.id, period.params), placeholderData: (p: StateInterval[] | undefined) => p })),
  });
  const machineName = (id: string) => tree.machines.find((m) => m.id === id)?.name ?? id;
  const unassigned = intervals
    .flatMap((q) => q.data ?? [])
    .filter((i) => isStop(i.stateCode) && !i.reasonId)
    .sort((a, b) => b.from - a.from);

  return (
    <Stack gap={8}>
      <div>
        <Panel
          title={
            <>
              {t('incidents.unassigned')}{' '}
              <Badge color="grape" variant="light" ml={6}>
                {unassigned.length}
              </Badge>
            </>
          }
          state={{ isLoading: intervals.some((q) => q.isLoading && !q.data), isEmpty: intervals.every((q) => q.data) && unassigned.length === 0 }}
          exportName="unassigned-stops"
          rows={() => unassigned.map((i) => ({ machine: machineName(i.machineId), state: t(`state.${i.stateCode}`), from: formatDateTime(i.from), duration: formatDuration(((i.to ?? period.now) - i.from) / 1000) }))}
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
                {unassigned.slice(0, 200).map((i) => (
                  <Table.Tr key={`${i.machineId}-${i.from}`}>
                    <Table.Td>
                      <Link to="/machines/$machineId" params={{ machineId: i.machineId }}>
                        {machineName(i.machineId)}
                      </Link>
                    </Table.Td>
                    <Table.Td>{t(`state.${i.stateCode}`)}</Table.Td>
                    <Table.Td>{formatDateTime(i.from)}</Table.Td>
                    <Table.Td>{formatDuration(((i.to ?? period.now) - i.from) / 1000)}</Table.Td>
                    <Table.Td>
                      {canEditIncidents(role) && (
                        <Button size="compact-xs" variant="light" color="grape" onClick={() => open({ machineId: i.machineId, from: i.from, to: i.to })}>
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
      </div>
      <div>
        <Panel
          title={t('incidents.title')}
          state={{ isLoading: incidents.isLoading, isError: incidents.isError, error: incidents.error, isEmpty: incidents.data?.length === 0, refetch: () => void incidents.refetch() }}
          exportName="incidents"
          rows={() => (incidents.data ?? []).map((i) => ({ machine: machineName(i.machineId), from: formatDateTime(i.from), to: i.to ? formatDateTime(i.to) : '', reason: reasons.nameOf(i.reasonId), comment: i.comment, author: i.author, createdAt: formatDateTime(i.createdAt) }))}
          minBodyHeight={120}
        >
          <Table fz="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('incident.machine')}</Table.Th>
                <Table.Th>{t('intervals.from')}</Table.Th>
                <Table.Th>{t('intervals.to')}</Table.Th>
                <Table.Th>{t('intervals.reason')}</Table.Th>
                <Table.Th>{t('intervals.comment')}</Table.Th>
                <Table.Th>{t('intervals.author')}</Table.Th>
                <Table.Th>{t('incidents.createdAt')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(incidents.data ?? []).map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>{machineName(i.machineId)}</Table.Td>
                  <Table.Td>{formatDateTime(i.from)}</Table.Td>
                  <Table.Td>{i.to ? formatDateTime(i.to) : <Badge size="xs" variant="dot">{t('intervals.ongoing')}</Badge>}</Table.Td>
                  <Table.Td>{reasons.nameOf(i.reasonId)}</Table.Td>
                  <Table.Td>{i.comment}</Table.Td>
                  <Table.Td>{i.author}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{formatDateTime(i.createdAt)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Panel>
      </div>
    </Stack>
  );
}
