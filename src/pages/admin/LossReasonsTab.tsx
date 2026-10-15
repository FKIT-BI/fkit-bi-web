import { ActionIcon, Badge, Button, ColorInput, ColorSwatch, Group, NativeSelect, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { setup, type LossCategory, type LossReason } from '@/shared/api';
import { useTranslation } from '@/shared/i18n';
import { CodeField, Panel, useAutoCode } from '@/shared/ui';
import { confirmDisable, FormModal, setupKey, StatusBadge, StatusToggle, useStatusMutation } from './common';

const CATEGORIES: LossCategory[] = ['EQUIPMENT', 'MATERIAL', 'PERSONNEL', 'PROCESS', 'QUALITY', 'CHANGEOVER', 'EXTERNAL', 'OTHER'];

export function LossReasonsTab({ enterpriseId, readOnly }: { enterpriseId: string; readOnly: boolean }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: setupKey('loss-reasons', enterpriseId), queryFn: () => setup.lossReasons(enterpriseId), enabled: !!enterpriseId });
  const [edit, setEdit] = useState<LossReason | 'new' | null>(null);
  const status = useStatusMutation<LossReason>(setup.setLossReasonStatus, 'Причина');
  const items = q.data ?? [];
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Справочник причин, которые оператор выбирает при регистрации инцидента.</Text>
        {!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новая причина</Button>}
      </Group>
      <Panel title={<>Причины потерь <Badge variant="light" ml={6}>{items.length}</Badge></>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !items.length, refetch: () => void q.refetch() }}>
        <Table.ScrollContainer minWidth={620}>
          <Table highlightOnHover verticalSpacing={6}>
            <Table.Thead><Table.Tr><Table.Th /><Table.Th>Код</Table.Th><Table.Th>Название</Table.Th><Table.Th>Категория</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {items.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td w={30}>{r.color && <ColorSwatch color={r.color} size={14} />}</Table.Td>
                  <Table.Td ff="monospace">{r.code}</Table.Td>
                  <Table.Td>{r.name}{r.description && <Text size="xs" c="dimmed">{r.description}</Text>}</Table.Td>
                  <Table.Td>{t(`category.${r.category}`)}</Table.Td>
                  <Table.Td><StatusBadge status={r.status} /></Table.Td>
                  <Table.Td>
                    {!readOnly && (
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <ActionIcon variant="subtle" aria-label="Редактировать" onClick={() => setEdit(r)}><IconPencil size={16} /></ActionIcon>
                        <StatusToggle status={r.status} loading={status.isPending && status.variables?.item.id === r.id} onToggle={(next) => confirmDisable(r.name, next) && status.mutate({ item: r, status: next })} />
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
      {edit && <ReasonForm key={edit === 'new' ? 'new' : edit.id} enterpriseId={enterpriseId} item={edit === 'new' ? null : edit} taken={items.map((r) => r.code)} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

function ReasonForm({ enterpriseId, item, taken, onClose }: { enterpriseId: string; item: LossReason | null; taken: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const code = useAutoCode(name, 'REASON', taken, item?.code);
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState<LossCategory>(item?.category ?? 'EQUIPMENT');
  const [color, setColor] = useState(item?.color ?? '');
  return (
    <FormModal
      opened
      onClose={onClose}
      title={item ? 'Причина потерь' : 'Новая причина потерь'}
      success={item ? 'Причина сохранена' : 'Причина создана'}
      canSubmit={!!name.trim() && code.valid && (!color || /^#[0-9a-fA-F]{6}$/.test(color))}
      submit={() => {
        const common = { name: name.trim(), description: description.trim() || null, category, color: color || null };
        return item ? setup.updateLossReason(item.id, common) : setup.createLossReason(enterpriseId, { code: code.value, ...common });
      }}
    >
      {(fe) => (
        <>
          <TextInput label="Название" description="Почему машина стояла — оператор выбирает причину при разборе простоя" placeholder="Нет сырья" required data-autofocus value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <CodeField code={code} locked={!!item} error={fe('code')} />
          <Textarea label="Описание" autosize minRows={2} maxLength={500} value={description} error={fe('description')} onChange={(e) => setDescription(e.currentTarget.value)} />
          <NativeSelect label="Категория" value={category} data={CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))} error={fe('category')} onChange={(e) => setCategory(e.currentTarget.value as LossCategory)} />
          <ColorInput label="Цвет" format="hex" placeholder="#RRGGBB" value={color} error={fe('color')} onChange={setColor} />
        </>
      )}
    </FormModal>
  );
}

