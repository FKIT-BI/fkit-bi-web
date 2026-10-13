import { create } from 'zustand';

export const useAppContext = create<{ enterpriseId: string | null; setEnterpriseId: (id: string | null) => void }>((set) => ({
  enterpriseId: null,
  setEnterpriseId: (enterpriseId) => set({ enterpriseId }),
}));

export const useEnterpriseId = () => useAppContext((s) => s.enterpriseId);
