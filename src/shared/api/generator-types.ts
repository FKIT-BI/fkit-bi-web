import type { components } from './generated/generator';

type G = components['schemas'];

export type ScenarioSummary = G['ScenarioSummary'];
export type ScenarioDetail = G['ScenarioDetail'];
export type ScenarioCreate = G['ScenarioCreate'];
export type ScenarioUpdate = G['ScenarioUpdate'];
export type ScenarioValidationResult = G['ScenarioValidationResult'];
export type GenValidationIssue = G['ValidationIssue'];
export type MachineTargetInput = G['MachineTargetInput'];
export type BaseSignalBehavior = G['BaseSignalBehavior'];
export type ScenarioPhaseInput = G['ScenarioPhaseInput'];
export type BehaviorOverride = G['BehaviorOverride'];
export type BehaviorConfiguration = G['BehaviorConfiguration'];
export type CycleMode = G['CycleMode'];
export type ExpectedMachineState = G['ExpectedMachineState'];
export type SourceQuality = G['SourceQuality'];
export type RunCreate = G['RunCreate'];
export type RunMode = G['RunMode'];
export type RunStatus = G['RunStatus'];
export type RunValidationResult = G['RunValidationResult'];
export type GenerationRunSummary = G['GenerationRunSummary'];
export type GenerationRunDetail = G['GenerationRunDetail'];
export type RunProgress = G['RunProgress'];
export type RunPage = G['RunPage'];
export type GeneratorStatus = G['ConfigurationStatus'];
export type BehaviorModel = BehaviorConfiguration['model'];
