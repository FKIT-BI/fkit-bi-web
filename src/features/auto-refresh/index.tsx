import { ActionIcon, Group, Select, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useIsFetching } from '@tanstack/react-query';
import { useEffect } from 'react';
import { REFRESH_MS, REFRESH_OPTIONS, type RefreshOption } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { useDashboardSearch, useRefreshStore } from '@/shared/model';

export function useAutoRefresh() {
  const [search] = useDashboardSearch();
  const bump = useRefreshStore((s) => s.bump);
  const ms = REFRESH_MS[search.refresh ?? 'off'];
  useEffect(() => {
    if (!ms) return;
    const id = setInterval(bump, ms);
    return () => clearInterval(id);
  }, [ms, bump]);
}

export function AutoRefresh() {
  const { t } = useTranslation();
  const [search, update] = useDashboardSearch();
  const bump = useRefreshStore((s) => s.bump);
  const fetching = useIsFetching() > 0;
  return (
    <Group gap={0} wrap="nowrap">
      <Tooltip label={t('refresh.button')}>
        <ActionIcon variant="default" size={30} onClick={bump} aria-label={t('refresh.button')} loading={fetching} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <IconRefresh size={16} />
        </ActionIcon>
      </Tooltip>
      <Select
        size="xs"
        w={84}
        aria-label={t('refresh.auto')}
        data={REFRESH_OPTIONS.map((v) => ({ value: v, label: t(`refresh.${v}`) }))}
        value={search.refresh ?? 'off'}
        allowDeselect={false}
        onChange={(v) => update({ refresh: v === 'off' ? undefined : (v as RefreshOption) })}
        styles={{ input: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 } }}
      />
    </Group>
  );
}
