/**
 * Base abstract class for all agents in the shopping assistant system
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
    IAgent,
    AgentConfig,
    AgentState,
    AgentMessage,
    Task,
    AgentCapability,
    AgentMetrics,
    MessageType,
} from '@/types/agent.types';
import { ErrorInfo } from '@/types/common.types';
import { Logger } from '@/utils/Logger';

export abstract class BaseAgent extends EventEmitter implements IAgent {
    protected logger: Logger;
    protected _state: AgentState;
    protected _metrics: AgentMetrics;
    protected isInitialized = false;
    protected isRunning = false;

    constructor(public readonly config: AgentConfig) {
        super();
        this.logger = new Logger({
            component: `Agent:${config.name}`,
            level: 'info',
        });

        this._state = {
            id: uuidv4(),
            agentId: config.agentId,
            status: 'idle',
            context: {},
            lastActivity: new Date(),
            errorCount: 0,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this._metrics = {
            agentId: config.agentId,
            tasksCompleted: 0,
            tasksFailedCount: 0,
            averageProcessingTime: 0,
            lastActiveTime: new Date(),
            errorRate: 0,
        };
    }

    get state(): AgentState {
        return { ...this._state };
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            this.logger.info('Initializing agent', { agentId: this.config.agentId });

            await this.onInitialize();

            this.isInitialized = true;
            await this.updateState({ status: 'idle' });

            this.logger.info('Agent initialized successfully', { agentId: this.config.agentId });
            this.emit('initialized', this.config.agentId);
        } catch (error) {
            this.logger.error('Failed to initialize agent', {
                agentId: this.config.agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            await this.updateState({ status: 'error' });
            throw error;
        }
    }

    async start(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isRunning) {
            return;
        }

        try {
            this.logger.info('Starting agent', { agentId: this.config.agentId });

            await this.onStart();

            this.isRunning = true;
            await this.updateState({ status: 'idle' });

            this.logger.info('Agent started successfully', { agentId: this.config.agentId });
            this.emit('started', this.config.agentId);
        } catch (error) {
            this.logger.error('Failed to start agent', {
                agentId: this.config.agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            await this.updateState({ status: 'error' });
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            this.logger.info('Stopping agent', { agentId: this.config.agentId });

            await this.onStop();

            this.isRunning = false;
            await this.updateState({ status: 'stopped' });

            this.logger.info('Agent stopped successfully', { agentId: this.config.agentId });
            this.emit('stopped', this.config.agentId);
        } catch (error) {
            this.logger.error('Failed to stop agent', {
                agentId: this.config.agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async processTask(task: Task): Promise<any> {
        if (!this.isRunning) {
            throw new Error(`Agent ${this.config.agentId} is not running`);
        }

        const startTime = Date.now();

        try {
            this.logger.info('Processing task', {
                agentId: this.config.agentId,
                taskId: task.taskId,
                taskType: task.taskType,
            });

            await this.updateState({
                status: 'processing',
                currentTask: task,
                lastActivity: new Date(),
            });

            const result = await this.onProcessTask(task);

            const duration = Date.now() - startTime;
            this.updateMetrics(true, duration);

            await this.updateState({
                status: 'idle',
                currentTask: undefined,
                lastActivity: new Date(),
            });

            this.logger.info('Task completed successfully', {
                agentId: this.config.agentId,
                taskId: task.taskId,
                duration,
            });

            this.emit('taskCompleted', { task, result, duration });
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.updateMetrics(false, duration);

            await this.updateState({
                status: 'error',
                currentTask: undefined,
                errorCount: this._state.errorCount + 1,
                lastActivity: new Date(),
            });

            const errorInfo: ErrorInfo = {
                code: 'TASK_PROCESSING_ERROR',
                message: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                details: { taskId: task.taskId, taskType: task.taskType },
            };

            this.logger.error('Task processing failed', {
                agentId: this.config.agentId,
                taskId: task.taskId,
                error: errorInfo.message,
                duration,
            });

            this.emit('taskFailed', { task, error: errorInfo, duration });
            throw error;
        }
    }

    async handleMessage(message: AgentMessage): Promise<AgentMessage | null> {
        try {
            this.logger.debug('Handling message', {
                agentId: this.config.agentId,
                messageId: message.messageId,
                messageType: message.messageType,
                fromAgent: message.fromAgent,
            });

            await this.updateState({ lastActivity: new Date() });

            const response = await this.onHandleMessage(message);

            if (response) {
                this.logger.debug('Message handled with response', {
                    agentId: this.config.agentId,
                    messageId: message.messageId,
                    responseId: response.messageId,
                });
            }

            return response;
        } catch (error) {
            this.logger.error('Message handling failed', {
                agentId: this.config.agentId,
                messageId: message.messageId,
                error: error instanceof Error ? error.message : String(error),
            });

            // Return error message
            return this.createErrorMessage(
                message,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    async updateState(updates: Partial<AgentState>): Promise<void> {
        this._state = {
            ...this._state,
            ...updates,
            updatedAt: new Date(),
        };

        this.emit('stateUpdated', this._state);
    }

    getCapabilities(): AgentCapability[] {
        return this.onGetCapabilities();
    }

    getMetrics(): AgentMetrics {
        return { ...this._metrics };
    }

    // Protected helper methods
    protected createMessage(
        toAgent: string,
        messageType: MessageType,
        payload: any,
        correlationId?: string
    ): AgentMessage {
        return {
            id: uuidv4(),
            messageId: uuidv4(),
            fromAgent: this.config.agentId,
            toAgent,
            messageType,
            payload,
            timestamp: new Date(),
            correlationId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    protected createErrorMessage(
        originalMessage: AgentMessage,
        errorMessage: string
    ): AgentMessage {
        return this.createMessage(
            originalMessage.fromAgent,
            'error',
            {
                originalMessageId: originalMessage.messageId,
                error: errorMessage,
            },
            originalMessage.correlationId
        );
    }

    private updateMetrics(success: boolean, duration: number): void {
        if (success) {
            this._metrics.tasksCompleted++;
        } else {
            this._metrics.tasksFailedCount++;
        }

        const totalTasks = this._metrics.tasksCompleted + this._metrics.tasksFailedCount;
        this._metrics.errorRate = this._metrics.tasksFailedCount / totalTasks;

        // Update average processing time
        const currentAvg = this._metrics.averageProcessingTime;
        const completedTasks = this._metrics.tasksCompleted;
        this._metrics.averageProcessingTime =
            (currentAvg * (completedTasks - 1) + duration) / completedTasks;

        this._metrics.lastActiveTime = new Date();
    }

    // Abstract methods that must be implemented by concrete agents
    protected abstract onInitialize(): Promise<void>;
    protected abstract onStart(): Promise<void>;
    protected abstract onStop(): Promise<void>;
    protected abstract onProcessTask(task: Task): Promise<any>;
    protected abstract onHandleMessage(message: AgentMessage): Promise<AgentMessage | null>;
    protected abstract onGetCapabilities(): AgentCapability[];
}
