import { Autocomplete, Collapse, Group, NativeSelect, NumberInput, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { setup } from '@/shared/api';
import { HINT } from '@/shared/i18n';
import { rateUnitError, unitOptions } from '@/shared/lib';
import { HintLabel } from '@/shared/ui';
import { explain, saveMachine } from '../actions';
import type { MachineFields } from '../draft';
import { MACHINE_TYPES } from '../templates';
import { sk, type StepProps } from './types';

export function MachineStep({ draft: d, patch, register }: StepProps) {
  const qc = useQueryClient();
  const units = useQuery({ queryKey: sk('measurement-units'), queryFn: setup.measurementUnits, staleTime: Infinity });
  const [passport, setPassport] = useState(!!(d.machine.inventoryNo || d.machine.manufacturer || d.machine.model || d.machine.year));
  const m = d.machine;
  const set = (p: Partial<MachineFields>) => patch({ machine: { ...m, ...p } });
  const pair = rateUnitError(m.nominalRate, m.productionUnit);

  register(async () => {
    if (!m.name.trim()) return ['Введите название машины.'];
    if (pair.nominalRate || pair.productionUnit) return [pair.nominalRate ?? pair.productionUnit ?? ''];
    try {
      patch(await saveMachine(d));
      await qc.invalidateQueries({ queryKey: ['setup'] });
      return [];
    } catch (e) {
      return [explain(e)];
    }
  });

  return (
    <Stack gap="sm" maw={640}>
      <TextInput label="Название" placeholder="Экструдер Э-1" required data-autofocus value={m.name} onChange={(e) => set({ name: e.currentTarget.value })} />
      <Autocomplete label={<HintLabel hint={HINT.machineType}>Тип машины</HintLabel>} description="По типу мастер предложит набор сигналов" placeholder="Экструдер" data={MACHINE_TYPES} value={m.machineType} onChange={(machineType) => set({ machineType })} />
      <div>
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <NumberInput style={{ flex: 1 }} label={<HintLabel hint={HINT.nominalRate}>Норма выпуска в час</HintLabel>} description="Можно пропустить" min={0} value={m.nominalRate} error={pair.nominalRate} onChange={(v) => set({ nominalRate: v === '' ? '' : Number(v) })} />
          <NativeSelect w={200} label="Единица выпуска" description="штуки, метры…" value={m.productionUnit} error={pair.productionUnit} data={unitOptions(units.data ?? [], m.productionUnit, 'Не выбрана')} onChange={(e) => set({ productionUnit: e.currentTarget.value })} />
        </Group>
      </div>
      <UnstyledButton onClick={() => setPassport((x) => !x)} aria-expanded={passport}>
        <Group gap={4}>
          {passport ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="sm" fw={500}>Паспорт (необязательно)</Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={passport}>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <TextInput label="Инвентарный номер" value={m.inventoryNo} onChange={(e) => set({ inventoryNo: e.currentTarget.value })} />
          <TextInput label="Производитель" value={m.manufacturer} onChange={(e) => set({ manufacturer: e.currentTarget.value })} />
          <TextInput label="Модель" value={m.model} onChange={(e) => set({ model: e.currentTarget.value })} />
          <NumberInput label="Год ввода" min={1900} max={9999} allowDecimal={false} value={m.year} onChange={(v) => set({ year: v === '' ? '' : Number(v) })} />
        </SimpleGrid>
      </Collapse>
      <Text size="xs" c="dimmed">Код машины создаётся из названия автоматически. Машина остаётся «Не подключена», пока вы не завершите настройку.</Text>
    </Stack>
  );
}
