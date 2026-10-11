import { Badge, Box, Group, Text, Tooltip } from '@mantine/core';
import { STATE_META, type StateCode } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatDuration } from '@/shared/lib';

export function StateDot({ state, size = 8 }: { state: StateCode | undefined; size?: number }) {
  const { t } = useTranslation();
  const color = state ? STATE_META[state].color : 'var(--mantine-color-gray-6)';
  return (
    <Tooltip label={state ? t(`state.${state}`) : '—'} withinPortal>
      <Box
        component="span"
        aria-label={state ? t(`state.${state}`) : undefined}
        style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }}
      />
    </Tooltip>
  );
}

export function StateBadge({ state, sinceSec }: { state: StateCode; sinceSec?: number }) {
  const { t } = useTranslation();
  return (
    <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Badge
        size="lg"
        radius="sm"
        variant="filled"
        style={{ background: STATE_META[state].color, color: '#111', flexShrink: 0, overflow: 'visible' }}
        styles={{ label: { overflow: 'visible' } }}
      >
        {t(`state.${state}`)}
      </Badge>
      {sinceSec != null && (
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {t('machine.since', { duration: formatDuration(sinceSec) })}
        </Text>
      )}
    </Group>
  );
}
