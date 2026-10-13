import { SegmentedControl } from '@mantine/core';
import { useTranslation } from '@/shared/i18n';
import { getAppShifts } from '@/shared/lib';
import { useDashboardSearch } from '@/shared/model';

export function ShiftFilter() {
  const { t } = useTranslation();
  const [search, update] = useDashboardSearch();
  const shifts = getAppShifts();
  return (
    <SegmentedControl
      size="xs"
      aria-label="Смена"
      value={search.shift && shifts.some((s) => s.code === search.shift) ? search.shift : 'all'}
      onChange={(v) => update({ shift: v === 'all' ? undefined : v })}
      data={[{ value: 'all', label: t('shift.all') }, ...shifts.map((s) => ({ value: s.code, label: s.name }))]}
    />
  );
}
