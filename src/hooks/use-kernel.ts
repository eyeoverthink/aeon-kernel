import { create } from 'zustand';
import { executeKernelRun, appendToLedger, getLocalLedger, type KernelRun } from '@/lib/kernel';

type KernelState = {
  activeRun: KernelRun | null;
  isRunning: boolean;
  history: KernelRun[];
  execute: (source: string) => Promise<void>;
  resetRun: () => void;
  loadHistory: () => void;
};

export const useKernelStore = create<KernelState>((set) => ({
  activeRun: null,
  isRunning: false,
  history: [],
  execute: async (source: string) => {
    set({ isRunning: true });
    const run = executeKernelRun(source);
    appendToLedger(run);
    
    set((state) => ({ 
      activeRun: run, 
      isRunning: false,
      history: [run, ...state.history].slice(0, 50)
    }));
  },
  resetRun: () => set({ activeRun: null }),
  loadHistory: () => set({ history: getLocalLedger() })
}));
