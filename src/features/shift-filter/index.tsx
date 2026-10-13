import { SegmentedControl } from '@mantine/core';
import { useTranslation } from '@/shared/i18n';
import { useDashboardSearch } from '@/shared/model';

export function ShiftFilter() {
  const { t } = useTranslation();
  const [search, update] = useDashboardSearch();
  return (
    <SegmentedControl
      size="xs"
      aria-label="Смена"
      value={search.shift ?? 'all'}
      onChange={(v) => update({ shift: v === 'all' ? undefined : (v as 'day' | 'night') })}
      data={(['all', 'day', 'night'] as const).map((v) => ({ value: v, label: t(`shift.${v}`) }))}
    />
  );
}
