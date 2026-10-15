import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Group, List, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setup } from '@/shared/api';
import { useTranslation } from '@/shared/i18n';
import { useAdminNav } from '@/shared/model';
import { saveShiftsAndReasons } from '../actions';
import { SHIFT_TEMPLATES, TYPICAL_REASONS } from '../presets';
import { sk, type StepProps } from './types';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function ShiftsStep({ draft: d, patch, register }: StepProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useAdminNav();
  const shifts = useQuery({ queryKey: sk('shifts', d.enterpriseId), queryFn: () => setup.shifts(d.enterpriseId), enabled: !!d.enterpriseId });
  const reasons = useQuery({ queryKey: sk('loss-reasons', d.enterpriseId), queryFn: () => setup.lossReasons(d.enterpriseId), enabled: !!d.enterpriseId });
  const activeShifts = (shifts.data ?? []).filter((s) => s.status === 'ACTIVE');
  const activeReasons = (reasons.data ?? []).filter((r) => r.status === 'ACTIVE');
  const custom = d.customShifts.length ? d.customShifts : [{ name: 'Смена 1', start: '08:00', end: '20:00' }];

  register(async () => {
    if (shifts.isLoading || reasons.isLoading) return ['Подождите, данные ещё загружаются.'];
    if (!activeShifts.length && d.shiftTemplate === 'custom') {
      const bad = custom.find((s) => !s.name.trim() || !TIME.test(s.start) || !TIME.test(s.end) || s.start === s.end);
      if (bad) return [`Проверьте смену «${bad.name || 'без названия'}»: нужны название, начало и конец (ЧЧ:ММ), они не должны совпадать.`];
    }
    const { errors } = await saveShiftsAndReasons({ ...d, customShifts: custom });
    await qc.invalidateQueries({ queryKey: ['setup'] });
    return errors.map((e) => e.message);
  });

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={4} fz="md">Смены</Title>
        {activeShifts.length > 0 ? (
          <Alert color="green" p="xs" icon={<IconCheck size={16} />}>
            <Text size="sm">
              Смены уже настроены: {activeShifts.map((s) => `${s.name} ${s.startLocalTime}–${s.endLocalTime}`).join(', ')}.{' '}
              <Anchor component="button" type="button" size="sm" onClick={() => nav.setTab('shifts')}>Изменить в разделе «Смены»</Anchor>
            </Text>
          </Alert>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
              {SHIFT_TEMPLATES.map((tpl) => (
                <Card
                  key={tpl.id}
                  withBorder
                  padding="sm"
                  role="radio"
                  aria-checked={d.shiftTemplate === tpl.id}
                  tabIndex={0}
                  style={{ cursor: 'pointer', borderColor: d.shiftTemplate === tpl.id ? 'var(--mantine-color-blue-6)' : undefined }}
                  onClick={() => patch({ shiftTemplate: tpl.id })}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && patch({ shiftTemplate: tpl.id })}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600} size="sm">{tpl.title}</Text>
                    {d.shiftTemplate === tpl.id && <IconCheck size={16} color="var(--mantine-color-blue-6)" />}
                  </Group>
                  <Text size="xs" c="dimmed">{tpl.hint}</Text>
                </Card>
              ))}
            </SimpleGrid>
            {d.shiftTemplate === 'custom' && (
              <Stack gap={6}>
                {custom.map((s, i) => (
                  <Group key={i} gap={6} align="flex-end" wrap="wrap">
                    <TextInput label={i === 0 ? 'Название' : undefined} aria-label="Название смены" w={200} value={s.name} onChange={(e) => patch({ customShifts: custom.map((x, n) => (n === i ? { ...x, name: e.currentTarget.value } : x)) })} />
                    <TextInput type="time" label={i === 0 ? 'Начало' : undefined} aria-label="Начало смены" w={120} value={s.start} onChange={(e) => patch({ customShifts: custom.map((x, n) => (n === i ? { ...x, start: e.currentTarget.value } : x)) })} />
                    <TextInput type="time" label={i === 0 ? 'Конец' : undefined} aria-label="Конец смены" w={120} value={s.end} onChange={(e) => patch({ customShifts: custom.map((x, n) => (n === i ? { ...x, end: e.currentTarget.value } : x)) })} />
                    {custom.length > 1 && <ActionIcon variant="subtle" color="red" mb={4} aria-label="Удалить смену" onClick={() => patch({ customShifts: custom.filter((_, n) => n !== i) })}><IconTrash size={14} /></ActionIcon>}
                  </Group>
                ))}
                <Group>
                  <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => patch({ customShifts: [...custom, { name: `Смена ${custom.length + 1}`, start: '20:00', end: '08:00' }] })}>
                    Ещё смена
                  </Button>
                </Group>
              </Stack>
            )}
            <Text size="xs" c="dimmed">Смена может переходить через полночь: например, 20:00 → 08:00. Действует с сегодняшнего дня.</Text>
          </>
        )}
      </Stack>

      <Stack gap="xs">
        <Title order={4} fz="md">Причины потерь</Title>
        {activeReasons.length > 0 ? (
          <Alert color="green" p="xs" icon={<IconCheck size={16} />}>
            <Text size="sm">
              Справочник причин уже заполнен ({activeReasons.length}).{' '}
              <Anchor component="button" type="button" size="sm" onClick={() => nav.setTab('reasons')}>Открыть справочник</Anchor>
            </Text>
          </Alert>
        ) : (
          <>
            <Checkbox checked={d.addReasons} onChange={(e) => patch({ addReasons: e.currentTarget.checked })} label="Добавить типовой справочник причин" description="Из этого списка оператор выбирает, почему машина стояла. Дополнить можно позже." />
            {d.addReasons && (
              <List size="sm" spacing={2} pl="xl">
                {TYPICAL_REASONS.map((r) => (
                  <List.Item key={r.code}>
                    {r.name} <Badge size="xs" variant="light" color="gray">{t(`category.${r.category}`)}</Badge>
                  </List.Item>
                ))}
              </List>
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
}
