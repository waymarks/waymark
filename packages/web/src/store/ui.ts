import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';
export type Density = 'compact' | 'comfy' | 'spacious';
export type Grouping = 'session' | 'flat';
export type Accent = 'teal' | 'blue' | 'green' | 'amber' | 'violet';

export type ActionsFilter = 'all' | 'pending' | 'blocked' | 'errors' | 'writes' | 'bash';

interface UIState {
  theme: Theme;
  density: Density;
  grouping: Grouping;
  accent: Accent;

  filter: ActionsFilter;
  search: string;
  selectedActionId: string | null;

  // Phase 4: reviewer identity — used to submit approvals/escalations on the user's behalf.
  reviewerId: string;

  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setGrouping: (g: Grouping) => void;
  setAccent: (a: Accent) => void;

  setFilter: (f: ActionsFilter) => void;
  setSearch: (s: string) => void;
  setSelectedActionId: (id: string | null) => void;
  setReviewerId: (id: string) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      density: 'comfy',
      grouping: 'session',
      accent: 'teal',

      filter: 'all',
      search: '',
      selectedActionId: null,

      reviewerId: 'ui-reviewer',

      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setGrouping: (grouping) => set({ grouping }),
      setAccent: (accent) => set({ accent }),

      setFilter: (filter) => set({ filter }),
      setSearch: (search) => set({ search }),
      setSelectedActionId: (selectedActionId) => set({ selectedActionId }),
      setReviewerId: (reviewerId) => set({ reviewerId: reviewerId.trim() || 'ui-reviewer' }),
    }),
    {
      name: 'waymark:ui',
      partialize: (s) => ({
        theme: s.theme,
        density: s.density,
        grouping: s.grouping,
        accent: s.accent,
        reviewerId: s.reviewerId,
      }),
    },
  ),
);

export const ACCENT_SWATCHES: Record<Accent, { c: string; ring: string }> = {
  teal:   { c: 'oklch(0.72 0.09 195)', ring: 'oklch(0.72 0.09 195 / 0.28)' },
  blue:   { c: 'oklch(0.72 0.1 240)',  ring: 'oklch(0.72 0.1 240 / 0.28)'  },
  green:  { c: 'oklch(0.76 0.14 155)', ring: 'oklch(0.76 0.14 155 / 0.28)' },
  amber:  { c: 'oklch(0.82 0.13 75)',  ring: 'oklch(0.82 0.13 75 / 0.28)'  },
  violet: { c: 'oklch(0.72 0.14 300)', ring: 'oklch(0.72 0.14 300 / 0.28)' },
};
