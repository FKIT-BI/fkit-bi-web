import { Alert, Box, Button, Card, Grid, Group, Stack, Stepper, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useAdminNav } from '@/shared/model';
import { draftForMachine, explain } from './actions';
import { emptyDraft, LAST_STEP, loadDraft, nextMachineDraft, STEPS, storeDraft, type WizardDraft } from './draft';
import { EnterpriseStep } from './steps/EnterpriseStep';
import { LaunchStep } from './steps/LaunchStep';
import { LineStep } from './steps/LineStep';
import { MachineStep } from './steps/MachineStep';
import { RulesStep } from './steps/RulesStep';
import { ShiftsStep } from './steps/ShiftsStep';
import { SignalsStep } from './steps/SignalsStep';
import type { StepProps, StepSave } from './steps/types';

/** Пояснения «Что это?» к шагам (спецификация онбординга, 4.2–4.8). */
const HELP: Array<{ title: string; text: string[] }> = [
  { title: 'Предприятие', text: ['Завод или площадка. Всё остальное — смены, линии, машины — относится к нему.', 'Часовой пояс нужен, чтобы смены и сутки считались по местному времени завода.'] },
  { title: 'Смены и причины потерь', text: ['По сменам строятся отчёты, хронометраж и сравнение «смена к смене». Смена может переходить через полночь.', 'Причины потерь — справочник, из которого оператор выбирает, почему машина стояла.'] },
  { title: 'Линия', text: ['Линия — группа машин, работающих вместе. На обзоре предприятия машины показываются по линиям.', 'Если машина стоит отдельно, выберите «Без линии».'] },
  { title: 'Машина', text: ['Машина — то, по чему считаются работа, простои и OEE.', 'Норма выпуска нужна для производительности. Тип машины помогает предложить сигналы.', 'Машина остаётся «Не подключена» до последнего шага и не попадает в мониторинг.'] },
  { title: 'Сигналы', text: ['Сигнал — значение, которое машина передаёт: «в работе да/нет», скорость, температура, счётчик изделий.', 'Выберите шаблоны — формат, характер и единица заполнятся сами. ★ — показывать сигнал на карточке машины.', 'Узел — необязательная часть машины (двигатель, шнек), где стоит датчик.'] },
  { title: 'Как определять состояние', text: ['Правила говорят, когда машина в работе, а когда в аварии. Во всех остальных случаях — состояние по умолчанию, обычно «Простой».', 'Задержка защищает от кратких всплесков: состояние меняется, только если условие держится заданное время.'] },
  { title: 'Проверка и запуск', text: ['Система проверяет, что у машины есть сигналы и правила.', 'После подключения по машине сразу начинают считаться состояния. Чтобы увидеть отчёты без реального оборудования, сгенерируйте тестовые данные.'] },
];

const STEP_COMPONENTS: Array<(p: StepProps) => React.ReactNode> = [EnterpriseStep, ShiftsStep, LineStep, MachineStep, SignalsStep, RulesStep, LaunchStep];

/** Мастер «Подключить машину»: каждый шаг сохраняется на сервере по «Сохранить и далее». */
export function OnboardingWizard({ readOnly }: { readOnly?: boolean }) {
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? emptyDraft());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(false);
  const saveRef = useRef<StepSave>(async () => []);
  const resumeId = useAdminNav((s) => s.resumeId);
  const clearResume = useAdminNav((s) => s.clearResume);

  useEffect(() => storeDraft(draft), [draft]);

  useEffect(() => {
    if (!resumeId) return;
    clearResume();
    setResuming(true);
    draftForMachine(resumeId, emptyDraft())
      .then((d) => {
        setDraft(d);
        setErrors([]);
      })
      .catch((e) => setErrors([explain(e)]))
      .finally(() => setResuming(false));
  }, [resumeId, clearResume]);

  const patch = (p: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...p }));
  const reachable = Math.min(LAST_STEP, Math.max(-1, ...draft.saved) + 1);
  const step = !draft.enterpriseId ? 0 : Math.min(draft.step, reachable);
  const goTo = (s: number) => {
    if (s > reachable || busy) return;
    setErrors([]);
    patch({ step: s });
  };

  const next = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const problems = await saveRef.current();
      if (problems.length) return setErrors(problems);
      setDraft((d) => ({ ...d, saved: d.saved.includes(step) ? d.saved : [...d.saved, step], step: Math.min(LAST_STEP, step + 1) }));
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErrors([explain(e)]);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    if (!window.confirm('Начать заново? Уже сохранённое на сервере останется, мастер просто очистится.')) return;
    setDraft(emptyDraft());
    setErrors([]);
  };

  if (readOnly) {
    return <Alert color="gray">Подключать машины может только администратор. Выберите роль «Администратор» в шапке.</Alert>;
  }

  const StepView = STEP_COMPONENTS[step];
  const help = HELP[step];

  return (
    <Stack gap="md" maw={1200} mx="auto" w="100%">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2} fz="h3">Подключение машины</Title>
          <Text size="sm" c="dimmed">Каждый шаг сохраняется сразу — ошибка видна там, где возникла. Машина попадёт в мониторинг только на последнем шаге.</Text>
        </div>
        <Button size="xs" variant="subtle" color="gray" leftSection={<IconRefresh size={14} />} onClick={restart}>Начать заново</Button>
      </Group>

      <Stepper active={step} onStepClick={goTo} size="sm" allowNextStepsSelect={false} wrap>
        {STEPS.map((s, i) => (
          <Stepper.Step key={s.title} label={s.title} title={s.short} allowStepSelect={i <= reachable} completedIcon={undefined} loading={busy && i === step} />
        ))}
      </Stepper>

      {resuming && <Text c="dimmed">Загружаем настройку машины…</Text>}

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card withBorder padding="md" radius="md">
            <Stack gap="md">
              <Title order={3} fz="lg">{step + 1}. {help.title}</Title>
              {!resuming && (
                <StepView
                  key={`${step}:${draft.machineId}`}
                  draft={draft}
                  patch={patch}
                  goTo={goTo}
                  register={(save) => {
                    saveRef.current = save;
                  }}
                  onNextMachine={() => setDraft(nextMachineDraft(draft))}
                />
              )}
              {errors.length > 0 && (
                <Alert color="red" title="Шаг не сохранён" role="alert">
                  <Stack gap={2}>{errors.map((e, i) => <Text key={i} size="sm">{e}</Text>)}</Stack>
                </Alert>
              )}
              {step < LAST_STEP && (
                <Group justify="space-between">
                  <Button variant="default" leftSection={<IconArrowLeft size={16} />} disabled={step === 0 || busy} onClick={() => goTo(step - 1)}>Назад</Button>
                  <Button rightSection={<IconArrowRight size={16} />} loading={busy} onClick={() => void next()}>Сохранить и далее</Button>
                </Group>
              )}
              {step === LAST_STEP && (
                <Group>
                  <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => goTo(step - 1)}>Назад</Button>
                </Group>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="md" radius="md" bg="var(--mantine-color-default-hover)">
            <Group gap={6} mb={6}>
              <IconInfoCircle size={16} />
              <Text fw={600} size="sm">Что это?</Text>
            </Group>
            <Stack gap={6}>{help.text.map((t, i) => <Text key={i} size="sm">{t}</Text>)}</Stack>
            <Box mt="sm">
              <Text size="xs" c="dimmed">Предприятие → Линия → Машина → Узел → Сигнал. Сигналы — что машина сообщает; правила — как по ним понять, работает ли она.</Text>
            </Box>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
