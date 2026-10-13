import { Badge, Button, CloseButton, Group, MultiSelect, Pagination, Select, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconFilter } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useReasons } from '@/entities/loss-reason';
import { StateDot } from '@/entities/machine';
import { useDrilldown } from '@/features/losses-drilldown';
import { usePeriod } from '@/features/period-filter';
import { useIncidentModal } from '@/features/register-incident';
import { api, incidentById, type IntervalFilters, type ManualIncident, type MachineState } from '@/shared/api';
import { isLoss, isStop, OTHER_REASON, STATE_CODES, UNKNOWN_REASON } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, formatDuration, getAppTimezone, shiftWindows } from '@/shared/lib';
import { canEditIncidents, useUiStore } from '@/shared/model';
import { Panel, type PanelContext } from '@/shared/ui';

interface Row {
  from: number;
  end: number;
  ongoing: boolean;
  durationSec: number;
  state: MachineState;
  manual: boolean;
  reasonKey: string | null;
  incident?: ManualIncident;
}
const col = createColumnHelper<Row>();

export function IntervalsTable({ ctx }: { ctx: PanelContext }) {
  const machineId = ctx.machineId!;
  const { t } = useTranslation();
  const period = usePeriod();
  const reasons = useReasons();
  const { filter: drill, clear: clearDrill } = useDrilldown();
  const openIncident = useIncidentModal((s) => s.open);
  const role = useUiStore((s) => s.role);
  const [states, setStates] = useState<string[]>([]);
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'from', desc: true }]);
  const [page, setPage] = useState(0);

  useEffect(() => clearDrill(), [machineId, clearDrill]);

  const reasonKey = reasonFilter ?? (drill?.reasonId && drill.reasonId !== OTHER_REASON ? drill.reasonId : null);
  const filters: IntervalFilters = {
    ...(states.length ? { state: states as MachineState[] } : {}),
    ...(reasonKey === UNKNOWN_REASON ? { unclassifiedOnly: true, lossOnly: true } : reasonKey ? { lossReasonId: reasonKey } : {}),
  };
  const range = drill?.from != null ? { from: drill.from, to: drill.to ?? period.to } : { from: period.from, to: period.to };
  const q = useQuery({ ...api.stateIntervals(machineId, { ...range, asOf: period.params.asOf }, filters), placeholderData: keepPreviousData });
  const incidentsQ = useQuery(api.machineIncidents(machineId, range));
  const incidents = useMemo(() => incidentById(incidentsQ.data), [incidentsQ.data]);

  const data = useMemo<Row[]>(() => {
    const windows = shiftWindows(period.from, period.to, period.shiftId, getAppTimezone());
    return (q.data?.items ?? [])
      .map((i) => ({
        from: Date.parse(i.from),
        end: Date.parse(i.to),
        ongoing: !!i.openEnded,
        durationSec: i.durationSec,
        state: i.effectiveState,
        manual: i.stateSource === 'MANUAL',
        reasonKey: isLoss(i.effectiveState) ? (i.lossReason?.id ?? UNKNOWN_REASON) : null,
        incident: incidents.get(i.reasonIncidentId ?? '') ?? incidents.get(i.stateIncidentId ?? ''),
      }))
      .filter((i) => windows.some((w) => i.from < w.to && i.end > w.from));
  }, [q.data, incidents, period.from, period.to, period.shiftId]);

  useEffect(() => setPage(0), [data.length]);

  const columns = useMemo(
    () => [
      col.accessor('from', { header: t('intervals.from'), cell: (c) => formatDateTime(c.getValue()) }),
      col.accessor('end', {
        header: t('intervals.to'),
        cell: (c) => (c.row.original.ongoing ? <Badge size="xs" variant="dot">{t('intervals.ongoing')}</Badge> : formatDateTime(c.getValue())),
      }),
      col.accessor('durationSec', { header: t('intervals.duration'), cell: (c) => formatDuration(c.getValue()) }),
      col.accessor('state', {
        header: t('intervals.state'),
        cell: (c) => (
          <Group gap={6} wrap="nowrap">
            <StateDot state={c.getValue()} />
            {t(`state.${c.getValue()}`)}
            {c.row.original.manual && (
              <Tooltip label="Состояние задано инцидентом">
                <Badge size="xs" variant="outline">
                  вручную
                </Badge>
              </Tooltip>
            )}
          </Group>
        ),
      }),
      col.accessor((r) => (r.reasonKey ? reasons.nameOf(r.reasonKey) : ''), {
        id: 'reason',
        header: t('intervals.reason'),
        cell: (c) => {
          const r = c.row.original;
          if (isStop(r.state) && r.reasonKey === UNKNOWN_REASON) {
            return (
              <Group gap={6} wrap="nowrap">
                <Text size="sm" c="grape.4" fw={600}>
                  {t('reason.unknown')}
                </Text>
                {canEditIncidents(role) && (
                  <Button size="compact-xs" variant="light" color="grape" onClick={() => openIncident({ machineId, from: r.from, to: r.ongoing ? null : r.end })}>
                    {t('intervals.setReason')}
                  </Button>
                )}
              </Group>
            );
          }
          return r.reasonKey ? reasons.nameOf(r.reasonKey) : '';
        },
      }),
      col.accessor((r) => r.incident?.comment ?? '', { id: 'comment', header: t('intervals.comment'), enableSorting: false }),
      col.accessor((r) => r.incident?.author ?? '', { id: 'author', header: t('intervals.author') }),
    ],
    [t, reasons, role, openIncident, machineId],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination: { pageIndex: page, pageSize: 15 } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const unknownCount = data.filter((r) => isStop(r.state) && r.reasonKey === UNKNOWN_REASON).length;

  return (
    <Panel
      title={
        <>
          {t('intervals.title')}
          {unknownCount > 0 && (
            <Badge ml={8} size="sm" color="grape" variant="light">
              {t('reason.unknown')}: {unknownCount}
            </Badge>
          )}
        </>
      }
      state={{ isLoading: q.isLoading && !q.data, isError: q.isError, error: q.error, refetch: () => void q.refetch() }}
      exportName={`intervals-${machineId}`}
      rows={() =>
        table.getSortedRowModel().rows.map(({ original: r }) => ({
          [t('intervals.from')]: formatDateTime(r.from),
          [t('intervals.to')]: r.ongoing ? t('intervals.ongoing') : formatDateTime(r.end),
          [t('intervals.duration')]: formatDuration(r.durationSec),
          [t('intervals.state')]: t(`state.${r.state}`),
          [t('intervals.reason')]: r.reasonKey ? reasons.nameOf(r.reasonKey) : '',
          [t('intervals.comment')]: r.incident?.comment ?? '',
          [t('intervals.author')]: r.incident?.author ?? '',
        }))
      }
    >
      <Group gap="xs" mb="xs" wrap="wrap">
        <MultiSelect
          size="xs"
          w={{ base: '100%', xs: 260 }}
          placeholder={t('intervals.filterState')}
          aria-label={t('intervals.filterState')}
          data={STATE_CODES.map((s) => ({ value: s, label: t(`state.${s}`) }))}
          value={states}
          onChange={setStates}
          clearable
        />
        <Select
          size="xs"
          w={{ base: '100%', xs: 220 }}
          placeholder={t('intervals.filterReason')}
          aria-label={t('intervals.filterReason')}
          data={[{ value: UNKNOWN_REASON, label: t('reason.unknown') }, ...reasons.list.map((r) => ({ value: r.id, label: r.name }))]}
          value={reasonFilter}
          onChange={setReasonFilter}
          clearable
        />
        <Button size="compact-sm" variant="subtle" onClick={() => setStates(['IDLE', 'DOWN'])}>
          {t('intervals.onlyStops')}
        </Button>
        {drill && (
          <Badge
            size="lg"
            variant="light"
            leftSection={<IconFilter size={12} />}
            rightSection={<CloseButton size="xs" onClick={clearDrill} aria-label="Сбросить фильтр" />}
            style={{ textTransform: 'none' }}
          >
            {t('intervals.filterFromChart')}: {drill.label}
          </Badge>
        )}
      </Group>
      <Table.ScrollContainer minWidth={900}>
        <Table striped highlightOnHover fz="sm" verticalSpacing={4}>
          <Table.Thead>
            {table.getHeaderGroups().map((hg) => (
              <Table.Tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const Icon = sorted === 'asc' ? IconArrowUp : sorted === 'desc' ? IconArrowDown : IconArrowsSort;
                  return (
                    <Table.Th key={h.id} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}>
                      {h.column.getCanSort() ? (
                        <UnstyledButton onClick={h.column.getToggleSortingHandler()} fw={600} fz="sm">
                          <Group gap={4} wrap="nowrap">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <Icon size={12} opacity={sorted ? 1 : 0.4} />
                          </Group>
                        </UnstyledButton>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map((c) => (
                  <Table.Td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</Table.Td>
                ))}
              </Table.Tr>
            ))}
            {data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Text c="dimmed" ta="center" size="sm" py="md">
                    {t('panel.empty')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Group justify="space-between" mt="xs" gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          {data.length} записей{q.data?.truncated ? ' (показаны первые 5000 — сузьте период)' : ''}
        </Text>
        <Pagination size="sm" siblings={1} boundaries={1} total={table.getPageCount()} value={page + 1} onChange={(p) => setPage(p - 1)} />
      </Group>
    </Panel>
  );
}
