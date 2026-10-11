import { analyticsHandlers } from './analytics';
import { enterpriseHandlers } from './enterprises';
import { incidentHandlers } from './incidents';
import { machineHandlers } from './machines';
import { telemetryHandlers } from './telemetry';

export const handlers = [
  ...enterpriseHandlers,
  ...machineHandlers,
  ...incidentHandlers,
  ...analyticsHandlers,
  ...telemetryHandlers,
];
