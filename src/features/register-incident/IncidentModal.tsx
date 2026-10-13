import { Alert, Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Textarea } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useEnterpriseTree } from '@/entities/enterprise';
import { useReasons } from '@/entities/loss-reason';
import { api, ApiError, formatApiError, qk, type ManualIncidentCreate } from '@/shared/api';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, formatDateTimeSec, MINUTE, parseLocal, toIso, toLocalString } from '@/shared/lib';
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

  // Resolved through a ref: the schema depends on the selected machine's coverage, which is read after useForm.
  const schemaRef = useRef(incidentFormSchema());
  const form = useForm<IncidentForm>({
    resolver: (values, context, options) => zodResolver(schemaRef.current)(values, context, options),
    defaultValues: { machineId: '', from: '', to: null, ongoing: false, reasonId: '', stateOverride: '', comment: '' },
  });
  const { control, handleSubmit, reset, register, formState, setError, setValue } = form;

  const [machineId, from, to, ongoing] = useWatch({ control, name: ['machineId', 'from', 'to', 'ongoing'] });
  const machine = useQuery({ ...api.machine(machineId), enabled: opened && !!machineId });
  const coverageFrom = machine.data?.coverageFrom ? Date.parse(machine.data.coverageFrom) : null;

  // The picker works in minutes; keep the exact instant the form was opened with while the field is unchanged
  // (an interval starting at coverageFrom 23:09:05.335 must not be sent as 23:09:05).
  const exactMs = useCallback(
    (field: 'from' | 'to', value: string) => {
      const original = field === 'from' ? draft.from : draft.to;
      return original != null && value === toLocalString(original) ? original : parseLocal(value);
    },
    [draft.from, draft.to],
  );
  const schema = useMemo(() => incidentFormSchema({ coverageFrom, exactMs }), [coverageFrom, exactMs]);
  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

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

  // Without a draft start the default is "30 minutes ago"; never default earlier than the machine's first data.
  useEffect(() => {
    if (!opened || draft.from != null || coverageFrom == null || !from) return;
    if (parseLocal(from) < coverageFrom) setValue('from', toLocalString(Math.ceil(coverageFrom / 1000) * 1000));
  }, [opened, draft.from, coverageFrom, from, setValue]);

  const fromMs = from ? exactMs('from', from) : undefined;
  // "Now" for an ongoing incident is fixed to the next minute so the overlap query key stays stable
  // (a per-render Date.now() refetched ~45 times per second, HAR 2026-10-13).
  const nowMinute = Math.ceil(Date.now() / MINUTE) * MINUTE;
  const toMs = ongoing ? nowMinute : to ? exactMs('to', to) : undefined;

  const overlaps = useQuery({
    ...api.machineIncidents(machineId, { from: fromMs ?? 0, to: toMs ?? 0 }),
    enabled: opened && !!machineId && fromMs != null && toMs != null && toMs > fromMs,
  });

  const save = useMutation({
    mutationFn: (v: IncidentForm) => {
      const body: ManualIncidentCreate = {
        from: toIso(exactMs('from', v.from)),
        to: v.ongoing || !v.to ? null : toIso(exactMs('to', v.to)),
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
        const serverCoverage = typeof e.body?.details?.coverageFrom === 'string' ? Date.parse(e.body.details.coverageFrom) : null;
        for (const fe of e.fieldErrors) {
          const field = FIELD_MAP[fe.path];
          if (!field) continue;
          // The server cannot know the user's timezone; show the exact allowed start locally.
          const message = fe.code === 'BEFORE_COVERAGE' && serverCoverage != null ? t('incident.errBeforeCoverage', { at: formatDateTimeSec(serverCoverage) }) : fe.message;
          setError(field, { message });
        }
      }
      notifications.show({ color: 'red', message: formatApiError(e) });
    },
  });

  const coverageAt = coverageFrom != null ? formatDateTimeSec(coverageFrom) : '';
  const err = (name: keyof IncidentForm) => {
    const m = formState.errors[name]?.message;
    return m ? t(m, { at: coverageAt }) : undefined;
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
                  description={coverageAt ? t('incident.coverageHint', { at: coverageAt }) : undefined}
                  minDate={coverageFrom != null ? toLocalString(coverageFrom) : undefined}
                  maxDate={toLocalString(nowMinute)}
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
