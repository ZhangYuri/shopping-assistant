/**
 * Agent State Manager - Wrapper class for LangChain's built-in state management
 * Integrates MemorySaver for conversation state and InMemoryStore for general caching
 */

import { MemorySaver } from '@langchain/langgraph';
import { InMemoryStore } from '@langchain/core/stores';
import { Logger } from '../utils/Logger';
import { AgentState, AgentMessage } from '../types/agent.types';
import { WorkflowState, WorkflowContext } from '../types/workflow.types';

export interface ConversationState {
    conversationId: string;
    userId: string;
    currentIntent: string;
    entities: Record<string, any>;
    history: ConversationTurn[];
    lastActivity: Date;
    agentContext: Record<string, any>;
}

export interface ConversationTurn {
    turnId: string;
    userInput: string;
    agentResponse: string;
    intent: string;
    entities: Record<string, any>;
    timestamp: Date;
    agentId: string;
}

export interface CacheEntry<T = any> {
    key: string;
    value: T;
    ttl?: number;
    createdAt: Date;
    expiresAt?: Date;
    metadata?: Record<string, any>;
}

export interface StateManagerConfig {
    enableConversationPersistence: boolean;
    enableGeneralCaching: boolean;
    defaultCacheTTL: number; // in milliseconds
    maxConversationHistory: number;
    cleanupInterval: number; // in milliseconds
}

/**
 * AgentStateManager provides a unified interface for state management
 * using LangChain's built-in MemorySaver and InMemoryStore
 */
export class AgentStateManager {
    private memorySaver: MemorySaver;
    private cacheStore: InMemoryStore;
    private logger: Logger;
    private config: StateManagerConfig;
    private cleanupTimer?: NodeJS.Timeout;

