export interface Profile {
  run: { median: number; sigma: number };
  idle: { median: number; sigma: number };
  down: { median: number; sigma: number };
  pIdle: number;
  nightIdleFactor: number;
  setupRate: number;
  offlineRate: number;
  perf: number;
  reasonWeights: { DOWN: Record<string, number>; IDLE: Record<string, number> };
}

export type ProfileId = 'stable' | 'average' | 'problem';

const reasons = {
  DOWN: { 'r-mech': 3, 'r-elec': 2, 'r-jam': 4 },
  IDLE: { 'r-material': 3, 'r-operator': 2, 'r-quality': 2, 'r-cleaning': 1 },
};

export const PROFILES: Record<ProfileId, Profile> = {
  stable: {
    run: { median: 80, sigma: 0.45 },
    idle: { median: 6, sigma: 0.5 },
    down: { median: 12, sigma: 0.6 },
    pIdle: 0.6,
    nightIdleFactor: 1.3,
    setupRate: 0.5,
    offlineRate: 0.03,
    perf: 0.93,
    reasonWeights: reasons,
  },
  average: {
    run: { median: 55, sigma: 0.5 },
    idle: { median: 8, sigma: 0.5 },
    down: { median: 22, sigma: 0.6 },
    pIdle: 0.5,
    nightIdleFactor: 1.4,
    setupRate: 0.6,
    offlineRate: 0.05,
    perf: 0.86,
    reasonWeights: reasons,
  },
  problem: {
    run: { median: 38, sigma: 0.5 },
    idle: { median: 10, sigma: 0.5 },
    down: { median: 46, sigma: 0.55 },
    pIdle: 0.35,
    nightIdleFactor: 1.6,
    setupRate: 0.7,
    offlineRate: 0.08,
    perf: 0.78,
    reasonWeights: reasons,
  },
};

export const DURATION_LIMITS = {
  RUN: [20, 120],
  IDLE: [2, 15],
  DOWN: [5, 90],
} as const;
