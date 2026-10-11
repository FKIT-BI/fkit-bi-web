import { Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { LEVEL_COLOR, type Level } from '../config/thresholds';

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  level?: Level | null;
  delta?: {
    text: string;
    dir: 'up' | 'down' | 'flat';
    good: boolean | null;
    hint?: string;
  } | null;
  footer?: ReactNode;
}

export function KpiTile({ label, value, level, delta, footer }: KpiTileProps) {
  const deltaColor = delta?.good == null ? 'dimmed' : delta.good ? 'green.5' : 'red.5';
  const Arrow = delta?.dir === 'up' ? IconArrowUpRight : delta?.dir === 'down' ? IconArrowDownRight : IconMinus;
  return (
    <Paper p="sm" radius="sm" style={{ background: 'var(--tile-bg)', border: '1px solid var(--panel-border)', minWidth: 0 }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lh={1.2}>
        {label}
      </Text>
      <Text fz="clamp(1.375rem, 1rem + 1vw, 1.75rem)" fw={700} lh={1.25} mt={4} style={{ color: level ? LEVEL_COLOR[level] : undefined, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      {delta && (
        <Tooltip label={delta.hint} disabled={!delta.hint}>
          <Group gap={2} mt={2} c={deltaColor} wrap="nowrap">
            <Arrow size={14} aria-hidden />
            <Text size="xs" c={deltaColor} style={{ whiteSpace: 'nowrap' }}>
              {delta.text}
            </Text>
          </Group>
        </Tooltip>
      )}
      {footer}
    </Paper>
  );
}