    constructor(config: Partial<StateManagerConfig> = {}) {
        this.config = {
            enableConversationPersistence: true,
            enableGeneralCaching: true,
            defaultCacheTTL: 3600000, // 1 hour
            maxConversationHistory: 100,
            cleanupInterval: 300000, // 5 minutes
            ...config,
        };

        this.logger = new Logger({
            component: 'AgentStateManager',
            level: 'info',
        });

        // Initialize LangChain built-in components
        this.memorySaver = new MemorySaver();
        this.cacheStore = new InMemoryStore();

        this.logger.info('AgentStateManager initialized', {
            conversationPersistence: this.config.enableConversationPersistence,
            generalCaching: this.config.enableGeneralCaching,
            defaultTTL: this.config.defaultCacheTTL,
        });

        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Conversation State Management using MemorySaver
     */

    async saveConversationState(
        conversationId: string,
        state: ConversationState
    ): Promise<void> {
        if (!this.config.enableConversationPersistence) {
            return;
        }

        try {
            // Limit conversation history to prevent memory bloat
            if (state.history.length > this.config.maxConversationHistory) {
                state.history = state.history.slice(-this.config.maxConversationHistory);
            }

            // Store conversation state using MemorySaver
            const config = { configurable: { thread_id: conversationId } };
            const checkpoint = { data: state };
            const metadata = { timestamp: new Date().toISOString() };
            await this.memorySaver.put(config, checkpoint as any, metadata as any);

            this.logger.debug('Conversation state saved', {
                conversationId,
                historyLength: state.history.length,
                lastActivity: state.lastActivity,
            });
        } catch (error) {
            this.logger.error('Failed to save conversation state', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async loadConversationState(conversationId: string): Promise<ConversationState | null> {
        if (!this.config.enableConversationPersistence) {
            return null;
        }

        try {
            const config = { configurable: { thread_id: conversationId } };
            const checkpoint = await this.memorySaver.get(config);

            if (checkpoint && (checkpoint as any).data) {
                const state = (checkpoint as any).data as ConversationState;
                this.logger.debug('Conversation state loaded', {
                    conversationId,
                    historyLength: state.history?.length || 0,
                });
                return state;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to load conversation state', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    async deleteConversationState(conversationId: string): Promise<void> {
        if (!this.config.enableConversationPersistence) {
            return;
        }

        try {
            const config = { configurable: { thread_id: conversationId } };
            const checkpoint = { data: null };
            const metadata = { timestamp: new Date().toISOString() };
            await this.memorySaver.put(config, checkpoint as any, metadata as any);

            this.logger.debug('Conversation state deleted', { conversationId });
        } catch (error) {
            this.logger.error('Failed to delete conversation state', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * General Caching using InMemoryStore
     */

    async cacheAnalysisResult<T>(
        key: string,
        result: T,
        ttl?: number
    ): Promise<void> {
        if (!this.config.enableGeneralCaching) {
            return;
        }

        try {
            const cacheTTL = ttl || this.config.defaultCacheTTL;
            const entry: CacheEntry<T> = {
                key,
                value: result,
                ttl: cacheTTL,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + cacheTTL),
                metadata: {
                    type: 'analysis_result',
                },
            };

            await this.cacheStore.mset([[key, entry]]);

            this.logger.debug('Analysis result cached', {
                key,
                ttl: cacheTTL,
                expiresAt: entry.expiresAt,
            });
        } catch (error) {
            this.logger.error('Failed to cache analysis result', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getCachedResult<T>(key: string): Promise<T | null> {
        if (!this.config.enableGeneralCaching) {
            return null;
        }

        try {
            const entries = await this.cacheStore.mget([key]);
            const entry = entries[0] as CacheEntry<T> | null;

            if (!entry) {
                return null;
            }

            // Check if entry has expired
            if (entry.expiresAt && entry.expiresAt < new Date()) {
                await this.cacheStore.mdelete([key]);
                this.logger.debug('Expired cache entry removed', { key });
                return null;
            }

            this.logger.debug('Cache hit', {
                key,
                createdAt: entry.createdAt,
                expiresAt: entry.expiresAt,
            });

            return entry.value;
        } catch (error) {
            this.logger.error('Failed to get cached result', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    async invalidateCache(keyPattern: string): Promise<void> {
        if (!this.config.enableGeneralCaching) {
            return;
        }

        try {
            // Since InMemoryStore doesn't support pattern matching,
            // we need to implement a simple pattern matching ourselves
            // For now, we'll support exact key matching and prefix matching with '*'

            if (keyPattern.endsWith('*')) {
                const prefix = keyPattern.slice(0, -1);
                // This is a limitation of InMemoryStore - we can't easily list all keys
                // In a production environment, you might want to use Redis or another store
                this.logger.warn('Pattern-based cache invalidation not fully supported with InMemoryStore', {
                    pattern: keyPattern,
                });
            } else {
                await this.cacheStore.mdelete([keyPattern]);
                this.logger.debug('Cache entry invalidated', { key: keyPattern });
            }
        } catch (error) {
            this.logger.error('Failed to invalidate cache', {
                pattern: keyPattern,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Workflow State Management
     */

    async saveWorkflowState(
        workflowId: string,
        executionId: string,
        state: WorkflowState
    ): Promise<void> {
        try {
            const key = `workflow:${workflowId}:${executionId}`;
            const config = { configurable: { thread_id: key } };
            const checkpoint = { data: state };
            const metadata = { timestamp: new Date().toISOString() };
            await this.memorySaver.put(config, checkpoint as any, metadata as any);

            this.logger.debug('Workflow state saved', {
                workflowId,
                executionId,
                status: state.status,
                currentStep: state.currentStep,
            });
        } catch (error) {
            this.logger.error('Failed to save workflow state', {
                workflowId,
                executionId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async loadWorkflowState(
        workflowId: string,
        executionId: string
    ): Promise<WorkflowState | null> {
        try {
            const key = `workflow:${workflowId}:${executionId}`;
            const config = { configurable: { thread_id: key } };
            const checkpoint = await this.memorySaver.get(config);

            if (checkpoint && (checkpoint as any).data) {
                const state = (checkpoint as any).data as WorkflowState;
                this.logger.debug('Workflow state loaded', {
                    workflowId,
                    executionId,
                    status: state.status,
                });
                return state;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to load workflow state', {
                workflowId,
                executionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Agent Context Management
     */

    async saveAgentContext(agentId: string, context: Record<string, any>): Promise<void> {
        try {
            const key = `agent_context:${agentId}`;
            const entry: CacheEntry = {
                key,
                value: context,
                createdAt: new Date(),
                metadata: {
                    type: 'agent_context',
                    agentId,
                },
            };

            await this.cacheStore.mset([[key, entry]]);

            this.logger.debug('Agent context saved', {
                agentId,
                contextKeys: Object.keys(context),
            });
        } catch (error) {
            this.logger.error('Failed to save agent context', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async loadAgentContext(agentId: string): Promise<Record<string, any> | null> {
        try {
            const key = `agent_context:${agentId}`;
            const entries = await this.cacheStore.mget([key]);
            const entry = entries[0] as CacheEntry | null;

            if (entry) {
                this.logger.debug('Agent context loaded', {
                    agentId,
                    contextKeys: Object.keys(entry.value),
                });
                return entry.value;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to load agent context', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Utility Methods
     */

    async clearAllCache(): Promise<void> {
        try {
            // Note: InMemoryStore doesn't have a clear all method
            // This is a limitation we need to work around
            this.cacheStore = new InMemoryStore();
            this.logger.info('All cache cleared');
        } catch (error) {
            this.logger.error('Failed to clear cache', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getStats(): Promise<{
        conversationStates: number;
        cacheEntries: number;
        workflowStates: number;
    }> {
        // Note: These stats are approximate since InMemoryStore and MemorySaver
        // don't provide direct access to count entries
        return {
            conversationStates: 0, // Cannot easily count with MemorySaver
            cacheEntries: 0, // Cannot easily count with InMemoryStore
            workflowStates: 0, // Cannot easily count with MemorySaver
        };
    }

    /**
     * Cleanup expired entries periodically
     */
    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanupExpiredEntries();
            } catch (error) {
                this.logger.error('Cleanup failed', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }, this.config.cleanupInterval);

        this.logger.debug('Cleanup timer started', {
            interval: this.config.cleanupInterval,
        });
    }

    private async cleanupExpiredEntries(): Promise<void> {
        // Note: This is a limitation of InMemoryStore - we can't easily iterate
        // over all entries to check for expiration. In a production environment,
        // you would want to use a more sophisticated caching solution like Redis
        this.logger.debug('Cleanup completed (limited functionality with InMemoryStore)');
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown(): Promise<void> {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        await this.clearAllCache();
        this.logger.info('AgentStateManager shutdown completed');
    }

    /**
     * Get the underlying LangChain components for direct access if needed
     */
    getMemorySaver(): MemorySaver {
        return this.memorySaver;
    }

    getCacheStore(): InMemoryStore {
        return this.cacheStore;
    }
}
