import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';
import type { DashboardSearch } from '../config/search';

export function useDashboardSearch() {
  const search = useSearch({ strict: false }) as DashboardSearch;
  const navigate = useNavigate();
  const update = useCallback(
    (patch: Partial<DashboardSearch>) =>
      navigate({ to: '.', search: ((prev: DashboardSearch) => ({ ...prev, ...patch })) as never }),
    [navigate],
  );
  return [search, update] as const;
}
