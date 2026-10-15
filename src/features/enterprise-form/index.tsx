import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, formatApiError, qk, setup, type Enterprise } from '@/shared/api';
import { enumOptions, HINT, TIMEZONE } from '@/shared/i18n';
import { CodeField, EnumSelect, useAutoCode } from '@/shared/ui';

export const TIMEZONES = Object.keys(TIMEZONE);

/** Часовой пояс браузера, если он есть в списке, иначе Москва. */
function defaultTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONES.includes(tz) ? tz : 'Europe/Moscow';
  } catch {
    return 'Europe/Moscow';
  }
}

/** Создание (item = null) или правка предприятия. Монтируйте только пока форма открыта. */
export function EnterpriseForm({ item, onClose, onSaved }: { item: Enterprise | null; onClose: () => void; onSaved?: (e: Enterprise) => void }) {
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');
  const [name, setName] = useState(item?.name ?? '');
  const [tz, setTz] = useState(item?.timezone ?? defaultTimezone);
  const all = useQuery({ queryKey: ['setup', 'enterprises-all'], queryFn: setup.allEnterprises, enabled: !item });
  const code = useAutoCode(name, 'ENT', (all.data ?? []).map((e) => e.code), item?.code);
  const tzOptions = enumOptions(TIMEZONE, TIMEZONES.includes(tz) ? TIMEZONES : [...TIMEZONES, tz]);
  const valid = !!name.trim() && !!tz && code.valid;

  const save = useMutation({
    mutationFn: () => (item ? setup.updateEnterprise(item.id, { name: name.trim(), timezone: tz }) : setup.createEnterprise({ code: code.value, name: name.trim(), timezone: tz })),
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
          <TextInput label="Название" description="Завод или площадка" placeholder="Завод упаковки" required data-autofocus value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <CodeField code={code} locked={!!item} error={fe('code')} />
          <EnumSelect label="Часовой пояс" hint={HINT.timezone} description="По нему считаются смены и сутки" required options={tzOptions} value={tz} error={fe('timezone')} onChange={(v) => v && setTz(v)} />
          {!item && <Text size="xs" c="dimmed">Дальше добавьте линии, машины, смены и причины потерь в разделе «Администрирование».</Text>}
          {save.isError && <Alert color="red" p="xs"><Text size="sm">{formatApiError(save.error)}</Text></Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>{item ? 'Сохранить' : 'Создать'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
