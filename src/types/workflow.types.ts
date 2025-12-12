/**
 * LangGraph workflow and orchestration type definitions
 */

import { BaseEntity, ErrorInfo } from './common.types';
import { AgentState, AgentMessage } from './agent.types';

export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

export type WorkflowStepType =
    | 'agent_task'
    | 'decision'
    | 'parallel'
    | 'sequential'
    | 'conditional';

export interface WorkflowDefinition extends BaseEntity {
    workflowId: string;
    name: string;
    description: string;
    version: string;
    steps: WorkflowStep[];
    triggers: WorkflowTrigger[];
    metadata: Record<string, any>;
}

export interface WorkflowStep {
    stepId: string;
    stepType: WorkflowStepType;
    name: string;
    description: string;
    agentId?: string;
    taskType?: string;
    condition?: string;
    nextSteps: string[];
    errorHandling: ErrorHandlingConfig;
    timeout?: number;
    retryPolicy?: {
        maxRetries: number;
        backoffMs: number;
    };
}

export interface WorkflowTrigger {
    triggerId: string;
    triggerType: 'manual' | 'scheduled' | 'event' | 'message';
    condition: string;
    parameters: Record<string, any>;
}

export interface WorkflowState extends BaseEntity {
    workflowId: string;
    executionId: string;
    currentStep: string;
    stepHistory: WorkflowStepExecution[];
    globalContext: Record<string, any>;
    agentStates: Map<string, AgentState>;
    status: WorkflowStatus;
    startedAt: Date;
    completedAt?: Date;
    error?: ErrorInfo;
}

export interface WorkflowStepExecution {
    stepId: string;
    executionId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt: Date;
    completedAt?: Date;
    input: any;
    output?: any;
    error?: ErrorInfo;
    retryCount: number;
}

export interface WorkflowResult {
    executionId: string;
    workflowId: string;
    status: WorkflowStatus;
    result?: any;
    error?: ErrorInfo;
    duration: number;
    stepsExecuted: number;
    metadata: Record<string, any>;
}

export interface ErrorHandlingConfig {
    strategy: 'fail_fast' | 'continue' | 'retry' | 'fallback';
    maxRetries?: number;
    fallbackStep?: string;
    notifyOnError?: boolean;
}

export interface WorkflowContext {
    executionId: string;
    workflowId: string;
    currentStep: string;
    globalData: Record<string, any>;
    stepData: Record<string, any>;
    agentMessages: AgentMessage[];
    startTime: Date;
}

// Workflow engine interface
export interface IWorkflowEngine {
    executeWorkflow(workflowId: string, input: any): Promise<WorkflowResult>;
    createWorkflow(definition: WorkflowDefinition): Promise<string>;
    getWorkflowStatus(executionId: string): Promise<WorkflowState>;
    pauseWorkflow(executionId: string): Promise<boolean>;
    resumeWorkflow(executionId: string): Promise<boolean>;
    cancelWorkflow(executionId: string): Promise<boolean>;
    getWorkflowHistory(workflowId: string): Promise<WorkflowState[]>;
}
