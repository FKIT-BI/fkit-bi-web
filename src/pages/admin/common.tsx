import { Alert, Badge, Button, Group, Modal, Stack, Text, Tooltip, ActionIcon } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPower } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError, formatApiError, qk, type ConfigStatus } from '@/shared/api';
import { CONFIG_STATUS, fieldLabel, MACHINE_STATUS } from '@/shared/i18n';
export const errorMessage = (error: unknown) => formatApiError(error);

export const setupKey = (...parts: string[]) => ['setup', ...parts] as const;

export function useRefreshConfig() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['setup'] }), qc.invalidateQueries({ queryKey: qk.config })]);
}

export const StatusBadge = ({ status, machine }: { status: ConfigStatus; machine?: boolean }) => {
  const term = (machine ? MACHINE_STATUS : CONFIG_STATUS)[status];
  return (
    <Tooltip label={term.hint} multiline w={260} disabled={!term.hint}>
      <Badge variant="light" color={status === 'ACTIVE' ? 'green' : 'gray'}>
        {term.label}
      </Badge>
    </Tooltip>
  );
};

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
  // Поля, которые форма показывает у своих контролов; остальные ошибки выводятся списком с русскими подписями.
  const shown = new Set<string>();
  const fe = (path: string) => {
    shown.add(path);
    return fieldErrors.find((f) => f.path === path)?.message;
  };
  const body = children(fe);
  const isShown = (path: string) => [...shown].some((p) => path === p || path.startsWith(`${p}[`) || path.startsWith(`${p}.`));
  const rest = fieldErrors.filter((f) => !f.path || !isShown(f.path));
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
          {body}
          {error != null && (
            <Alert color="red" p="xs">
              <Text size="sm">{errorMessage(error)}</Text>
              {rest.map((f, i) => <Text key={i} size="xs">{f.path ? `${fieldLabel(f.path)}: ` : ''}{f.message}</Text>)}
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
