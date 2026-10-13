import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, qk, setup, type Enterprise } from '@/shared/api';

export const TIMEZONES = ['Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka'];
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

const message = (e: unknown) => (e instanceof ApiError && e.body ? `${e.body.code}: ${e.body.message}` : e instanceof Error ? e.message : 'Не удалось выполнить запрос');

/** Создание (item = null) или правка предприятия. Монтируйте только пока форма открыта. */
export function EnterpriseForm({ item, onClose, onSaved }: { item: Enterprise | null; onClose: () => void; onSaved?: (e: Enterprise) => void }) {
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [tz, setTz] = useState(item?.timezone ?? 'Europe/Moscow');
  const tzData = TIMEZONES.includes(tz) ? TIMEZONES : [...TIMEZONES, tz];
  const valid = !!name.trim() && !!tz && (!!item || CODE.test(code));

  const save = useMutation({
    mutationFn: () => (item ? setup.updateEnterprise(item.id, { name: name.trim(), timezone: tz }) : setup.createEnterprise({ code, name: name.trim(), timezone: tz })),
    onSuccess: async (e) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['setup'] }), qc.invalidateQueries({ queryKey: qk.config })]);
      notifications.show({ color: 'green', message: item ? 'Предприятие сохранено' : `Предприятие «${e.name}» создано` });
      onSaved?.(e);
      onClose();
    },
  });
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : [];
  const fe = (path: string) => fieldErrors.find((f) => f.path === path)?.message;

  return (
    <Modal opened onClose={onClose} title={item ? 'Предприятие' : 'Новое предприятие'} fullScreen={isMobile} closeOnClickOutside={false}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
        <Stack gap="sm">
          <TextInput label="Название" required data-autofocus value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput label="Код" description={item ? 'После создания не меняется' : 'Латиница A–Z, цифры и _, с буквы. Например: PLANT_A'} disabled={!!item} required value={code} error={fe('code') ?? (code && !item && !CODE.test(code) ? 'Допустимы A–Z, цифры и _, начинать с буквы' : undefined)} onChange={(e) => setCode(e.currentTarget.value.toUpperCase())} />
          <Select label="Часовой пояс" description="По нему считаются смены и сутки" searchable required allowDeselect={false} data={tzData} value={tz} error={fe('timezone')} onChange={(v) => v && setTz(v)} />
          {!item && <Text size="xs" c="dimmed">Дальше добавьте линии, машины, смены и причины потерь в разделе «Администрирование».</Text>}
          {save.isError && <Alert color="red" p="xs"><Text size="sm">{message(save.error)}</Text></Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>{item ? 'Сохранить' : 'Создать'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
