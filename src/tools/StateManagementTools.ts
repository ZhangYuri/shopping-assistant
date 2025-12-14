/**
 * State Management Tools
 * DynamicTool implementations for state management operations
 */

import { DynamicTool } from '@langchain/core/tools';
import { StateManagementService } from '../services/StateManagementService';
import { Logger } from '../utils/Logger';

const logger = new Logger({
    component: 'StateManagementTools',
    level: 'info'
});

const stateManagementService = StateManagementService.getInstance();

// Conversation state management tools

export const saveConversationStateTool = new DynamicTool({
    name: 'save_conversation_state',
    description: '保存对话状态。输入: {"conversationId": "对话ID", "userId": "用户ID", "currentIntent": "当前意图", "entities": {"实体": "值"}, "metadata": {"元数据": "值"}}',
    func: async (input: string) => {
        try {
            const { conversationId, userId, currentIntent, entities, metadata } = JSON.parse(input);

            if (!conversationId) {
                return JSON.stringify({
                    success: false,
                    error: '对话ID不能为空'
                });
            }

            await stateManagementService.saveConversationState(conversationId, {
                userId,
                currentIntent,
                entities: entities || {},
                metadata: metadata || {}
            });

            return JSON.stringify({
                success: true,
                data: {
                    conversationId,
                    message: '对话状态已保存'
                }
            });

        } catch (error) {
            logger.error('Failed to save conversation state', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const loadConversationStateTool = new DynamicTool({
    name: 'load_conversation_state',
    description: '加载对话状态。输入: {"conversationId": "对话ID"}',
    func: async (input: string) => {
        try {
            const { conversationId } = JSON.parse(input);

            if (!conversationId) {
                return JSON.stringify({
                    success: false,
                    error: '对话ID不能为空'
                });
            }

            const state = await stateManagementService.loadConversationState(conversationId);

            if (!state) {
                return JSON.stringify({
                    success: false,
                    error: '未找到对话状态'
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    conversationId: state.conversationId,
                    userId: state.userId,
                    currentIntent: state.currentIntent,
                    entities: state.entities,
                    historyLength: state.history.length,
                    lastActivity: state.lastActivity,
                    metadata: state.metadata
                }
            });

        } catch (error) {
            logger.error('Failed to load conversation state', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const addConversationTurnTool = new DynamicTool({
    name: 'add_conversation_turn',
    description: '添加对话轮次。输入: {"conversationId": "对话ID", "userInput": "用户输入", "agentResponse": "智能体回复", "intent": "意图", "entities": {"实体": "值"}, "agentId": "智能体ID", "toolsUsed": ["工具1", "工具2"]}',
    func: async (input: string) => {
        try {
            const {
                conversationId,
                userInput,
                agentResponse,
                intent,
                entities,
                agentId,
                toolsUsed
            } = JSON.parse(input);

            if (!conversationId || !userInput || !agentResponse) {
                return JSON.stringify({
                    success: false,
                    error: '对话ID、用户输入和智能体回复不能为空'
                });
            }

            await stateManagementService.addConversationTurn(conversationId, {
                userInput,
                agentResponse,
                intent,
                entities: entities || {},
                agentId,
                toolsUsed: toolsUsed || []
            });

            return JSON.stringify({
                success: true,
                data: {
                    conversationId,
                    message: '对话轮次已添加'
                }
            });

        } catch (error) {
            logger.error('Failed to add conversation turn', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getConversationStatsTool = new DynamicTool({
    name: 'get_conversation_stats',
    description: '获取对话统计信息。输入: {"conversationId": "对话ID"}',
    func: async (input: string) => {
        try {
            const { conversationId } = JSON.parse(input);

            if (!conversationId) {
                return JSON.stringify({
                    success: false,
                    error: '对话ID不能为空'
                });
            }

            const stats = await stateManagementService.getConversationStats(conversationId);

            if (!stats) {
                return JSON.stringify({
                    success: false,
                    error: '未找到对话统计信息'
                });
            }

            return JSON.stringify({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Failed to get conversation stats', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const clearConversationStateTool = new DynamicTool({
    name: 'clear_conversation_state',
    description: '清除对话状态。输入: {"conversationId": "对话ID"}',
    func: async (input: string) => {
        try {
            const { conversationId } = JSON.parse(input);

            if (!conversationId) {
                return JSON.stringify({
                    success: false,
                    error: '对话ID不能为空'
                });
            }

            await stateManagementService.clearConversationState(conversationId);

            return JSON.stringify({
                success: true,
                data: {
                    conversationId,
                    message: '对话状态已清除'
                }
            });

        } catch (error) {
            logger.error('Failed to clear conversation state', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Cache management tools

export const cacheAnalysisResultTool = new DynamicTool({
    name: 'cache_analysis_result',
    description: '缓存分析结果。输入: {"key": "缓存键", "result": "分析结果", "ttlSeconds": 过期时间秒数(默认3600)}',
    func: async (input: string) => {
        try {
            const { key, result, ttlSeconds = 3600 } = JSON.parse(input);

            if (!key || result === undefined) {
                return JSON.stringify({
                    success: false,
                    error: '缓存键和结果不能为空'
                });
            }

            await stateManagementService.cacheAnalysisResult(key, result, ttlSeconds);

            return JSON.stringify({
                success: true,
                data: {
                    key,
                    ttlSeconds,
                    message: '分析结果已缓存'
                }
            });

        } catch (error) {
            logger.error('Failed to cache analysis result', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getCachedAnalysisResultTool = new DynamicTool({
    name: 'get_cached_analysis_result',
    description: '获取缓存的分析结果。输入: {"key": "缓存键"}',
    func: async (input: string) => {
        try {
            const { key } = JSON.parse(input);

            if (!key) {
                return JSON.stringify({
                    success: false,
                    error: '缓存键不能为空'
                });
            }

            const result = await stateManagementService.getCachedAnalysisResult(key);

            if (result === null) {
                return JSON.stringify({
                    success: false,
                    error: '未找到缓存结果或已过期'
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    key,
                    result
                }
            });

        } catch (error) {
            logger.error('Failed to get cached analysis result', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// System management tools

export const getActiveConversationsTool = new DynamicTool({
    name: 'get_active_conversations',
    description: '获取活跃对话列表。输入: {}',
    func: async (input: string) => {
        try {
            const activeConversations = stateManagementService.getActiveConversations();

            return JSON.stringify({
                success: true,
                data: {
                    conversations: activeConversations,
                    count: activeConversations.length
                }
            });

        } catch (error) {
            logger.error('Failed to get active conversations', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const clearExpiredCacheTool = new DynamicTool({
    name: 'clear_expired_cache',
    description: '清理过期缓存。输入: {}',
    func: async (input: string) => {
        try {
            await stateManagementService.clearExpiredCache();

            return JSON.stringify({
                success: true,
                data: {
                    message: '过期缓存已清理'
                }
            });

        } catch (error) {
            logger.error('Failed to clear expired cache', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Tool factory functions for easy integration

export function createConversationStateTools(): DynamicTool[] {
    return [
        saveConversationStateTool,
        loadConversationStateTool,
        addConversationTurnTool,
        getConversationStatsTool,
        clearConversationStateTool
    ];
}

export function createCacheManagementTools(): DynamicTool[] {
    return [
        cacheAnalysisResultTool,
        getCachedAnalysisResultTool,
        clearExpiredCacheTool
    ];
}

export function createSystemManagementTools(): DynamicTool[] {
    return [
        getActiveConversationsTool
    ];
}

export function createAllStateManagementTools(): DynamicTool[] {
    return [
        ...createConversationStateTools(),
        ...createCacheManagementTools(),
        ...createSystemManagementTools()
    ];
}
