import { Group, Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { useTranslation } from '@/shared/i18n';
import { addDaysToDate, dayStartMs, getAppTimezone, localDate, PERIOD_PRESETS, toIso, type PeriodPreset } from '@/shared/lib';
import { useDashboardSearch, useRefreshStore } from '@/shared/model';
import { usePeriod } from './usePeriod';

export function PeriodPicker() {
  const { t } = useTranslation();
  const [, update] = useDashboardSearch();
  const bump = useRefreshStore((s) => s.bump);
  const period = usePeriod();
  const tz = getAppTimezone();

  return (
    <Group gap={6} wrap="wrap">
      <Select
        size="xs"
        w={150}
        aria-label="Период"
        leftSection={<IconCalendar size={14} />}
        data={PERIOD_PRESETS.map((p) => ({ value: p, label: t(`period.${p}`) }))}
        value={period.preset}
        allowDeselect={false}
        onChange={(v) => {
          const range = v as PeriodPreset;
          bump();
          if (range === 'custom') {
            update({ range, from: toIso(period.from), to: toIso(Math.min(period.to, Date.now())) });
          } else {
            update({ range, from: undefined, to: undefined });
          }
        }}
      />
      {period.preset === 'custom' && (
        <DatePickerInput
          size="xs"
          type="range"
          w={200}
          aria-label="Произвольный период"
          valueFormat="DD.MM.YYYY"
          allowSingleDateInRange
          maxDate={localDate(Date.now(), tz)}
          value={[localDate(period.from, tz), localDate(period.to - 1, tz)]}
          onChange={([a, b]) => {
            if (!a || !b) return;
            update({ range: 'custom', from: toIso(dayStartMs(a, tz)), to: toIso(dayStartMs(addDaysToDate(b, 1), tz)) });
          }}
        />
      )}
    </Group>
  );
}

export function useNarrowPeriod() {
  const [, update] = useDashboardSearch();
  return (from: number, to: number) => update({ range: 'custom', from: toIso(from), to: toIso(to) });
}
