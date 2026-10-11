import { create } from 'zustand';

export interface IncidentDraft {
  machineId?: string;
  from?: number;
  to?: number | null;
  reasonId?: string;
}

export const useIncidentModal = create<{
  opened: boolean;
  draft: IncidentDraft;
  open: (draft?: IncidentDraft) => void;
  close: () => void;
}>((set) => ({
  opened: false,
  draft: {},
  open: (draft = {}) => set({ opened: true, draft }),
  close: () => set({ opened: false }),
}));
