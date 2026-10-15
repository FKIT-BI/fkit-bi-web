import { Alert, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { setup, type MachineStateConfigurationInput, type TelemetrySignal, type ValidationIssue } from '@/shared/api';
import { initialConfig, localIssues, StateRulesEditor } from '@/features/state-rules';
import { explain, mapRules } from '../actions';
import { sk, type StepProps } from './types';

export function RulesStep(props: StepProps) {
  const { draft: d } = props;
  const signals = useQuery({ queryKey: sk('signals-all', d.machineId), queryFn: () => setup.allSignals(d.machineId), enabled: !!d.machineId });
  const saved = useQuery({ queryKey: sk('state-config', d.machineId), queryFn: () => setup.stateConfig(d.machineId), enabled: !!d.machineId });
  const source = useQuery({ queryKey: sk('state-config', d.copyFromMachineId), queryFn: () => setup.stateConfig(d.copyFromMachineId), enabled: !!d.copyFromMachineId && !d.rules });
  if (signals.isLoading || saved.isLoading || source.isLoading) {
    props.register(async () => ['Подождите, данные ещё загружаются.']);
    return <Text c="dimmed">Загрузка…</Text>;
  }
  if (signals.isError || saved.isError) {
    props.register(async () => [explain(signals.error ?? saved.error)]);
    return <Alert color="red" p="xs">{explain(signals.error ?? saved.error)}</Alert>;
  }
  const list = signals.data ?? [];
  return <RulesForm key={d.machineId} {...props} signals={list} initial={startConfig(d.rules, saved.data ?? null, source.data ?? null, d.signals, list)} />;
}

/** Черновик → сохранённые правила → правила образца на новых сигналах → предложение по сигналам. */
function startConfig(
  draft: MachineStateConfigurationInput | null,
  saved: MachineStateConfigurationInput | null,
  source: MachineStateConfigurationInput | null,
  drafts: Array<{ id?: string | null; sourceSignalId?: string | null }>,
  signals: TelemetrySignal[],
): MachineStateConfigurationInput {
  if (draft) return draft;
  if (saved) return { defaultState: saved.defaultState, offlineAfterMs: saved.offlineAfterMs, rules: saved.rules };
  if (source) {
    const mapping = new Map(drafts.filter((s) => s.id && s.sourceSignalId).map((s) => [s.sourceSignalId as string, s.id as string]));
    const mapped = mapRules(source, mapping);
    if (mapped.rules.length) return mapped;
  }
  return initialConfig(signals);
}

function RulesForm({ draft: d, patch, register, signals, initial }: StepProps & { signals: TelemetrySignal[]; initial: MachineStateConfigurationInput }) {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState(initial);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const change = (next: MachineStateConfigurationInput) => {
    setCfg(next);
    setIssues([]);
    patch({ rules: next });
  };

  register(async () => {
    const local = localIssues(cfg, signals.filter((s) => s.status === 'ACTIVE'));
    if (local.size) return [...local.values()].flat();
    try {
      const checked = await setup.validateState(d.machineId, cfg);
      setIssues([...checked.errors, ...checked.warnings]);
      if (!checked.valid) return ['Исправьте ошибки в правилах — они отмечены у правил.'];
      await setup.saveState(d.machineId, cfg);
      patch({ rules: cfg });
      await qc.invalidateQueries({ queryKey: ['setup'] });
      return [];
    } catch (e) {
      return [explain(e)];
    }
  });

  return (
    <>
      {d.copyFromMachineId && !d.rules && initial.rules.length > 0 && <Alert color="blue" p="xs" mb="sm">Правила перенесены с машины-образца. Проверьте пороги.</Alert>}
      <StateRulesEditor signals={signals} value={cfg} onChange={change} issues={issues} />
    </>
  );
}
