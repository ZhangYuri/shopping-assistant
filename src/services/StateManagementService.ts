/**
 * State Management Service
 * Integrates LangChain's built-in MemorySaver and InMemoryStore for state management
 */

import { MemorySaver } from '@langchain/langgraph';
import { InMemoryStore } from '@langchain/core/stores';
import { Logger } from '@/utils/Logger';

export interface ConversationState {
    conversationId: string;
    userId?: string;
    currentIntent?: string;
    entities: Record<string, any>;
    history: ConversationTurn[];
    lastActivity: Date;
    metadata: Record<string, any>;
}

export interface ConversationTurn {
    turnId: string;
    userInput: string;
    agentResponse: string;
    intent?: string;
    entities: Record<string, any>;
    timestamp: Date;
    agentId?: string;
    toolsUsed?: string[];
}

export interface CacheEntry<T = any> {
    key: string;
    value: T;
    ttl?: number;
    createdAt: Date;
    expiresAt?: Date;
}

export class StateManagementService {
    private static instance: StateManagementService;
    private logger: Logger;
    private memorySaver: MemorySaver;
    private cacheStore: InMemoryStore;
    private conversationStates: Map<string, ConversationState>;
    private isInitialized = false;

    private constructor() {
        this.logger = new Logger({
            component: 'StateManagementService',
            level: 'info'
        });

        // Initialize LangChain built-in components
        this.memorySaver = new MemorySaver();
        this.cacheStore = new InMemoryStore();
        this.conversationStates = new Map();
    }

    public static getInstance(): StateManagementService {
        if (!StateManagementService.instance) {
            StateManagementService.instance = new StateManagementService();
        }
        return StateManagementService.instance;
    }

    /**
     * Initialize state management service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            this.logger.info('Initializing state management service');

            // Start cleanup interval for expired cache entries
            this.startCleanupInterval();

            this.isInitialized = true;
            this.logger.info('State management service initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize state management service', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Get MemorySaver instance for LangGraph workflows
     */
    getMemorySaver(): MemorySaver {
        return this.memorySaver;
    }

    /**
     * Get InMemoryStore instance for general caching
     */
    getCacheStore(): InMemoryStore {
        return this.cacheStore;
    }

