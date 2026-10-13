import { Alert, Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, gen, gk, type ScenarioDetail, type ScenarioSummary } from '@/shared/api';

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

/** Suggests a free-looking code: CODE_COPY, CODE_COPY_2, ... within the 64-character limit. */
export const copyCode = (code: string, attempt = 1) => {
  const suffix = attempt === 1 ? '_COPY' : `_COPY_${attempt}`;
  return code.slice(0, 64 - suffix.length) + suffix;
};

/** Creates a DISABLED copy of a scenario with the same machines, behaviors, phases and cycle mode. */
export function CopyScenarioModal({ source, onClose, onCopied }: {
  source: ScenarioSummary | null;
  onClose: () => void;
  onCopied: (copy: ScenarioDetail) => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    setCode(copyCode(source.code));
    setName(`${source.name} (копия)`.slice(0, 200));
    setDescription('');
    setFieldErrors({});
    setServerError(null);
  }, [source]);

  const copy = useMutation({
    mutationFn: () => gen.copyScenario(source!.id, { code, name: name.trim(), description: description.trim() || null }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: gk.scenarios });
      notifications.show({ color: 'green', title: 'Копия создана', message: `${created.code} сохранён отключённым — проверьте и активируйте` });
      onCopied(created);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors.length) {
        setFieldErrors(Object.fromEntries(e.fieldErrors.map((f) => [f.path, f.message])));
        setServerError(null);
      } else if (e instanceof ApiError && e.status === 409) {
        setFieldErrors({ code: 'Сценарий с таким кодом уже есть' });
        setServerError(null);
      } else {
        setServerError(e instanceof Error ? e.message : String(e));
      }
    },
  });

  const codeError = code && !CODE.test(code) ? 'Код: A–Z, цифры и _, от 2 символов, с буквы' : fieldErrors.code;
  const nameError = !name.trim() ? 'Название обязательно' : fieldErrors.name;

  return (
    <Modal opened={!!source} onClose={onClose} title="Копирование сценария" size="md">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Копия получит те же машины, поведения сигналов, фазы и режим повтора, что и «{source?.name}». Она создаётся
          отключённой: её можно отредактировать и запускать отдельно от исходного сценария.
        </Text>
        <TextInput
          label="Код"
          required
          value={code}
          onChange={(e) => { setCode(e.currentTarget.value.toUpperCase()); setFieldErrors(({ code: _, ...rest }) => rest); }}
          error={codeError}
          ff="monospace"
          maxLength={64}
        />
        <TextInput
          label="Название"
          required
          value={name}
          onChange={(e) => { setName(e.currentTarget.value); setFieldErrors(({ name: _, ...rest }) => rest); }}
          error={nameError}
          maxLength={200}
        />
        <Textarea
          label="Описание"
          description="Если оставить пустым, описание возьмётся из исходного сценария"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          error={fieldErrors.description}
          autosize
          minRows={2}
          maxLength={2000}
        />
        {serverError && <Alert color="red" style={{ whiteSpace: 'pre-line' }}>{serverError}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Отмена</Button>
          <Button onClick={() => copy.mutate()} loading={copy.isPending} disabled={!!codeError || !code || !!nameError}>
            Создать копию
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
