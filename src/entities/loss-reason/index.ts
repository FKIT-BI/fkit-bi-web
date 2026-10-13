import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type LossReason, type LossReasonDuration, type LossReasonSummary } from '@/shared/api';
import { CATEGORY_COLORS, OTHER_REASON, OTHER_REASON_COLOR, UNKNOWN_REASON, UNKNOWN_REASON_COLOR } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { useEnterpriseId } from '@/shared/model';

export type { LossReason };

export const reasonKeyOf = (row: Pick<LossReasonDuration, 'kind' | 'reasonId'>) =>
  row.kind === 'REASON' && row.reasonId ? row.reasonId : row.kind === 'OTHER' ? OTHER_REASON : UNKNOWN_REASON;

export const colorOfReason = (r: Pick<LossReasonSummary, 'color' | 'category'> | undefined | null) =>
  r?.color ?? CATEGORY_COLORS[r?.category ?? 'OTHER'] ?? OTHER_REASON_COLOR;

export function useReasons() {
  const { t } = useTranslation();
  const enterpriseId = useEnterpriseId();
  const q = useQuery({ ...api.lossReasons(enterpriseId ?? ''), enabled: !!enterpriseId });
  return useMemo(() => {
    const list = q.data?.items ?? [];
    const byId = new Map(list.map((r) => [r.id, r]));
    return {
      list,
      byId,
      isLoading: q.isLoading,
      nameOf: (key: string | null | undefined) =>
        !key || key === UNKNOWN_REASON ? t('reason.unknown') : key === OTHER_REASON ? t('reason.other') : (byId.get(key)?.name ?? key),
      colorOf: (key: string | null | undefined) =>
        !key || key === UNKNOWN_REASON ? UNKNOWN_REASON_COLOR : key === OTHER_REASON ? OTHER_REASON_COLOR : colorOfReason(byId.get(key)),
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
