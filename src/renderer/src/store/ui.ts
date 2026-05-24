import { create } from 'zustand';

export type TextSize = 'compact' | 'default' | 'comfortable';

interface UIState {
  activeFilePath: string | null;
  setActiveFile: (p: string | null) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
}

export const useUI = create<UIState>((set) => ({
  activeFilePath: null,
  setActiveFile: (p) => set({ activeFilePath: p }),
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
  textSize: 'compact',
  setTextSize: (textSize) => set({ textSize }),
}));

