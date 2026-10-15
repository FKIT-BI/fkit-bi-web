import { Alert, Card, Group, Radio, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setup } from '@/shared/api';
import { enumLabel, enumOptions, HINT, TIMEZONE } from '@/shared/i18n';
import { makeCode } from '@/shared/lib';
import { useEnterpriseChoice } from '@/shared/model';
import { Code } from '@mantine/core';
import { EnumSelect } from '@/shared/ui';
import { explain, saveEnterprise } from '../actions';
import { emptyDraft } from '../draft';
import { sk, type StepProps } from './types';

const ZONES = Object.keys(TIMEZONE);

function browserZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ZONES.includes(tz) ? tz : 'Europe/Moscow';
  } catch {
    return 'Europe/Moscow';
  }
}

export function EnterpriseStep({ draft: d, patch, register }: StepProps) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: sk('enterprises-all'), queryFn: setup.allEnterprises });
  const list = (q.data ?? []).filter((e) => e.status === 'ACTIVE' || e.id === d.enterpriseId);
  const mode = list.length ? d.enterpriseMode : 'new';
  const timezone = d.timezone || browserZone();
  const taken = (q.data ?? []).map((e) => e.code);

  register(async () => {
    if (mode === 'existing' && !d.enterpriseId) return ['Выберите предприятие или создайте новое.'];
    if (mode === 'new' && !d.enterpriseName.trim()) return ['Введите название предприятия.'];
    const before = d.enterpriseId;
    try {
      const p = await saveEnterprise({ ...d, enterpriseMode: mode, timezone });
      const id = p.enterpriseId ?? d.enterpriseId;
      // Другое предприятие — линия и машина из прошлого выбора к нему не относятся.
      const reset = before && id !== before && d.machineId ? { ...emptyDraft(), step: d.step } : {};
      patch({ ...reset, ...p, enterpriseMode: mode, timezone, enterpriseId: id, enterpriseName: d.enterpriseName });
      useEnterpriseChoice.getState().choose(id);
      await qc.invalidateQueries({ queryKey: ['setup'] });
      return [];
    } catch (e) {
      return [explain(e)];
    }
  });

  return (
    <Stack gap="md">
      {list.length > 0 && (
        <SegmentedControl
          value={mode}
          onChange={(v) => patch({ enterpriseMode: v as 'existing' | 'new' })}
          data={[
            { value: 'existing', label: 'Выбрать существующее' },
            { value: 'new', label: d.enterpriseCreated ? 'Созданное в мастере' : 'Новое предприятие' },
          ]}
          w="fit-content"
        />
      )}
      {mode === 'existing' && (
        <Radio.Group value={d.enterpriseId} onChange={(v) => patch({ enterpriseId: v, enterpriseCreated: false })}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {list.map((e) => (
              <Card key={e.id} withBorder padding="sm" style={{ cursor: 'pointer', borderColor: d.enterpriseId === e.id ? 'var(--mantine-color-blue-6)' : undefined }} onClick={() => patch({ enterpriseId: e.id, enterpriseCreated: false })}>
                <Group wrap="nowrap" align="flex-start">
                  <Radio value={e.id} aria-label={e.name} />
                  <div>
                    <Text fw={600}>{e.name}</Text>
                    <Text size="xs" c="dimmed">{enumLabel(TIMEZONE, e.timezone)}</Text>
                  </div>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </Radio.Group>
      )}
      {mode === 'new' && (
        <Stack gap="sm" maw={520}>
          {!list.length && !q.isLoading && <Alert color="blue" p="xs">Предприятий пока нет — начнём с него.</Alert>}
          <TextInput label="Название" description="Завод или площадка" placeholder="Завод упаковки" required data-autofocus value={d.enterpriseName} onChange={(e) => patch({ enterpriseName: e.currentTarget.value })} />
          <EnumSelect label="Часовой пояс" hint={HINT.timezone} description="По нему считаются смены и сутки" options={enumOptions(TIMEZONE, ZONES)} value={timezone} onChange={(v) => patch({ timezone: v })} />
          {!d.enterpriseCreated && d.enterpriseName.trim() && (
            <Text size="xs" c="dimmed">
              Код создастся автоматически: <Code>{makeCode(d.enterpriseName, 'ENT', taken)}</Code>
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
