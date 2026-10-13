import { Alert, Badge, Button, Group, Modal, MultiSelect, NativeSelect, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { ApiError, gen, gk, setup, type GenValidationIssue, type RunCreate, type ScenarioCreate } from '@/shared/api';
import { formatDuration, HOUR, DAY, toIso } from '@/shared/lib';
import { buildScenario, estimateMeasurements, PROFILES, type Built, type MachineInput, type Profile } from './build';

export { PROFILES };

type Mode = 'HISTORICAL' | 'REALTIME';
const HISTORY: Array<{ value: string; label: string; ms: number }> = [
  { value: '1', label: 'Последние сутки', ms: DAY },
  { value: '3', label: 'Последние 3 дня', ms: 3 * DAY },
  { value: '7', label: 'Последние 7 дней', ms: 7 * DAY },
  { value: '14', label: 'Последние 14 дней', ms: 14 * DAY },
  { value: '30', label: 'Последние 30 дней', ms: 30 * DAY },
];
const REALTIME: Array<{ value: string; label: string; ms: number | null }> = [
  { value: '1', label: '1 час', ms: HOUR },
  { value: '4', label: '4 часа', ms: 4 * HOUR },
  { value: '8', label: '8 часов', ms: 8 * HOUR },
  { value: '24', label: '24 часа', ms: 24 * HOUR },
  { value: '0', label: 'Пока не остановлю', ms: null },
];

const intervalFor = (mode: Mode, spanMs: number) => (mode === 'REALTIME' ? 5000 : spanMs <= 2 * DAY ? 10_000 : spanMs <= 8 * DAY ? 30_000 : 60_000);
const pad = (n: number) => String(n).padStart(2, '0');
const errText = (e: unknown) => (e instanceof ApiError ? `${e.message}${e.fieldErrors.map((f) => `\n${f.path}: ${f.message}`).join('')}` : e instanceof Error ? e.message : String(e));
const nf = new Intl.NumberFormat('ru-RU');

interface Prepared {
  built: Built;
  body: ScenarioCreate;
  issues: GenValidationIssue[];
  valid: boolean;
  spanMs: number | null;
  intervalMs: number;
}

/** Сценарий и запуск «в два клика»: поведение сигналов подбирается по правилам состояний машин. */
export function QuickGenerateModal({ opened, onClose, onStarted, machineIds }: { opened: boolean; onClose: () => void; onStarted?: (runId: string) => void; machineIds?: string[] }) {
  const tree = useEnterpriseTree();
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');
  const enterpriseId = tree.enterprise?.id ?? '';
  const active = tree.machines.filter((m) => m.status === 'ACTIVE');
  const [selected, setSelected] = useState<string[] | null>(machineIds ?? null);
  const [mode, setMode] = useState<Mode>('HISTORICAL');
  const [history, setHistory] = useState('7');
  const [realtime, setRealtime] = useState('4');
  const [profile, setProfile] = useState<Profile>('typical');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useMemo(() => (opened ? crypto.randomUUID() : ''), [opened]);

  const ids = selected ?? active.map((m) => m.id);
  const options = tree.lines.map((l) => ({ group: l.name, items: l.machines.filter((m) => m.status === 'ACTIVE').map((m) => ({ value: m.id, label: m.name })) })).filter((g) => g.items.length);
  const unassigned = active.filter((m) => !m.lineId);
  if (unassigned.length) options.push({ group: 'Без линии', items: unassigned.map((m) => ({ value: m.id, label: m.name })) });
  const reset = () => { setPrepared(null); setError(null); };

  const spanFor = () => (mode === 'HISTORICAL' ? HISTORY.find((h) => h.value === history)!.ms : REALTIME.find((r) => r.value === realtime)!.ms);

  const prepare = useMutation({
    mutationFn: async (): Promise<Prepared> => {
      const inputs: MachineInput[] = await Promise.all(
        ids.map(async (id) => {
          const m = tree.machines.find((x) => x.id === id)!;
          const [signals, config, full] = await Promise.all([setup.allSignals(id), setup.stateConfig(id), setup.machine(id)]);
          return { machine: { id, name: m.name, nominalRate: full.nominalRate }, signals: signals.filter((s) => s.status === 'ACTIVE'), config };
        }),
      );
      const span = spanFor();
      const intervalMs = intervalFor(mode, span ?? DAY);
      const built = buildScenario(inputs, { profile, intervalMs });
      const d = new Date();
      const body: ScenarioCreate = {
        enterpriseId,
        code: `QUICK_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
        name: `Быстрая генерация ${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
        description: `Профиль «${PROFILES[profile].label}»: ${PROFILES[profile].hint}. Собран автоматически из правил состояний.`,
        cycleMode: 'LOOP',
        machineTargets: built.machineTargets,
        phases: built.phases,
      };
      const v = await gen.validateScenario(body);
      return { built, body, issues: v.issues, valid: v.valid, spanMs: span, intervalMs };
    },
    onSuccess: setPrepared,
    onError: (e) => setError(errText(e)),
  });

  const start = useMutation({
    mutationFn: async () => {
      const p = prepared!;
      const scenario = await gen.createScenario(p.body);
      await gen.setScenarioStatus(scenario.id, 'ACTIVE');
      const now = Date.now();
      const run: RunCreate =
        mode === 'HISTORICAL'
          ? { mode: 'HISTORICAL', scenarioId: scenario.id, from: toIso(now - p.spanMs! - 60_000), to: toIso(now - 60_000) }
          : { mode: 'REALTIME', scenarioId: scenario.id, ...(p.spanMs ? { durationMs: p.spanMs } : {}) };
      return gen.createRun(run, key);
    },
    onSuccess: async (run) => {
      await qc.invalidateQueries({ queryKey: gk.scenarios });
      await qc.invalidateQueries({ queryKey: gk.runs });
      notifications.show({ color: 'green', message: 'Генерация запущена' });
      onStarted?.(run.id);
      onClose();
    },
    onError: (e) => setError(errText(e)),
  });

  const errors = prepared?.issues.filter((i) => i.severity === 'ERROR') ?? [];
  const warnings = prepared?.issues.filter((i) => i.severity === 'WARNING') ?? [];
  const estimate = prepared ? estimateMeasurements(prepared.built, prepared.spanMs ?? DAY, prepared.intervalMs) : 0;

  return (
    <Modal opened={opened} onClose={onClose} title="Быстрая генерация данных" size="lg" fullScreen={isMobile} closeOnClickOutside={false}>
      <Stack gap="sm">
        {!prepared ? (
          <>
            <Text size="sm" c="dimmed">Сценарий соберётся автоматически: значения сигналов подбираются под правила состояний каждой машины, чтобы в отчётах появились работа, простои и аварии.</Text>
            <MultiSelect label="Машины" description="Только активные машины с настроенными сигналами" searchable data={options} value={ids} onChange={(v) => { setSelected(v); reset(); }} error={ids.length === 0 ? 'Выберите хотя бы одну машину' : undefined} maxValues={20} />
            <Stack gap={4}>
              <Text size="sm" fw={500}>Что сгенерировать</Text>
              <SegmentedControl fullWidth value={mode} onChange={(v) => { setMode(v as Mode); reset(); }} data={[{ value: 'HISTORICAL', label: 'История за период' }, { value: 'REALTIME', label: 'В реальном времени' }]} />
            </Stack>
            {mode === 'HISTORICAL' ? (
              <NativeSelect label="Период" description="Данные формируются сразу, заканчиваются «сейчас»" value={history} data={HISTORY.map((h) => ({ value: h.value, label: h.label }))} onChange={(e) => { setHistory(e.currentTarget.value); reset(); }} />
            ) : (
              <NativeSelect label="Длительность" description="Данные поступают по мере хода времени" value={realtime} data={REALTIME.map((r) => ({ value: r.value, label: r.label }))} onChange={(e) => { setRealtime(e.currentTarget.value); reset(); }} />
            )}
            <Stack gap={4}>
              <Text size="sm" fw={500}>Характер работы</Text>
              <SegmentedControl fullWidth value={profile} onChange={(v) => { setProfile(v as Profile); reset(); }} data={(Object.keys(PROFILES) as Profile[]).map((p) => ({ value: p, label: PROFILES[p].label }))} />
              <Text size="xs" c="dimmed">{PROFILES[profile].hint}</Text>
            </Stack>
          </>
        ) : (
          <>
            <Group gap="xs">
              <Badge variant="light">{prepared.built.machineTargets.length} машин</Badge>
              <Badge variant="light">{prepared.built.signalCount} сигналов</Badge>
              <Badge variant="light">≈ {nf.format(estimate)} измерений</Badge>
              <Badge variant="light" color="gray">шаг {prepared.intervalMs / 1000} с</Badge>
            </Group>
            <Table withRowBorders={false} verticalSpacing={3}>
              <Table.Tbody>
                {prepared.built.phases.map((p) => (
                  <Table.Tr key={p.code}>
                    <Table.Td w="45%">{p.name}</Table.Td>
                    <Table.Td c="dimmed">{formatDuration(p.durationMs / 1000)} · {p.behaviorOverrides.length} переопр.</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {prepared.built.notes.map((n, i) => <Alert key={i} color="yellow" p="xs">{n}</Alert>)}
            {errors.map((i, n) => <Alert key={n} color="red" p="xs"><Text size="sm">{i.message}</Text><Text size="xs" c="dimmed" ff="monospace">{i.path}</Text></Alert>)}
            {warnings.map((i, n) => <Alert key={n} color="yellow" p="xs"><Text size="sm">{i.message}</Text></Alert>)}
            <Text size="xs" c="dimmed">Сценарий сохранится как «{prepared.body.name}» — потом его можно доработать на вкладке «Сценарии».</Text>
          </>
        )}
        {error && <Alert color="red" p="xs"><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{error}</Text></Alert>}
        <Group justify="space-between">
          {prepared ? <Button variant="subtle" onClick={reset}>Назад</Button> : <span />}
          <Group>
            <Button variant="default" onClick={onClose}>Отмена</Button>
            {!prepared ? (
              <Button loading={prepare.isPending} disabled={ids.length === 0} onClick={() => { setError(null); prepare.mutate(); }}>Далее</Button>
            ) : (
              <Button loading={start.isPending} disabled={!prepared.valid || errors.length > 0} onClick={() => { setError(null); start.mutate(); }}>Сгенерировать</Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
