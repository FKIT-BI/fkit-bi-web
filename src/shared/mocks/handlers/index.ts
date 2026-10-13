import { analyticsHandlers } from './analytics';
import { authHandlers } from './auth';
import { configHandlers } from './config';
import { incidentHandlers } from './incidents';
import { operationsHandlers } from './operations';

export const handlers = [...authHandlers, ...configHandlers, ...operationsHandlers, ...analyticsHandlers, ...incidentHandlers];
