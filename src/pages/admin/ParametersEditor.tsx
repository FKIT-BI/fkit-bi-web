import { ActionIcon, Button, Group, NativeSelect, NumberInput, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { MeasurementUnit, TypedParameter } from '@/shared/api';
import { makeCode } from '@/shared/lib';
import { unitOptions } from './units';

type Row = { code: string; name: string; valueType: 'STRING' | 'NUMBER' | 'BOOLEAN'; value: string | number | boolean; unitCode?: string | null; sortOrder: number };

const initial = (t: Row['valueType']): Row['value'] => (t === 'NUMBER' ? 0 : t === 'BOOLEAN' ? false : '');

export function ParametersEditor({ value, units, errorFor, onChange }: { value: TypedParameter[]; units: MeasurementUnit[]; errorFor?: (path: string) => string | undefined; onChange: (v: TypedParameter[]) => void }) {
  const rows = value as unknown as Row[];
  const set = (i: number, p: Partial<Row>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...p } : r)) as unknown as TypedParameter[]);
  const others = (i: number) => rows.filter((_, n) => n !== i).map((r) => r.code);
  /** Пока код пуст или совпадает с автоматическим — он следует за названием. */
  const rename = (i: number, name: string) => {
    const r = rows[i];
    const auto = !r.code || r.code === makeCode(r.name, 'PARAM', others(i));
    set(i, auto ? { name, code: makeCode(name, 'PARAM', others(i)) } : { name });
  };
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text size="sm" fw={500}>Параметры</Text>
        <Button size="compact-xs" variant="light" leftSection={<IconPlus size={12} />} disabled={rows.length >= 100}
          onClick={() => onChange([...rows, { code: '', name: '', valueType: 'STRING', value: '', sortOrder: rows.length }] as unknown as TypedParameter[])}>
          Добавить
        </Button>
      </Group>
      {rows.map((r, i) => (
        <Group key={i} gap={6} align="flex-end" wrap="wrap">
          <TextInput size="xs" label={i === 0 ? 'Название' : undefined} style={{ flex: 1, minWidth: 120 }} value={r.name} onChange={(e) => rename(i, e.currentTarget.value)} />
          <TextInput size="xs" label={i === 0 ? 'Код' : undefined} description={i === 0 ? 'из названия' : undefined} w={130} ff="monospace" value={r.code} onChange={(e) => set(i, { code: e.currentTarget.value.toUpperCase() })} />
          <NativeSelect size="xs" label={i === 0 ? 'Тип' : undefined} value={r.valueType} data={[{ value: 'STRING', label: 'Текст' }, { value: 'NUMBER', label: 'Число' }, { value: 'BOOLEAN', label: 'Да/нет' }]}
            onChange={(e) => { const t = e.currentTarget.value as Row['valueType']; set(i, { valueType: t, value: initial(t), unitCode: t === 'NUMBER' ? r.unitCode : undefined }); }} />
          {r.valueType === 'NUMBER' && <NumberInput size="xs" label={i === 0 ? 'Значение' : undefined} w={110} value={Number(r.value)} onChange={(v) => set(i, { value: Number(v || 0) })} />}
          {r.valueType === 'STRING' && <TextInput size="xs" label={i === 0 ? 'Значение' : undefined} w={110} value={String(r.value)} onChange={(e) => set(i, { value: e.currentTarget.value })} />}
          {r.valueType === 'BOOLEAN' && <Switch size="sm" mb={4} w={110} checked={!!r.value} onChange={(e) => set(i, { value: e.currentTarget.checked })} />}
          {r.valueType === 'NUMBER' && <NativeSelect size="xs" label={i === 0 ? 'Ед.' : undefined} w={150} value={r.unitCode ?? ''} data={unitOptions(units, r.unitCode, 'Без единицы')} error={errorFor?.(`parameters[${i}].unitCode`)} onChange={(e) => set(i, { unitCode: e.currentTarget.value || null })} />}
          <ActionIcon variant="subtle" color="red" aria-label="Удалить параметр" onClick={() => onChange(rows.filter((_, n) => n !== i).map((x, n) => ({ ...x, sortOrder: n })) as unknown as TypedParameter[])}><IconTrash size={14} /></ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
