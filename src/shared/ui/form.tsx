import { Anchor, Box, Code, Drawer, Group, Input, NumberInput, Select, Stack, Table, Text, TextInput, Tooltip, type ComboboxItem, type ComboboxItemGroup, type OptionsFilter } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';
import { GLOSSARY, HINT, type EnumOption } from '@/shared/i18n';
import { CODE_PATTERN, makeCode } from '@/shared/lib';

export { formatMs } from '@/shared/lib';

/** Подпись поля со значком ⓘ и всплывающим пояснением. */
export function HintLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  if (!hint) return <>{children}</>;
  return (
    <Group gap={4} component="span" wrap="nowrap" style={{ display: 'inline-flex' }}>
      {children}
      <Tooltip label={hint} multiline w={280} withArrow events={{ hover: true, focus: true, touch: true }}>
        <Box component="span" aria-label={hint} style={{ display: 'inline-flex', color: 'var(--mantine-color-dimmed)', cursor: 'help' }}>
          <IconInfoCircle size={14} />
        </Box>
      </Tooltip>
    </Group>
  );
}

export type EnumSelectOption = EnumOption & { group?: string };

const matches = (o: EnumSelectOption, q: string) => [o.label, o.hint ?? '', o.value].some((s) => s.toLowerCase().includes(q));

/**
 * Select по словарю: русская подпись, серое пояснение под ней; поиск по подписи, пояснению и коду.
 * `empty` добавляет пустой вариант (значение '').
 */
export function EnumSelect({
  options,
  value,
  onChange,
  label,
  hint,
  description,
  error,
  disabled,
  required,
  empty,
  size,
  w,
  style,
}: {
  options: EnumSelectOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: string;
  description?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  empty?: string;
  size?: string;
  w?: number | string;
  style?: React.CSSProperties;
}) {
  const all = useMemo(() => (empty != null ? [{ value: '', label: empty }, ...options] : options), [options, empty]);
  const byValue = useMemo(() => new Map(all.map((o) => [o.value, o])), [all]);
  const data = useMemo(() => {
    if (!all.some((o) => o.group)) return all.map((o) => ({ value: o.value, label: o.label }));
    const groups = new Map<string, ComboboxItem[]>();
    for (const o of all) {
      const g = o.group ?? '';
      groups.set(g, [...(groups.get(g) ?? []), { value: o.value, label: o.label }]);
    }
    return Array.from(groups, ([group, items]): ComboboxItemGroup<ComboboxItem> => ({ group, items }));
  }, [all]);
  const filter: OptionsFilter = ({ options: opts, search }) => {
    const q = search.trim().toLowerCase();
    if (!q) return opts;
    const keep = (item: ComboboxItem) => {
      const o = byValue.get(item.value);
      return o ? matches(o, q) : item.label.toLowerCase().includes(q);
    };
    return opts
      .map((x) => ('group' in x ? { ...x, items: x.items.filter((i) => keep(i as ComboboxItem)) } : x))
      .filter((x) => ('group' in x ? x.items.length > 0 : keep(x as ComboboxItem)));
  };
  return (
    <Select
      label={label != null ? <HintLabel hint={hint}>{label}</HintLabel> : undefined}
      description={description}
      error={error}
      disabled={disabled}
      required={required}
      size={size}
      w={w}
      style={style}
      data={data}
      value={value ?? (empty != null ? '' : null)}
      onChange={(v) => onChange(v ?? '')}
      allowDeselect={false}
      searchable={all.length > 8}
      filter={filter}
      nothingFoundMessage="Ничего не найдено"
      maxDropdownHeight={320}
      comboboxProps={{ withinPortal: true }}
      renderOption={({ option }) => {
        const o = byValue.get(option.value);
        return (
          <div>
            <Text size="sm">{option.label}</Text>
            {o?.hint && <Text size="xs" c="dimmed" lh={1.3}>{o.hint}</Text>}
          </div>
        );
      }}
    />
  );
}

// ---------- Длительности ----------

const UNITS = [
  { value: 's', label: 'секунд', ms: 1000 },
  { value: 'm', label: 'минут', ms: 60_000 },
  { value: 'h', label: 'часов', ms: 3_600_000 },
] as const;

type DurationUnit = (typeof UNITS)[number]['value'];

const bestUnit = (ms: number): DurationUnit => (ms >= 3_600_000 && ms % 3_600_000 === 0 ? 'h' : ms >= 60_000 && ms % 60_000 === 0 ? 'm' : 's');

