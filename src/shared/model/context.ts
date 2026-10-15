import { persist } from 'zustand/middleware';
import { create } from 'zustand';

export const useAppContext = create<{ enterpriseId: string | null; setEnterpriseId: (id: string | null) => void }>((set) => ({
  enterpriseId: null,
  setEnterpriseId: (enterpriseId) => set({ enterpriseId }),
}));

export const useEnterpriseId = () => useAppContext((s) => s.enterpriseId);

/** Выбранное на портале предприятие; пусто — берём первое активное. */
export const useEnterpriseChoice = create<{ id: string | null; choose: (id: string | null) => void }>()(
  persist((set) => ({ id: null, choose: (id) => set({ id }) }), { name: 'fkit-bi:enterprise' }),
);

/** Переходы внутри администрирования (портал → «Настройка», чек-лист → машина). */
export const useAdminNav = create<{
  tab: string;
  machineId: string | null;
  machineTab: 'passport' | 'components' | 'signals' | 'states';
  setTab: (tab: string) => void;
  openMachine: (machineId: string, machineTab: 'passport' | 'components' | 'signals' | 'states') => void;
  clearMachine: () => void;
  /** Машина, настройку которой нужно продолжить в мастере «Подключить машину». */
  resumeId: string | null;
  resumeMachine: (machineId: string) => void;
  clearResume: () => void;
}>((set) => ({
  tab: 'setup',
  machineId: null,
  machineTab: 'passport',
  setTab: (tab) => set({ tab }),
  openMachine: (machineId, machineTab) => set({ tab: 'equipment', machineId, machineTab }),
  clearMachine: () => set({ machineId: null }),
  resumeId: null,
  resumeMachine: (resumeId) => set({ tab: 'wizard', resumeId }),
  clearResume: () => set({ resumeId: null }),
}));

/** Куда открыть страницу генерации (например, после быстрого запуска — на карточку запуска). */
export const useGeneratorNav = create<{ tab: 'scenarios' | 'runs'; focusRun: string | null; setTab: (t: 'scenarios' | 'runs') => void; showRun: (id: string) => void }>((set) => ({
  tab: 'scenarios',
  focusRun: null,
  setTab: (tab) => set({ tab }),
  showRun: (focusRun) => set({ tab: 'runs', focusRun }),
}));
