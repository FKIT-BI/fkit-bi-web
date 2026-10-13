import { Alert, Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Textarea } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useEnterpriseTree } from '@/entities/enterprise';
import { useReasons } from '@/entities/loss-reason';
import { api, ApiError, qk, type ManualIncidentCreate } from '@/shared/api';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, MINUTE, parseLocal, toIso, toLocalString } from '@/shared/lib';
import { useAuth } from '@/shared/model';
import { useIncidentModal } from './model';
import { incidentFormSchema, type IncidentForm } from './schema';

const FIELD_MAP: Record<string, keyof IncidentForm> = {
  from: 'from',
  to: 'to',
  lossReasonId: 'reasonId',
  stateOverride: 'stateOverride',
  comment: 'comment',
};

export function IncidentModal() {
  const { t } = useTranslation();
  const { opened, draft, close } = useIncidentModal();
  const user = useAuth((s) => s.user);
  const tree = useEnterpriseTree();
  const reasons = useReasons();
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');
  const idempotencyKey = useMemo(() => (opened ? crypto.randomUUID() : ''), [opened]);

  const form = useForm<IncidentForm>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: { machineId: '', from: '', to: null, ongoing: false, reasonId: '', stateOverride: '', comment: '' },
  });
  const { control, handleSubmit, reset, register, formState, setError } = form;

  useEffect(() => {
    if (!opened) return;
    const now = Date.now();
    reset({
      machineId: draft.machineId ?? '',
      from: toLocalString(draft.from ?? now - 30 * MINUTE),
      to: draft.to === null ? null : toLocalString(draft.to ?? now),
      ongoing: draft.to === null,
      reasonId: draft.reasonId ?? '',
      stateOverride: draft.stateOverride ?? '',
      comment: '',
    });
  }, [opened, draft, reset]);

  const [machineId, from, to, ongoing] = useWatch({ control, name: ['machineId', 'from', 'to', 'ongoing'] });
  const fromMs = from ? parseLocal(from) : undefined;
  const toMs = ongoing ? Date.now() : to ? parseLocal(to) : undefined;

  const overlaps = useQuery({
    ...api.machineIncidents(machineId, { from: fromMs ?? 0, to: toMs ?? 0 }),
    enabled: opened && !!machineId && fromMs != null && toMs != null && toMs > fromMs,
  });

  const save = useMutation({
    mutationFn: (v: IncidentForm) => {
      const exact = (value: string, original: number | null | undefined) =>
        original != null && value === toLocalString(original) ? original : parseLocal(value);
      const body: ManualIncidentCreate = {
        from: toIso(exact(v.from, draft.from)),
        to: v.ongoing || !v.to ? null : toIso(exact(v.to, draft.to)),
        stateOverride: v.stateOverride || null,
        lossReasonId: v.reasonId || null,
        comment: v.comment || null,
        author: user?.displayName ?? null,
      };
      return api.createIncident(v.machineId, body, idempotencyKey);
    },
    onSuccess: async () => {
      await Promise.all([qk.analytics, qk.intervals, qk.incidents, qk.operations].map((queryKey) => qc.invalidateQueries({ queryKey })));
      notifications.show({ color: 'green', message: t('incident.saved') });
      close();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        for (const fe of e.fieldErrors) {
          const field = FIELD_MAP[fe.path];
          if (field) setError(field, { message: fe.message });
        }
      }
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : String(e) });
    },
  });

  const err = (name: keyof IncidentForm) => {
    const m = formState.errors[name]?.message;
    return m ? t(m) : undefined;
  };

  const machineOptions = tree.lines.map((l) => ({ group: l.name, items: l.machines.map((m) => ({ value: m.id, label: m.name })) }));
  const categories = [...new Set(reasons.list.map((r) => r.category))];
  const reasonOptions = categories.map((c) => ({
    group: t(`category.${c}`),
    items: reasons.list.filter((r) => r.category === c).map((r) => ({ value: r.id, label: r.name })),
  }));
  const others = (overlaps.data ?? []).filter((i) => !i.cancelledAt);

  return (
    <Modal opened={opened} onClose={close} title={t('incident.title')} size="lg" fullScreen={isMobile}>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Stack gap="sm">
          <Controller
            control={control}
            name="machineId"
            render={({ field }) => (
              <Select label={t('incident.machine')} data={machineOptions} searchable required error={err('machineId')} {...field} />
            )}
          />
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Controller
              control={control}
              name="from"
              render={({ field }) => (
                <DateTimePicker
                  label={t('incident.from')}
                  valueFormat="DD.MM.YYYY HH:mm"
                  required
                  error={err('from')}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
            <Controller
              control={control}
              name="to"
              render={({ field }) => (
                <DateTimePicker
                  label={t('incident.to')}
                  valueFormat="DD.MM.YYYY HH:mm"
                  disabled={ongoing}
                  error={err('to')}
                  value={ongoing ? null : field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </SimpleGrid>
          <Checkbox label={t('incident.ongoing')} {...register('ongoing')} />
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Controller
              control={control}
              name="reasonId"
              render={({ field }) => (
                <Select label={t('incident.reason')} data={reasonOptions} searchable clearable error={err('reasonId')} {...field} onChange={(v) => field.onChange(v ?? '')} />
              )}
            />
            <Controller
              control={control}
              name="stateOverride"
              render={({ field }) => (
                <Select
                  label={t('incident.stateOverride')}
                  data={[
                    { value: '', label: t('incident.noOverride') },
                    { value: 'SETUP', label: t('state.SETUP') },
                    { value: 'PLANNED_STOP', label: t('state.PLANNED_STOP') },
                  ]}
                  allowDeselect={false}
                  error={err('stateOverride')}
                  {...field}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
          </SimpleGrid>
          <Textarea
            label={t('incident.comment')}
            autosize
            minRows={2}
            maxLength={500}
            error={err('comment')}
            description={`${form.watch('comment')?.length ?? 0} / 500`}
            {...register('comment')}
          />
          {!!others.length && (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              {t('incident.overlap', {
                list: others
                  .map((i) => `${formatDateTime(Date.parse(i.from))}–${i.to ? formatDateTime(Date.parse(i.to)) : '…'} (${i.lossReason?.name ?? (i.stateOverride ? t(`state.${i.stateOverride}`) : '—')})`)
                  .join('; '),
              })}
            </Alert>
          )}
          <Group justify="flex-end" mt="sm" grow={isMobile}>
            <Button variant="default" onClick={close}>
              {t('incident.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('incident.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
