import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type LossReason } from '@/shared/api';
import { UNKNOWN_REASON, UNKNOWN_REASON_COLOR } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';

export type { LossReason };

export function useReasons() {
  const { t } = useTranslation();
  const q = useQuery(api.reasons());
  return useMemo(() => {
    const list = q.data ?? [];
    const byId = new Map(list.map((r) => [r.id, r]));
    return {
      list,
      byId,
      isLoading: q.isLoading,
      nameOf: (id: string | null | undefined) =>
        !id || id === UNKNOWN_REASON ? t('reason.unknown') : (byId.get(id)?.name ?? id),
      colorOf: (id: string | null | undefined) =>
        !id || id === UNKNOWN_REASON ? UNKNOWN_REASON_COLOR : (byId.get(id)?.color ?? '#888'),
    };
  }, [q.data, q.isLoading, t]);
}

export type ReasonsDict = ReturnType<typeof useReasons>;

export const UNKNOWN_DECAL = {
  symbol: 'rect',
  dashArrayX: [1, 0],
  dashArrayY: [3, 3],
  rotation: -Math.PI / 4,
  color: 'rgba(0,0,0,0.35)',
};
