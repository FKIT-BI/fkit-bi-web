import { Badge, Button, CloseButton, Group, MultiSelect, Pagination, Select, Table, Text, UnstyledButton } from '@mantine/core';
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
import { api, type StateInterval } from '@/shared/api';
import { isStop, STATE_CODES, UNKNOWN_REASON, type StateCode } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, formatDuration, getAppTimezone, shiftWindows } from '@/shared/lib';
import { canEditIncidents, useUiStore } from '@/shared/model';
import { Panel, type PanelContext } from '@/shared/ui';

type Row = StateInterval & { end: number; durationSec: number };
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

  const q = useQuery({ ...api.intervals(machineId, period.params), placeholderData: keepPreviousData });

  useEffect(() => clearDrill(), [machineId, clearDrill]);

  const data = useMemo<Row[]>(() => {
    const windows = shiftWindows(period.from, period.to, period.shift, getAppTimezone());
    return (q.data ?? [])
      .map((i) => {
        const end = i.to ?? period.now;
        return { ...i, end, durationSec: (end - i.from) / 1000 };
      })
      .filter((i) => windows.some((w) => i.from < w.to && i.end > w.from))
      .filter((i) => !states.length || states.includes(i.stateCode))
      .filter((i) => {
        const r = reasonFilter ?? drill?.reasonId;
        if (!r) return true;
        if (i.stateCode === 'RUN' || i.stateCode === 'OFFLINE') return false;
        return r === UNKNOWN_REASON ? !i.reasonId : i.reasonId === r;
      })
      .filter((i) => !drill?.from || (i.from < (drill.to ?? Infinity) && i.end > drill.from));
  }, [q.data, period, states, reasonFilter, drill]);

  useEffect(() => setPage(0), [data.length]);

  const columns = useMemo(
    () => [
      col.accessor('from', { header: t('intervals.from'), cell: (c) => formatDateTime(c.getValue()) }),
      col.accessor('end', {
        header: t('intervals.to'),
        cell: (c) => (c.row.original.to == null ? <Badge size="xs" variant="dot">{t('intervals.ongoing')}</Badge> : formatDateTime(c.getValue())),
      }),
      col.accessor('durationSec', { header: t('intervals.duration'), cell: (c) => formatDuration(c.getValue()) }),
      col.accessor('stateCode', {
        header: t('intervals.state'),
        cell: (c) => (
          <Group gap={6} wrap="nowrap">
            <StateDot state={c.getValue()} />
            {t(`state.${c.getValue()}`)}
          </Group>
        ),
      }),
      col.accessor((r) => (r.stateCode === 'RUN' || r.stateCode === 'OFFLINE' ? '' : reasons.nameOf(r.reasonId)), {
        id: 'reason',
        header: t('intervals.reason'),
        cell: (c) => {
          const r = c.row.original;
          if (isStop(r.stateCode) && !r.reasonId) {
            return (
              <Group gap={6} wrap="nowrap">
                <Text size="sm" c="grape.4" fw={600}>
                  {t('reason.unknown')}
                </Text>
                {canEditIncidents(role) && (
                  <Button size="compact-xs" variant="light" color="grape" onClick={() => openIncident({ machineId, from: r.from, to: r.to })}>
                    {t('intervals.setReason')}
                  </Button>
                )}
              </Group>
            );
          }
          return r.stateCode === 'RUN' || r.stateCode === 'OFFLINE' ? '' : reasons.nameOf(r.reasonId);
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

  const unknownCount = data.filter((r) => isStop(r.stateCode) && !r.reasonId).length;

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
          [t('intervals.to')]: r.to == null ? t('intervals.ongoing') : formatDateTime(r.end),
          [t('intervals.duration')]: formatDuration(r.durationSec),
          [t('intervals.state')]: t(`state.${r.stateCode}`),
          [t('intervals.reason')]: r.stateCode === 'RUN' || r.stateCode === 'OFFLINE' ? '' : reasons.nameOf(r.reasonId),
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
        <Button size="compact-sm" variant="subtle" onClick={() => setStates(['IDLE', 'DOWN'] satisfies StateCode[])}>
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
          {data.length} записей
        </Text>
        <Pagination size="sm" siblings={1} boundaries={1} total={table.getPageCount()} value={page + 1} onChange={(p) => setPage(p - 1)} />
      </Group>
    </Panel>
  );
}
