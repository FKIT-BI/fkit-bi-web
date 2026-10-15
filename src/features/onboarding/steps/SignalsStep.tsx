import { ActionIcon, Alert, Badge, Button, Card, Collapse, Group, Modal, NativeSelect, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconCopy, IconPlus, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { setup, type ComponentKind, type MeasurementUnit, type SignalKind, type SignalValueType } from '@/shared/api';
import { COMPONENT_KIND, COMPONENT_KINDS, enumLabel, enumOptions, HINT, KINDS_FOR_VALUE_TYPE, SEMANTIC, SIGNAL_KIND, SIGNAL_SEMANTICS, VALUE_TYPE, type SignalSemantic } from '@/shared/i18n';
import { unitOptions, unitSymbol } from '@/shared/lib';
import { DurationInput, EnumSelect, HintLabel } from '@/shared/ui';
import { copyFromMachine, explain, saveSignals } from '../actions';
import { newKey, signalFromTemplate, type ComponentDraft, type SignalDraft } from '../draft';
import { CUSTOM_TEMPLATE_ID, isNumeric, SIGNAL_TEMPLATES, templatesForMachineType, unitForSemantic, type SignalTemplate } from '../templates';
import { sk, type StepProps } from './types';

const KIND_OPTIONS = COMPONENT_KINDS.map((k) => ({ value: k, label: COMPONENT_KIND[k].label, hint: COMPONENT_KIND[k].hint, group: COMPONENT_KIND[k].group }));
const SEMANTIC_OPTIONS = SIGNAL_SEMANTICS.map((c) => ({ value: c, label: SEMANTIC[c].label, hint: [SEMANTIC[c].hint, SEMANTIC[c].unit].filter(Boolean).join(' · ') }));
const CUSTOM: SignalTemplate = { id: CUSTOM_TEMPLATE_ID, title: 'Свой сигнал', hint: 'Любая другая величина', name: 'Новый сигнал', semanticCode: 'CUSTOM', valueType: 'DOUBLE', signalKind: 'GAUGE' };
const NEW_COMPONENT = '__new__';

export function SignalsStep({ draft: d, patch, register }: StepProps) {
  const qc = useQueryClient();
  const units = useQuery({ queryKey: sk('measurement-units'), queryFn: setup.measurementUnits, staleTime: Infinity });
  const machines = useQuery({ queryKey: sk('machines', d.enterpriseId), queryFn: () => setup.machines(d.enterpriseId), enabled: !!d.enterpriseId });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [componentFor, setComponentFor] = useState<string | null>(null);
  const [copySource, setCopySource] = useState<string | null>(d.copyFromMachineId || null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const unitList = units.data ?? [];
  const suggested = templatesForMachineType(d.machine.machineType).filter((id) => !d.signals.some((s) => s.templateId === id));
  const others = (machines.data ?? []).filter((m) => m.id !== d.machineId);

  const setSignals = (signals: SignalDraft[]) => patch({ signals });
  const update = (key: string, p: Partial<SignalDraft>) => setSignals(d.signals.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const add = (t: SignalTemplate) => {
    const featured = d.signals.filter((s) => s.featured).length < 3;
    const s = signalFromTemplate(t, isNumeric(t.valueType) ? unitForSemantic(t.semanticCode, unitList) : null, featured);
    const same = d.signals.filter((x) => x.templateId === t.id).length;
    const next = same ? { ...s, name: `${s.name} ${same + 1}` } : s;
    setSignals([...d.signals, next]);
    if (t.id === CUSTOM_TEMPLATE_ID) setOpenKey(next.key);
  };
  const addMany = (ids: string[]) => {
    let list = [...d.signals];
    for (const id of ids) {
      const t = SIGNAL_TEMPLATES.find((x) => x.id === id);
      if (t) list = [...list, signalFromTemplate(t, isNumeric(t.valueType) ? unitForSemantic(t.semanticCode, unitList) : null, list.filter((s) => s.featured).length < 3)];
    }
    setSignals(list);
  };
  const remove = (s: SignalDraft) => patch({ signals: d.signals.filter((x) => x.key !== s.key), removedSignalIds: s.id ? [...d.removedSignalIds, s.id] : d.removedSignalIds });
  const copy = async () => {
    if (!copySource) return;
    if (d.signals.length && !window.confirm('Заменить текущий список сигналов набором выбранной машины?')) return;
    setCopying(true);
    setCopyError(null);
    try {
      const { components, signals } = await copyFromMachine(copySource);
      const removed = d.signals.filter((s) => s.id).map((s) => s.id as string);
      patch({ components: [...d.components.filter((c) => c.id), ...components], signals, copyFromMachineId: copySource, removedSignalIds: [...d.removedSignalIds, ...removed], rules: null });
      if (!signals.length) setCopyError('У выбранной машины нет активных сигналов.');
    } catch (e) {
      setCopyError(explain(e));
    } finally {
      setCopying(false);
    }
  };

  register(async () => {
    if (!d.signals.length) return ['Добавьте хотя бы один сигнал: без сигналов состояние машины не определить.'];
    const problems = d.signals.flatMap((s) => {
      const out: string[] = [];
      if (!s.name.trim()) out.push('У сигнала нет названия.');
      if (isNumeric(s.valueType) && s.validMin !== '' && s.validMax !== '' && s.validMin > s.validMax) out.push(`«${s.name}»: минимум больше максимума.`);
      if (s.staleAfterMs !== '' && s.expectedIntervalMs !== '' && s.staleAfterMs < s.expectedIntervalMs) out.push(`«${s.name}»: «Считать устаревшим через» не может быть меньше «Значение приходит раз в».`);
      if (!KINDS_FOR_VALUE_TYPE[s.valueType].includes(s.signalKind)) out.push(`«${s.name}»: характер «${enumLabel(SIGNAL_KIND, s.signalKind)}» не подходит к формату «${enumLabel(VALUE_TYPE, s.valueType)}».`);
      return out;
    });
    if (problems.length) return problems;
    const r = await saveSignals(d, d.removedSignalIds);
    const failedRemovals = new Set(r.errors.map((e) => e.key));
    patch({ components: r.components, signals: r.signals, removedSignalIds: d.removedSignalIds.filter((id) => failedRemovals.has(id)) });
    await qc.invalidateQueries({ queryKey: ['setup'] });
    return r.errors.map((e) => e.message);
  });

  return (
    <Stack gap="md">
      {suggested.length > 0 && (
        <Alert color="blue" p="xs">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">
              Для типа «{d.machine.machineType}» обычно передают: {suggested.map((id) => SIGNAL_TEMPLATES.find((t) => t.id === id)?.title).join(', ')}.
            </Text>
            <Button size="compact-sm" onClick={() => addMany(suggested)}>Добавить все</Button>
          </Group>
        </Alert>
      )}

      {others.length > 0 && (
        <Group gap="xs" align="flex-end" wrap="wrap">
          <Select
            label="Скопировать набор сигналов и правил с машины"
            placeholder="Выберите машину"
            w={340}
            clearable
            searchable
            data={others.map((m) => ({ value: m.id, label: m.name }))}
            value={copySource}
            onChange={setCopySource}
            comboboxProps={{ withinPortal: true }}
          />
          <Button variant="light" leftSection={<IconCopy size={14} />} disabled={!copySource} loading={copying} onClick={() => void copy()}>Скопировать</Button>
        </Group>
      )}
      {copyError && <Alert color="red" p="xs">{copyError}</Alert>}

      <div>
        <Text size="sm" fw={600} mb={6}>Что машина передаёт? Нажмите, чтобы добавить</Text>
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="xs">
          {[...SIGNAL_TEMPLATES, CUSTOM].map((t) => {
            const n = d.signals.filter((s) => s.templateId === t.id).length;
            return (
              <Card key={t.id} withBorder padding="xs" component="button" type="button" onClick={() => add(t)} style={{ textAlign: 'left', cursor: 'pointer', borderColor: n ? 'var(--mantine-color-blue-6)' : undefined }} aria-label={`Добавить сигнал «${t.title}»`}>
                <Group justify="space-between" wrap="nowrap" gap={4}>
                  <Text size="sm" fw={600}>{t.title}</Text>
                  {n > 0 ? <Badge size="xs">{n}</Badge> : <IconPlus size={14} />}
                </Group>
                <Text size="xs" c="dimmed" lh={1.3}>{t.hint}</Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </div>

      <Stack gap="xs">
        <Text size="sm" fw={600}>Сигналы машины ({d.signals.length})</Text>
        {!d.signals.length && <Text size="sm" c="dimmed">Пока пусто — выберите шаблоны выше.</Text>}
        {d.signals.map((s) => (
          <SignalRow
            key={s.key}
            s={s}
            units={unitList}
            components={d.components}
            open={openKey === s.key}
            onToggle={() => setOpenKey(openKey === s.key ? null : s.key)}
            onChange={(p) => update(s.key, p)}
            onRemove={() => remove(s)}
            onNewComponent={() => setComponentFor(s.key)}
          />
        ))}
      </Stack>

      <NewComponentModal
        opened={!!componentFor}
        onClose={() => setComponentFor(null)}
        onCreate={(c) => {
          patch({ components: [...d.components, c], signals: d.signals.map((s) => (s.key === componentFor ? { ...s, componentKey: c.key } : s)) });
          setComponentFor(null);
        }}
      />
    </Stack>
  );
}

function SignalRow({ s, units, components, open, onToggle, onChange, onRemove, onNewComponent }: {
  s: SignalDraft;
  units: MeasurementUnit[];
  components: ComponentDraft[];
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<SignalDraft>) => void;
  onRemove: () => void;
  onNewComponent: () => void;
}) {
  const numeric = isNumeric(s.valueType);
  const kinds = KINDS_FOR_VALUE_TYPE[s.valueType];
  const semantic = s.semanticCode === 'CUSTOM' ? `Другое${s.customSemanticCode ? `: ${s.customSemanticCode}` : ''}` : enumLabel(SEMANTIC, s.semanticCode);
  const summary = [semantic, enumLabel(VALUE_TYPE, s.valueType), enumLabel(SIGNAL_KIND, s.signalKind), numeric && s.unitCode ? unitSymbol(units, s.unitCode) : null].filter(Boolean).join(' · ');
  const pickSemantic = (code: string) => {
    const t = SEMANTIC[code as SignalSemantic];
    if (!t?.valueType || !t.signalKind) return onChange({ semanticCode: code });
    onChange({ semanticCode: code, valueType: t.valueType, signalKind: t.signalKind, unitCode: isNumeric(t.valueType) ? (unitForSemantic(code, units) ?? '') : '' });
  };
  const pickValueType = (valueType: SignalValueType) => {
    const allowed = KINDS_FOR_VALUE_TYPE[valueType];
    onChange({ valueType, signalKind: allowed.includes(s.signalKind) ? s.signalKind : allowed[0], ...(isNumeric(valueType) ? {} : { unitCode: '', validMin: '', validMax: '' }) });
  };
  return (
    <Card withBorder padding="xs">
      <Group gap="xs" align="flex-end" wrap="wrap">
        <TextInput label="Название" aria-label="Название сигнала" style={{ flex: 1, minWidth: 180 }} value={s.name} onChange={(e) => onChange({ name: e.currentTarget.value })} />
        <NativeSelect
          label={<HintLabel hint={HINT.component}>Где установлен</HintLabel>}
          w={200}
          value={s.componentKey}
          data={[{ value: '', label: 'Вся машина' }, ...components.map((c) => ({ value: c.key, label: c.name })), { value: NEW_COMPONENT, label: '+ Новый узел…' }]}
          onChange={(e) => (e.currentTarget.value === NEW_COMPONENT ? onNewComponent() : onChange({ componentKey: e.currentTarget.value }))}
        />
        <Tooltip label={HINT.featured}>
          <ActionIcon variant="subtle" size="lg" mb={2} color={s.featured ? 'yellow' : 'gray'} aria-label={s.featured ? 'Не показывать на карточке' : 'Показывать на карточке'} aria-pressed={s.featured} onClick={() => onChange({ featured: !s.featured })}>
            {s.featured ? <IconStarFilled size={18} /> : <IconStar size={18} />}
          </ActionIcon>
        </Tooltip>
        <ActionIcon variant="subtle" size="lg" mb={2} color="red" aria-label="Убрать сигнал" onClick={onRemove}><IconTrash size={16} /></ActionIcon>
      </Group>
      <UnstyledButton mt={6} onClick={onToggle} aria-expanded={open}>
        <Group gap={4} wrap="nowrap">
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="xs" c="dimmed">{summary}{s.id ? ' · сохранён' : ''}</Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Stack gap="xs" mt="xs">
          {s.locked && <Alert color="gray" p="xs">По сигналу уже есть данные — смысл, формат и единицу изменить нельзя. Для другой величины добавьте новый сигнал.</Alert>}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <EnumSelect label="Что измеряет" hint={HINT.semantic} disabled={s.locked} options={SEMANTIC_OPTIONS} value={s.semanticCode} onChange={pickSemantic} />
            {s.semanticCode === 'CUSTOM' ? (
              <TextInput label="Своя величина (код)" description="Пусто — создастся из названия" ff="monospace" disabled={s.locked} value={s.customSemanticCode} onChange={(e) => onChange({ customSemanticCode: e.currentTarget.value.toUpperCase() })} />
            ) : (
              <div />
            )}
            <EnumSelect label="Какое значение приходит" hint={HINT.valueType} disabled={s.locked} options={enumOptions(VALUE_TYPE)} value={s.valueType} onChange={(v) => pickValueType(v as SignalValueType)} />
            <EnumSelect label="Как ведёт себя значение" hint={HINT.signalKind} disabled={s.locked || kinds.length < 2} options={enumOptions(SIGNAL_KIND, kinds)} value={kinds.includes(s.signalKind) ? s.signalKind : kinds[0]} onChange={(v) => onChange({ signalKind: v as SignalKind })} />
            {numeric && <NativeSelect label={<HintLabel hint={HINT.unit}>Единица измерения</HintLabel>} disabled={s.locked} value={s.unitCode} data={unitOptions(units, s.unitCode, 'Без единицы')} onChange={(e) => onChange({ unitCode: e.currentTarget.value })} />}
            {numeric && <div />}
            {numeric && <NumberInput label={<HintLabel hint={HINT.validRange}>Допустимый минимум</HintLabel>} value={s.validMin} onChange={(v) => onChange({ validMin: v === '' ? '' : Number(v) })} />}
            {numeric && <NumberInput label={<HintLabel hint={HINT.validRange}>Допустимый максимум</HintLabel>} value={s.validMax} onChange={(v) => onChange({ validMax: v === '' ? '' : Number(v) })} />}
            <DurationInput label="Значение приходит раз в" hint={HINT.expectedInterval} min={1} value={s.expectedIntervalMs} onChange={(v) => onChange({ expectedIntervalMs: v })} />
            <DurationInput label="Считать устаревшим через" hint={HINT.staleAfter} min={1} value={s.staleAfterMs} onChange={(v) => onChange({ staleAfterMs: v })} />
          </SimpleGrid>
        </Stack>
      </Collapse>
    </Card>
  );
}

function NewComponentModal({ opened, onClose, onCreate }: { opened: boolean; onClose: () => void; onCreate: (c: ComponentDraft) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ComponentKind>('OTHER');
  return (
    <Modal opened={opened} onClose={onClose} title="Новый узел машины" onExitTransitionEnd={() => { setName(''); setKind('OTHER'); }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate({ key: newKey('cmp'), name: name.trim(), kind });
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{HINT.component}</Text>
          <TextInput label="Название" placeholder="Шнек" required data-autofocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <EnumSelect label="Вид узла" hint={HINT.componentKind} options={KIND_OPTIONS} value={kind} onChange={(v) => setKind(v as ComponentKind)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={!name.trim()}>Добавить</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