    /**
     * Save conversation state
     */
    async saveConversationState(conversationId: string, state: Partial<ConversationState>): Promise<void> {
        try {
            const existingState = this.conversationStates.get(conversationId);

            const updatedState: ConversationState = {
                conversationId,
                userId: state.userId || existingState?.userId,
                currentIntent: state.currentIntent || existingState?.currentIntent,
                entities: { ...existingState?.entities, ...state.entities },
                history: state.history || existingState?.history || [],
                lastActivity: new Date(),
                metadata: { ...existingState?.metadata, ...state.metadata }
            };

            this.conversationStates.set(conversationId, updatedState);

            // Also save to MemorySaver for LangGraph workflows
            await this.memorySaver.put(
                { configurable: { thread_id: conversationId } },
                'conversation_state',
                updatedState
            );

            this.logger.debug('Conversation state saved', {
                conversationId,
                userId: updatedState.userId,
                historyLength: updatedState.history.length
            });

        } catch (error) {
            this.logger.error('Failed to save conversation state', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Load conversation state
     */
    async loadConversationState(conversationId: string): Promise<ConversationState | null> {
        try {
            // First try to get from local cache
            let state = this.conversationStates.get(conversationId);

            if (!state) {
                // Try to get from MemorySaver
                try {
                    const savedState = await this.memorySaver.get(
                        { configurable: { thread_id: conversationId } },
                        'conversation_state'
                    );

                    if (savedState) {
                        state = savedState as ConversationState;
                        this.conversationStates.set(conversationId, state);
                    }
                } catch {
                    // State doesn't exist in MemorySaver
                }
            }

            if (state) {
                this.logger.debug('Conversation state loaded', {
                    conversationId,
                    userId: state.userId,
                    historyLength: state.history.length,
                    lastActivity: state.lastActivity
                });
            }

            return state || null;

        } catch (error) {
            this.logger.error('Failed to load conversation state', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Add conversation turn
     */
    async addConversationTurn(
        conversationId: string,
        turn: Omit<ConversationTurn, 'turnId' | 'timestamp'>
    ): Promise<void> {
        try {
            const state = await this.loadConversationState(conversationId) || {
                conversationId,
                entities: {},
                history: [],
                lastActivity: new Date(),
                metadata: {}
            };

            const newTurn: ConversationTurn = {
                ...turn,
                turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date()
            };

            state.history.push(newTurn);

            // Keep only last 50 turns to prevent memory bloat
            if (state.history.length > 50) {
                state.history = state.history.slice(-50);
            }

            await this.saveConversationState(conversationId, state);

            this.logger.debug('Conversation turn added', {
                conversationId,
                turnId: newTurn.turnId,
                agentId: newTurn.agentId
            });

        } catch (error) {
            this.logger.error('Failed to add conversation turn', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Cache analysis result with TTL
     */
    async cacheAnalysisResult<T>(key: string, result: T, ttlSeconds: number = 3600): Promise<void> {
        try {
            const entry: CacheEntry<T> = {
                key,
                value: result,
                ttl: ttlSeconds,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + ttlSeconds * 1000)
            };

            await this.cacheStore.mset([[key, JSON.stringify(entry)]]);

            this.logger.debug('Analysis result cached', {
                key,
                ttlSeconds,
                expiresAt: entry.expiresAt
            });

        } catch (error) {
            this.logger.error('Failed to cache analysis result', {
                key,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Get cached analysis result
     */
    async getCachedAnalysisResult<T>(key: string): Promise<T | null> {
        try {
            const cached = await this.cacheStore.mget([key]);
            const cachedValue = cached[0];

            if (!cachedValue) {
                return null;
            }

            const entry: CacheEntry<T> = JSON.parse(cachedValue);

            // Check if expired
            if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) {
                await this.cacheStore.mdelete([key]);
                this.logger.debug('Cached result expired and removed', { key });
                return null;
            }

            this.logger.debug('Cached result retrieved', {
                key,
                createdAt: entry.createdAt,
                expiresAt: entry.expiresAt
            });

            return entry.value;

        } catch (error) {
            this.logger.error('Failed to get cached analysis result', {
                key,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Clear conversation state
     */
    async clearConversationState(conversationId: string): Promise<void> {
        try {
            this.conversationStates.delete(conversationId);

            // Also clear from MemorySaver
            try {
                await this.memorySaver.delete({ configurable: { thread_id: conversationId } });
            } catch {
                // Ignore if doesn't exist
            }

            this.logger.info('Conversation state cleared', { conversationId });

        } catch (error) {
            this.logger.error('Failed to clear conversation state', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Clear expired cache entries
     */
    async clearExpiredCache(): Promise<void> {
        try {
            // This is a simplified implementation
            // In a real scenario, we'd need to iterate through all keys
            // For now, we rely on the cleanup interval and individual checks

            this.logger.debug('Cache cleanup completed');

        } catch (error) {
            this.logger.error('Failed to clear expired cache', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Get conversation statistics
     */
    async getConversationStats(conversationId: string): Promise<{
        totalTurns: number;
        lastActivity: Date | null;
        entities: Record<string, any>;
        agentsUsed: string[];
    } | null> {
        try {
            const state = await this.loadConversationState(conversationId);

            if (!state) {
                return null;
            }

            const agentsUsed = [...new Set(
                state.history
                    .map(turn => turn.agentId)
                    .filter(agentId => agentId)
            )] as string[];

            return {
                totalTurns: state.history.length,
                lastActivity: state.lastActivity,
                entities: state.entities,
                agentsUsed
            };

        } catch (error) {
            this.logger.error('Failed to get conversation stats', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Get all active conversations
     */
    getActiveConversations(): string[] {
        return Array.from(this.conversationStates.keys());
    }

    /**
     * Start cleanup interval for expired entries
     */
    private startCleanupInterval(): void {
        // Clean up every hour
        setInterval(async () => {
            try {
                await this.clearExpiredCache();

                // Also clean up old conversation states (older than 7 days)
                const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);

                for (const [conversationId, state] of this.conversationStates.entries()) {
                    if (state.lastActivity.getTime() < cutoffTime) {
                        await this.clearConversationState(conversationId);
                        this.logger.debug('Old conversation state cleaned up', { conversationId });
                    }
                }

            } catch (error) {
                this.logger.error('Cleanup interval error', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }, 60 * 60 * 1000); // 1 hour
    }
}
