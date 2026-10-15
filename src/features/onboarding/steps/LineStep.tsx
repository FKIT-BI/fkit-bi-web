import { Alert, Card, Group, Radio, Stack, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setup } from '@/shared/api';
import { explain, saveLine } from '../actions';
import { sk, type StepProps } from './types';

export function LineStep({ draft: d, patch, register }: StepProps) {
  const qc = useQueryClient();
  const lines = useQuery({ queryKey: sk('lines-all', d.enterpriseId), queryFn: () => setup.allLines(d.enterpriseId), enabled: !!d.enterpriseId });
  const machines = useQuery({ queryKey: sk('machines', d.enterpriseId), queryFn: () => setup.machines(d.enterpriseId), enabled: !!d.enterpriseId });
  const list = (lines.data ?? []).filter((l) => l.status === 'ACTIVE' && !(d.lineCreated && l.id === d.lineId));
  const locked = !!d.machineId;
  // value радио: id существующей линии, 'new' или 'none'
  const value = d.lineMode === 'existing' ? d.lineId : d.lineMode;
  const choose = (v: string) => (v === 'new' || v === 'none' ? patch({ lineMode: v }) : patch({ lineMode: 'existing', lineId: v, lineCreated: false }));
  const count = (id: string) => (machines.data ?? []).filter((m) => m.lineId === id).length;

  register(async () => {
    if (locked) return [];
    if (d.lineMode === 'existing' && !list.some((l) => l.id === d.lineId)) return ['Выберите линию, создайте новую или отметьте «Без линии».'];
    if (d.lineMode === 'new' && !d.lineName.trim()) return ['Введите название линии.'];
    try {
      patch(await saveLine(d));
      await qc.invalidateQueries({ queryKey: ['setup'] });
      return [];
    } catch (e) {
      return [explain(e)];
    }
  });

  return (
    <Stack gap="sm" maw={640}>
      {locked && <Alert color="gray" p="xs">Машина уже создана. Перенести её на другую линию можно в разделе «Линии и машины».</Alert>}
      <Radio.Group value={value} onChange={choose}>
        <Stack gap="xs">
          {list.map((l) => (
            <Card key={l.id} withBorder padding="xs">
              <Radio value={l.id} disabled={locked} label={<Group gap={6}><Text size="sm" fw={500}>{l.name}</Text><Text size="xs" c="dimmed">машин: {count(l.id)}</Text></Group>} />
            </Card>
          ))}
          <Card withBorder padding="xs">
            <Radio value="new" disabled={locked} label={d.lineCreated ? 'Линия, созданная в мастере' : 'Новая линия'} />
            {d.lineMode === 'new' && (
              <TextInput mt="xs" ml={28} label="Название линии" placeholder="Линия экструзии 1" required data-autofocus disabled={locked} value={d.lineName} onChange={(e) => patch({ lineName: e.currentTarget.value })} />
            )}
          </Card>
          <Card withBorder padding="xs">
            <Radio value="none" disabled={locked} label="Без линии" description="Машина не попадёт в группировку по линиям; назначить можно позже" />
          </Card>
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
