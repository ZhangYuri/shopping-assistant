/**
 * Agent-related type definitions
 */

import { BaseEntity, ErrorInfo, RetryPolicy } from './common.types';

export type AgentType = 'inventory' | 'procurement' | 'finance' | 'notification';

export type AgentStatus = 'idle' | 'processing' | 'waiting' | 'error' | 'stopped';

export type MessageType = 'request' | 'response' | 'notification' | 'error';

export interface AgentConfig {
    agentId: string;
    agentType: AgentType;
    name: string;
    description: string;
    capabilities: string[];
    retryPolicy: RetryPolicy;
    maxConcurrentTasks: number;
    timeoutMs: number;
}

export interface AgentState extends BaseEntity {
    agentId: string;
    status: AgentStatus;
    currentTask?: Task;
    context: Record<string, any>;
    lastActivity: Date;
    errorCount: number;
    metadata: Record<string, any>;
}

export interface Task extends BaseEntity {
    taskId: string;
    agentId: string;
    taskType: string;
    priority: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    input: any;
    output?: any;
    completedAt?: Date;
    retryCount: number;
    maxRetries: number;
    error?: ErrorInfo;
}

export interface AgentMessage extends BaseEntity {
    messageId: string;
    fromAgent: string;
    toAgent: string;
    messageType: MessageType;
    payload: any;
    timestamp: Date;
    correlationId?: string;
    replyTo?: string;
}

export interface AgentCapability {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
}

export interface AgentMetrics {
    agentId: string;
    tasksCompleted: number;
    tasksFailedCount: number;
    averageProcessingTime: number;
    lastActiveTime: Date;
    errorRate: number;
}

// Base agent interface that all agents must implement
export interface IAgent {
    readonly config: AgentConfig;
    readonly state: AgentState;

    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    processTask(task: Task): Promise<any>;
    handleMessage(message: AgentMessage): Promise<AgentMessage | null>;
    getCapabilities(): AgentCapability[];
    getMetrics(): AgentMetrics;
    updateState(updates: Partial<AgentState>): Promise<void>;
}
