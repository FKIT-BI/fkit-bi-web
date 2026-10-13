import { adminHandlers } from './admin';
import { analyticsHandlers } from './analytics';
import { authHandlers } from './auth';
import { configHandlers } from './config';
import { generatorHandlers } from './generator';
import { incidentHandlers } from './incidents';
import { operationsHandlers } from './operations';
import { setupHandlers } from './setup';

export const handlers = [...authHandlers, ...configHandlers, ...operationsHandlers, ...analyticsHandlers, ...incidentHandlers, ...setupHandlers, ...generatorHandlers, ...adminHandlers];
