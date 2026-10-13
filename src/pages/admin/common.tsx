import { Alert, Badge, Button, Group, Modal, Stack, Text, Tooltip, ActionIcon } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPower } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError, qk, type ConfigStatus } from '@/shared/api';
import { errorMessage } from './EquipmentSetup';

export { errorMessage };

export const setupKey = (...parts: string[]) => ['setup', ...parts] as const;

export function useRefreshConfig() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['setup'] }), qc.invalidateQueries({ queryKey: qk.config })]);
}

export const StatusBadge = ({ status }: { status: ConfigStatus }) => (
  <Badge variant="light" color={status === 'ACTIVE' ? 'green' : 'gray'}>
    {status === 'ACTIVE' ? 'Активно' : 'Отключено'}
  </Badge>
);

export function StatusToggle({ status, onToggle, disabled, loading }: { status: ConfigStatus; onToggle: (next: ConfigStatus) => void; disabled?: boolean; loading?: boolean }) {
  const next: ConfigStatus = status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  return (
    <Tooltip label={status === 'ACTIVE' ? 'Отключить' : 'Включить'}>
      <ActionIcon variant="subtle" color={status === 'ACTIVE' ? 'gray' : 'blue'} disabled={disabled} loading={loading} aria-label="Сменить статус" onClick={() => onToggle(next)}>
        <IconPower size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** Мутация смены статуса: ошибка домена (409/422) показывается уведомлением. */
export function useStatusMutation<T extends { id: string }>(fn: (id: string, status: ConfigStatus) => Promise<unknown>, label: string) {
  const refresh = useRefreshConfig();
  return useMutation({
    mutationFn: ({ item, status }: { item: T; status: ConfigStatus }) => fn(item.id, status),
    onSuccess: async (_r, v) => {
      await refresh();
      notifications.show({ color: 'green', message: `${label}: ${v.status === 'ACTIVE' ? 'включено' : 'отключено'}` });
    },
    onError: (e) => notifications.show({ color: 'red', title: 'Не удалось сменить статус', message: errorMessage(e) }),
  });
}

export const confirmDisable = (what: string, next: ConfigStatus) => next === 'ACTIVE' || window.confirm(`Отключить «${what}»? Данные сохранятся, но объект пропадёт из рабочих списков.`);

export function FormModal({
  opened,
  onClose,
  title,
  size = 'md',
  submit,
  canSubmit = true,
  submitLabel = 'Сохранить',
  success,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  size?: string;
  submit: () => Promise<unknown>;
  canSubmit?: boolean;
  submitLabel?: string;
  success: string;
  children: (fe: (path: string) => string | undefined) => ReactNode;
}) {
  const isMobile = useMediaQuery('(max-width: 36em)');
  const refresh = useRefreshConfig();
  const [error, setError] = useState<unknown>(null);
  const run = useMutation({
    mutationFn: submit,
    onMutate: () => setError(null),
    onSuccess: async () => {
      await refresh();
      notifications.show({ color: 'green', message: success });
      onClose();
    },
    onError: setError,
  });
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : [];
  const fe = (path: string) => fieldErrors.find((f) => f.path === path)?.message;
  return (
    <Modal opened={opened} onClose={onClose} title={title} size={size} fullScreen={isMobile} closeOnClickOutside={false} onExitTransitionEnd={() => setError(null)}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) run.mutate();
        }}
      >
        <Stack gap="sm">
          {children(fe)}
          {error != null && (
            <Alert color="red" p="xs">
              <Text size="sm">{errorMessage(error)}</Text>
              {fieldErrors.filter((f) => !f.path).map((f, i) => <Text key={i} size="xs">{f.message}</Text>)}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={run.isPending} disabled={!canSubmit}>{submitLabel}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