/** Поле длительности: число + «секунд / минут / часов»; значение наружу — в миллисекундах ('' — пусто). */
export function DurationInput({
  value,
  onChange,
  label,
  hint,
  description,
  error,
  disabled,
  required,
  min = 0,
}: {
  value: number | '';
  onChange: (ms: number | '') => void;
  label: ReactNode;
  hint?: string;
  description?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  min?: number;
}) {
  const [unit, setUnit] = useState<DurationUnit>(() => (value === '' ? 's' : bestUnit(value)));
  const factor = UNITS.find((u) => u.value === unit)!.ms;
  const shown = value === '' ? '' : Math.round((value / factor) * 1000) / 1000;
  return (
    <Input.Wrapper label={<HintLabel hint={hint}>{label}</HintLabel>} description={description} error={error} required={required}>
      <Group gap={6} wrap="nowrap" mt={description ? 4 : 0}>
        <NumberInput
          style={{ flex: 1 }}
          aria-label={typeof label === 'string' ? label : undefined}
          disabled={disabled}
          error={!!error}
          min={min}
          decimalScale={3}
          value={shown}
          onChange={(v) => onChange(v === '' || v == null ? '' : Math.round(Number(v) * factor))}
        />
        <Select
          aria-label="Единица времени"
          w={110}
          disabled={disabled}
          allowDeselect={false}
          data={UNITS.map((u) => ({ value: u.value, label: u.label }))}
          value={unit}
          onChange={(v) => v && setUnit(v as DurationUnit)}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
    </Input.Wrapper>
  );
}

// ---------- Код из названия ----------

export interface AutoCode {
  value: string;
  manual: boolean;
  set: (code: string) => void;
  reset: () => void;
  valid: boolean;
}

/**
 * Код объекта: пока пользователь его не трогал — строится из названия (`makeCode`) и уникализируется по `taken`.
 * `fixed` — код уже созданного объекта (неизменяем).
 */
export function useAutoCode(name: string, prefix: string, taken: readonly string[] = [], fixed?: string | null): AutoCode {
  const [manual, setManual] = useState<string | null>(null);
  const key = taken.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const auto = useMemo(() => makeCode(name, prefix, taken), [name, prefix, key]);
  const value = fixed ?? manual ?? auto;
  return { value, manual: manual != null, set: (c) => setManual(c.toUpperCase()), reset: () => setManual(null), valid: CODE_PATTERN.test(value) };
}

/** Код свёрнут в одну строку «Код: X · изменить»; у созданного объекта — только для чтения. */
export function CodeField({ code, locked, error }: { code: AutoCode; locked?: boolean; error?: string }) {
  const [open, setOpen] = useState(false);
  const formatError = code.value && !code.valid ? 'Латиница A–Z, цифры и _, с буквы, до 64 символов' : undefined;
  if (locked) {
    return <TextInput label={<HintLabel hint={HINT.code}>Код</HintLabel>} description="После создания не меняется" disabled value={code.value} ff="monospace" />;
  }
  if (open || error || formatError) {
    return (
      <TextInput
        label={<HintLabel hint={HINT.code}>Код</HintLabel>}
        description={
          <>
            Создаётся из названия.{' '}
            {code.manual && (
              <Anchor component="button" type="button" size="xs" onClick={() => code.reset()}>
                Вернуть автоматический
              </Anchor>
            )}
          </>
        }
        required
        ff="monospace"
        maxLength={64}
        value={code.value}
        error={error ?? formatError}
        onChange={(e) => code.set(e.currentTarget.value)}
      />
    );
  }
  return (
    <Text size="xs" c="dimmed">
      <HintLabel hint={HINT.code}>
        <span>
          Код: <Code>{code.value}</Code> — создаётся из названия
        </span>
      </HintLabel>{' '}
      <Anchor component="button" type="button" size="xs" onClick={() => setOpen(true)}>
        Изменить код
      </Anchor>
    </Text>
  );
}

// ---------- Справка ----------

const HIERARCHY = `Предприятие   «Завод упаковки»          — площадка: часовой пояс и смены
 └ Линия      «Линия экструзии 1»       — группа машин на схеме и в отчётах
    └ Машина  «Экструдер Э-1»           — по ней считаются работа, простои, OEE
       ├ Узел «Шнек»                    — необязательно: часть машины
       │  └ Сигнал «Температура зоны 1» — значение, которое передаёт машина
       └ Сигнал «Машина в работе»        — сигнал может относиться ко всей машине`;

/** Drawer «Справка»: схема иерархии и глоссарий терминов настройки. */
export function HelpDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="lg" title="Справка по настройке">
      <Stack gap="md">
        <Text size="sm">
          <b>Сигналы</b> — то, что машина сообщает. <b>Правила состояния</b> — как по сигналам понять, работает ли машина. <b>Состояние</b> — итог, из которого считаются простои и показатели.
        </Text>
        <Box component="pre" fz="xs" p="sm" style={{ whiteSpace: 'pre', overflowX: 'auto', background: 'var(--mantine-color-default-hover)', borderRadius: 6 }}>
          {HIERARCHY}
        </Box>
        <Table verticalSpacing={6} aria-label="Глоссарий">
          <Table.Tbody>
            {GLOSSARY.map((g) => (
              <Table.Tr key={g.term}>
                <Table.Td fw={600} w="38%" style={{ verticalAlign: 'top' }}>{g.term}</Table.Td>
                <Table.Td fz="sm">{g.text}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Drawer>
  );
}
