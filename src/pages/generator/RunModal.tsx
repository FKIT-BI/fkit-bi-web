import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { ApiError, gen, gk, type RunCreate, type RunMode, type RunValidationResult } from '@/shared/api';
import { formatDateTime, formatDuration, HOUR, MINUTE, parseLocal, toIso, toLocalString } from '@/shared/lib';
import { RUN_MODE, RUN_MODE_HINT } from './labels';

const nf = new Intl.NumberFormat('ru-RU');

export function RunModal({ opened, scenarioId, onClose, onCreated }: { opened: boolean; scenarioId?: string; onClose: () => void; onCreated?: (runId: string) => void }) {
  const tree = useEnterpriseTree();
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');
  const enterpriseId = tree.enterprise?.id ?? '';
  const scenarios = useQuery({ ...gen.scenarios(enterpriseId, 'ACTIVE'), enabled: opened && !!enterpriseId });
  const key = useMemo(() => (opened ? crypto.randomUUID() : ''), [opened]);

  const [scenario, setScenario] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>('REALTIME');
  const [duration, setDuration] = useState<number | ''>(60);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [startAt, setStartAt] = useState('');
  const [seed, setSeed] = useState<number | ''>('');
  const [check, setCheck] = useState<RunValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    const now = Date.now();
    setScenario(scenarioId ?? null);
    setMode('REALTIME');
    setDuration(60);
    setFrom(toLocalString(now - 24 * HOUR));
    setTo(toLocalString(now - HOUR));
    setStartAt(toLocalString(now + 10 * MINUTE));
    setSeed('');
    setCheck(null);
    setError(null);
  }, [opened, scenarioId]);

  const body = (): RunCreate | null => {
    if (!scenario) return null;
    const common = { scenarioId: scenario, ...(seed === '' ? {} : { randomSeed: Number(seed) }) };
    if (mode === 'HISTORICAL') return { ...common, mode, from: toIso(parseLocal(from)), to: toIso(parseLocal(to)) };
    if (mode === 'SCHEDULED') return { ...common, mode, scheduledStartAt: toIso(parseLocal(startAt)), ...(duration === '' ? {} : { durationMs: Number(duration) * 60_000 }) };
    return { ...common, mode, ...(duration === '' ? {} : { durationMs: Number(duration) * 60_000 }) };
  };

  const stale = () => setCheck(null);
  const errText = (e: unknown) => (e instanceof ApiError ? `${e.message}${e.fieldErrors.map((f) => `\n${f.path}: ${f.message}`).join('')}` : String(e));

  const validate = useMutation({
    mutationFn: () => gen.validateRun(body()!),
    onSuccess: setCheck,
    onError: (e) => setError(errText(e)),
  });
  const create = useMutation({
    mutationFn: () => gen.createRun(body()!, key),
    onSuccess: async (run) => {
      await qc.invalidateQueries({ queryKey: gk.runs });
      notifications.show({ color: 'green', message: 'Запуск создан' });
      onCreated?.(run.id);
      onClose();
    },
    onError: (e) => setError(errText(e)),
  });

  const options = (scenarios.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));

  return (
    <Modal opened={opened} onClose={onClose} title="Новый запуск генерации" size="lg" fullScreen={isMobile}>
      <Stack gap="sm">
        <Select
          label="Сценарий"
          description="Только активные сценарии"
          searchable
          required
          data={options}
          value={scenario}
          onChange={(v) => { setScenario(v); stale(); }}
          nothingFoundMessage="Нет активных сценариев"
        />
        <Stack gap={4}>
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(v) => { setMode(v as RunMode); stale(); }}
            data={(['REALTIME', 'HISTORICAL', 'SCHEDULED'] as RunMode[]).map((m) => ({ value: m, label: RUN_MODE[m] }))}
          />
          <Text size="xs" c="dimmed">{RUN_MODE_HINT[mode]}</Text>
        </Stack>

        {mode === 'HISTORICAL' ? (
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <DateTimePicker label="С" valueFormat="DD.MM.YYYY HH:mm" required value={from || null} onChange={(v) => { setFrom(v ?? ''); stale(); }} />
            <DateTimePicker label="По" valueFormat="DD.MM.YYYY HH:mm" required value={to || null} onChange={(v) => { setTo(v ?? ''); stale(); }} />
          </SimpleGrid>
        ) : (
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            {mode === 'SCHEDULED' && <DateTimePicker label="Старт" valueFormat="DD.MM.YYYY HH:mm" required value={startAt || null} onChange={(v) => { setStartAt(v ?? ''); stale(); }} />}
            <NumberInput label="Длительность, мин" description="Пусто — без ограничения" min={1} value={duration} onChange={(v) => { setDuration(v === '' ? '' : Number(v)); stale(); }} />
          </SimpleGrid>
        )}
        <NumberInput label="Seed генератора" description="Пусто — выберет сервер; одинаковый seed даёт одинаковые данные" value={seed} onChange={(v) => { setSeed(v === '' ? '' : Number(v)); stale(); }} />

        {check && (
          <Alert color={check.valid ? 'green' : 'red'} title={check.valid ? 'Проверка пройдена' : 'Запуск невозможен'}>
            <Stack gap={4}>
              {check.normalizedFrom && (
                <Text size="sm">
                  Период: {formatDateTime(Date.parse(check.normalizedFrom))} — {check.normalizedTo ? formatDateTime(Date.parse(check.normalizedTo)) : 'без ограничения'}
                </Text>
              )}
              {check.estimatedMeasurements != null && (
                <Text size="sm">
                  Оценка: ≈ {nf.format(check.estimatedMeasurements)} измерений, ≈ {nf.format(check.estimatedBatches ?? 0)} пакетов
                  {check.estimatedWallDurationSeconds != null && <>, ≈ {formatDuration(check.estimatedWallDurationSeconds)} работы</>}
                </Text>
              )}
              {check.issues.map((i, n) => (
                <Text key={n} size="sm" c={i.severity === 'ERROR' ? 'red' : 'yellow.8'}>
                  {i.message} <Text span size="xs" c="dimmed" ff="monospace">{i.path}</Text>
                </Text>
              ))}
              {check.conflicts.map((c, n) => (
                <Text key={n} size="sm" c="red">
                  Конфликт «{c.code}»: заняты {c.machineIds.map((id) => tree.machines.find((m) => m.id === id)?.name ?? id).join(', ')}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}
        {error && <Alert color="red"><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{error}</Text></Alert>}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Отмена</Button>
          <Button variant="light" disabled={!scenario} loading={validate.isPending} onClick={() => { setError(null); validate.mutate(); }}>Проверить</Button>
          <Button disabled={!scenario || (check != null && !check.valid)} loading={create.isPending} onClick={() => { setError(null); create.mutate(); }}>Запустить</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
