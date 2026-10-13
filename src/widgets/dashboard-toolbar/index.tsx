import { Group } from '@mantine/core';
import { AutoRefresh } from '@/features/auto-refresh';
import { PeriodPicker } from '@/features/period-filter';
import { ShiftFilter } from '@/features/shift-filter';

export function DashboardToolbar() {
  return (
    <Group
      gap={8}
      justify="flex-end"
      wrap="wrap"
      py={6}
      mb={4}
      style={{
        position: 'sticky',
        top: 'var(--app-shell-header-offset, 0px)',
        zIndex: 20,
        background: 'var(--app-bg)',
      }}
    >
      <PeriodPicker />
      <ShiftFilter />
      <AutoRefresh />
    </Group>
  );
}
