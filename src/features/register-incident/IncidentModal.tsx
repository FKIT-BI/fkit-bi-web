import { Alert, Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { DateTimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useEnterpriseTree } from '@/entities/enterprise';
import { useReasons } from '@/entities/loss-reason';
import { api, qk } from '@/shared/api';
import { useTranslation } from '@/shared/i18n';
import { formatDateTime, parseLocal, toIso, toLocalString, MINUTE } from '@/shared/lib';
import { USER_BY_ROLE, useUiStore } from '@/shared/model';
import { useIncidentModal } from './model';
import { incidentFormSchema, type IncidentForm } from './schema';

export function IncidentModal() {
  const { t } = useTranslation();
  const { opened, draft, close } = useIncidentModal();
  const role = useUiStore((s) => s.role);
  const tree = useEnterpriseTree();
  const reasons = useReasons();
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');

  const form = useForm<IncidentForm>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: { machineId: '', from: '', to: null, ongoing: false, reasonId: '', comment: '' },
  });
  const { control, handleSubmit, reset, register, formState } = form;

  useEffect(() => {
    if (!opened) return;
    const now = Date.now();
    reset({
      machineId: draft.machineId ?? '',
      from: toLocalString(draft.from ?? now - 30 * MINUTE),
      to: draft.to === null ? null : toLocalString(draft.to ?? now),
      ongoing: draft.to === null,
      reasonId: draft.reasonId ?? '',
      comment: '',
    });
  }, [opened, draft, reset]);

  const [machineId, from, to, ongoing] = useWatch({ control, name: ['machineId', 'from', 'to', 'ongoing'] });
  const fromMs = from ? parseLocal(from) : undefined;
  const toMs = ongoing ? Date.now() : to ? parseLocal(to) : undefined;

  const overlaps = useQuery({
    ...api.incidents({ machineId, from: fromMs, to: toMs }),
    enabled: opened && !!machineId && fromMs != null && toMs != null && toMs > fromMs,
  });

  const save = useMutation({
    mutationFn: (v: IncidentForm) =>
      api.createIncident({
        machineId: v.machineId,
        from: toIso(parseLocal(v.from)),
        to: v.ongoing || !v.to ? null : toIso(parseLocal(v.to)),
        reasonId: v.reasonId,
        comment: v.comment,
        author: USER_BY_ROLE[role],
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.analytics }),
        qc.invalidateQueries({ queryKey: qk.intervals }),
        qc.invalidateQueries({ queryKey: qk.incidents }),
      ]);
      notifications.show({ color: 'green', message: t('incident.saved') });
      close();
    },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof Error ? e.message : String(e) }),
  });

  const err = (name: keyof IncidentForm) => {
    const m = formState.errors[name]?.message;
    return m ? t(m) : undefined;
  };

  const machineOptions = tree.lines.map((l) => ({
    group: l.name,
    items: l.machines.map((m) => ({ value: m.id, label: m.name })),
  }));
  const groups = [...new Set(reasons.list.map((r) => r.group))];
  const reasonOptions = groups.map((g) => ({
    group: g,
    items: reasons.list.filter((r) => r.group === g).map((r) => ({ value: r.id, label: r.name })),
  }));

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
          <Controller
            control={control}
            name="reasonId"
            render={({ field }) => (
              <Select label={t('incident.reason')} data={reasonOptions} searchable required error={err('reasonId')} {...field} />
            )}
          />
          <Textarea
            label={t('incident.comment')}
            autosize
            minRows={2}
            maxLength={500}
            description={`${form.watch('comment')?.length ?? 0} / 500`}
            {...register('comment')}
          />
          {!!overlaps.data?.length && (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              {t('incident.overlap', {
                list: overlaps.data
                  .map((i) => `${formatDateTime(i.from)}–${i.to ? formatDateTime(i.to) : '…'} (${reasons.nameOf(i.reasonId)})`)
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
