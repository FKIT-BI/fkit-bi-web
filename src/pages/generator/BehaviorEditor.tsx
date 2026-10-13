import { NativeSelect, NumberInput, SimpleGrid, Stack, Switch, TextInput } from '@mantine/core';
import type { BehaviorConfiguration, BehaviorModel } from '@/shared/api';
import { MODEL_LABEL, QUALITY_LABEL } from './labels';

type Behavior = Record<string, unknown>;
interface Field {
  key: string;
  label: string;
  kind: 'number' | 'bool' | 'any' | 'list';
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

const NOISE: Field = { key: 'noiseStandardDeviation', label: 'Шум (σ)', kind: 'number', optional: true, min: 0 };

const FIELDS: Record<BehaviorModel, Field[]> = {
  CONSTANT: [{ key: 'value', label: 'Значение (число, true/false или текст)', kind: 'any' }],
  UNIFORM: [
    { key: 'min', label: 'Минимум', kind: 'number' },
    { key: 'max', label: 'Максимум', kind: 'number' },
    NOISE,
  ],
  NORMAL: [
    { key: 'mean', label: 'Среднее', kind: 'number' },
    { key: 'standardDeviation', label: 'Станд. отклонение', kind: 'number', min: 0.000001 },
    { key: 'clampMin', label: 'Нижняя граница', kind: 'number', optional: true },
    { key: 'clampMax', label: 'Верхняя граница', kind: 'number', optional: true },
    NOISE,
  ],
  RAMP: [
    { key: 'from', label: 'Начало', kind: 'number' },
    { key: 'to', label: 'Конец', kind: 'number' },
    { key: 'durationMs', label: 'Длительность, мс', kind: 'number', min: 1000 },
    { key: 'repeat', label: 'Повторять', kind: 'bool' },
    NOISE,
  ],
  SINE: [
    { key: 'center', label: 'Центр', kind: 'number' },
    { key: 'amplitude', label: 'Амплитуда', kind: 'number', min: 0 },
    { key: 'periodMs', label: 'Период, мс', kind: 'number', min: 1000 },
    { key: 'phaseRadians', label: 'Фаза, рад', kind: 'number', optional: true },
    NOISE,
  ],
  COUNTER_RATE: [
    { key: 'initialValue', label: 'Начальное значение', kind: 'number' },
    { key: 'incrementPerSecond', label: 'Прирост в секунду', kind: 'number', min: 0 },
    { key: 'resetThreshold', label: 'Порог сброса', kind: 'number', optional: true },
    { key: 'resetValue', label: 'Значение после сброса', kind: 'number', optional: true },
  ],
  PULSE: [
    { key: 'onDurationMs', label: 'Включено, мс', kind: 'number', min: 1000 },
    { key: 'offDurationMs', label: 'Выключено, мс', kind: 'number', min: 1000 },
    { key: 'initialValue', label: 'Начинать с «вкл»', kind: 'bool' },
  ],
  BERNOULLI: [{ key: 'trueProbability', label: 'Вероятность «да» (0…1)', kind: 'number', min: 0, max: 1, step: 0.05 }],
  SEQUENCE: [
    { key: 'values', label: 'Значения через запятую', kind: 'list' },
    { key: 'dwellMs', label: 'Удержание значения, мс', kind: 'number', min: 1000 },
    { key: 'repeat', label: 'Повторять', kind: 'bool' },
  ],
};

export const MODELS = Object.keys(FIELDS) as BehaviorModel[];

const DEFAULTS: Record<BehaviorModel, Behavior> = {
  CONSTANT: { value: 0 },
  UNIFORM: { min: 0, max: 100 },
  NORMAL: { mean: 50, standardDeviation: 5 },
  RAMP: { from: 0, to: 100, durationMs: 60_000, repeat: false },
  SINE: { center: 50, amplitude: 10, periodMs: 60_000 },
  COUNTER_RATE: { initialValue: 0, incrementPerSecond: 1 },
  PULSE: { onDurationMs: 30_000, offDurationMs: 30_000, initialValue: true },
  BERNOULLI: { trueProbability: 0.5 },
  SEQUENCE: { values: ['RUN', 'IDLE'], dwellMs: 60_000, repeat: true },
};

export const COMMON_DEFAULTS = { generationIntervalMs: 5000, sourceQuality: 'GOOD', missingProbability: 0 };

export function defaultBehavior(model: BehaviorModel, keepCommon: Behavior = COMMON_DEFAULTS): BehaviorConfiguration {
  const common = {
    generationIntervalMs: keepCommon.generationIntervalMs ?? 5000,
    sourceQuality: keepCommon.sourceQuality ?? 'GOOD',
    missingProbability: keepCommon.missingProbability ?? 0,
    ...(keepCommon.seedOverride != null ? { seedOverride: keepCommon.seedOverride } : {}),
  };
  return { model, ...common, ...DEFAULTS[model] } as BehaviorConfiguration;
}

export const behaviorForSignalKind = (kind: string): BehaviorConfiguration =>
  defaultBehavior(kind === 'COUNTER' ? 'COUNTER_RATE' : kind === 'STATE' ? 'SEQUENCE' : 'NORMAL');

const parseAny = (s: string): unknown => {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s;
};

export function BehaviorEditor({ value, onChange, disabled }: { value: BehaviorConfiguration; onChange: (b: BehaviorConfiguration) => void; disabled?: boolean }) {
  const b = value as Behavior;
  const model = b.model as BehaviorModel;
  const set = (key: string, v: unknown) => {
    const next = { ...b };
    if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete next[key];
    else next[key] = v;
    onChange(next as BehaviorConfiguration);
  };

  return (
    <Stack gap={6}>
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing={6}>
        <NativeSelect
          size="xs"
          label="Модель"
          disabled={disabled}
          value={model}
          data={MODELS.map((m) => ({ value: m, label: MODEL_LABEL[m] }))}
          onChange={(e) => onChange(defaultBehavior(e.currentTarget.value as BehaviorModel, b))}
        />
        <NumberInput size="xs" label="Период генерации, мс" disabled={disabled} min={1000} step={1000} value={b.generationIntervalMs as number} onChange={(v) => set('generationIntervalMs', v === '' ? undefined : Number(v))} />
        <NativeSelect
          size="xs"
          label="Качество источника"
          disabled={disabled}
          value={(b.sourceQuality as string) ?? 'GOOD'}
          data={Object.entries(QUALITY_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(e) => set('sourceQuality', e.currentTarget.value)}
        />
        <NumberInput size="xs" label="Доля пропусков (0…1)" disabled={disabled} min={0} max={1} step={0.01} decimalScale={3} value={(b.missingProbability as number) ?? 0} onChange={(v) => set('missingProbability', v === '' ? undefined : Number(v))} />
        {FIELDS[model].map((f) => {
          if (f.kind === 'bool')
            return <Switch key={f.key} size="xs" mt={22} label={f.label} disabled={disabled} checked={!!b[f.key]} onChange={(e) => set(f.key, e.currentTarget.checked)} />;
          if (f.kind === 'number')
            return (
              <NumberInput
                key={f.key}
                size="xs"
                label={f.label}
                disabled={disabled}
                min={f.min}
                max={f.max}
                step={f.step}
                decimalScale={6}
                value={(b[f.key] as number | undefined) ?? ''}
                onChange={(v) => set(f.key, v === '' ? undefined : Number(v))}
              />
            );
          if (f.kind === 'list')
            return (
              <TextInput
                key={f.key}
                size="xs"
                label={f.label}
                disabled={disabled}
                value={((b[f.key] as string[]) ?? []).join(', ')}
                onChange={(e) => set(f.key, e.currentTarget.value.split(',').map((x) => x.trim()).filter(Boolean))}
              />
            );
          return <TextInput key={f.key} size="xs" label={f.label} disabled={disabled} value={String(b[f.key] ?? '')} onChange={(e) => set(f.key, parseAny(e.currentTarget.value))} />;
        })}
      </SimpleGrid>
    </Stack>
  );
}
