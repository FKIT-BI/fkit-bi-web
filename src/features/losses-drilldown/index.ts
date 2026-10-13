import { create } from 'zustand';

export interface DrilldownFilter {
  reasonId?: string;
  from?: number;
  to?: number;
  label?: string;
}

export const useDrilldown = create<{
  filter: DrilldownFilter | null;
  set: (f: DrilldownFilter) => void;
  clear: () => void;
}>((set) => ({
  filter: null,
  set: (filter) => set({ filter }),
  clear: () => set({ filter: null }),
}));
