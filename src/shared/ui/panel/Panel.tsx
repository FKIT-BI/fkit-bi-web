import { ActionIcon, Button, Menu, Modal, ScrollArea, Skeleton, Stack, Table, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconDownload,
  IconMaximize,
  IconMinimize,
  IconTable,
  IconDatabaseOff,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { useState, type ReactNode } from 'react';
import { useTranslation } from '../../i18n';
import { formatApiError } from '../../api';
import { downloadCsv, type Row } from '../csv';
import classes from './Panel.module.css';

export interface PanelState {
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  refetch?: () => unknown;
}

export interface PanelProps {
  title: ReactNode;
  actions?: ReactNode;
  state?: PanelState;
  rows?: () => Row[];
  exportName?: string;
  minBodyHeight?: number;
  children: ReactNode;
}

export function Panel({ title, actions, state, rows, exportName, minBodyHeight = 200, children }: PanelProps) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 36em)');

  let body: ReactNode = children;
  if (state?.isLoading) {
    body = (
      <Stack gap={8} style={{ minHeight: minBodyHeight }} aria-busy>
        <Skeleton height={16} width="40%" />
        <Skeleton height={minBodyHeight - 40} />
      </Stack>
    );
  } else if (state?.isError) {
    body = (
      <div className={classes.center} style={{ minHeight: minBodyHeight }} role="alert">
        <IconAlertTriangle size={28} color="var(--mantine-color-red-6)" />
        <div>{t('panel.error')}</div>
        <div style={{ fontSize: 12 }}>{formatApiError(state.error)}</div>
        {state.refetch && (
          <Button size="xs" variant="light" onClick={() => state.refetch?.()}>
            {t('panel.retry')}
          </Button>
        )}
      </div>
    );
  } else if (state?.isEmpty) {
    body = (
      <div className={classes.center} style={{ minHeight: minBodyHeight }}>
        <IconDatabaseOff size={28} />
        <div>{t('panel.empty')}</div>
      </div>
    );
  }

  const tableRows = tableOpen && rows ? rows() : [];
  const cols = tableRows.length ? Object.keys(tableRows[0]) : [];

  return (
    <section className={`${classes.panel} ${fullscreen ? classes.fullscreen : ''}`} aria-label={typeof title === 'string' ? title : undefined}>
      <header className={classes.header}>
        <h2 className={classes.title} style={{ margin: 0 }}>{title}</h2>
        {actions}
        {fullscreen && (
          <Tooltip label={t('panel.exitFullscreen')}>
            <ActionIcon variant="subtle" color="gray" onClick={() => setFullscreen(false)} aria-label={t('panel.exitFullscreen')}>
              <IconMinimize size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={t('panel.menu')}>
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={fullscreen ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? t('panel.exitFullscreen') : t('panel.fullscreen')}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconDownload size={14} />}
              disabled={!rows || state?.isLoading || state?.isError}
              onClick={() => rows && downloadCsv(exportName ?? 'panel', rows())}
            >
              {t('panel.csv')}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconTable size={14} />}
              disabled={!rows || state?.isLoading || state?.isError}
              onClick={() => setTableOpen(true)}
            >
              {t('panel.table')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </header>
      <div className={classes.body}>{body}</div>

      <Modal opened={tableOpen} onClose={() => setTableOpen(false)} title={title} size="xl" fullScreen={isMobile}>
        <ScrollArea.Autosize mah="70vh">
          <Table striped stickyHeader fz="xs">
            <Table.Thead>
              <Table.Tr>{cols.map((c) => <Table.Th key={c}>{c}</Table.Th>)}</Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tableRows.slice(0, 1000).map((r, i) => (
                <Table.Tr key={i}>{cols.map((c) => <Table.Td key={c}>{r[c] ?? ''}</Table.Td>)}</Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Modal>
    </section>
  );
}
