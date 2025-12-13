/**
 * Agent Router - Natural language intent recognition and routing logic
 * Routes user requests to appropriate agents based on intent analysis
 */

import { Logger } from '../utils/Logger';
import { AgentStateManager, ConversationState, ConversationTurn } from '../state/AgentStateManager';
import { IAgent, AgentType, AgentMessage } from '../types/agent.types';
import { ErrorInfo } from '../types/common.types';
import { v4 as uuidv4 } from 'uuid';

export interface IntentRecognitionResult {
    intent: string;
    confidence: number;
    entities: Record<string, any>;
    targetAgent: AgentType;
    reasoning: string;
}

export interface RoutingContext {
    conversationId: string;
    userId: string;
    sessionHistory: ConversationTurn[];
    currentContext: Record<string, any>;
    timestamp: Date;
}

// Using ConversationTurn from AgentStateManager to maintain consistency

export interface RoutingRule {
    ruleId: string;
    priority: number;
    intentPattern: string;
    entityRequirements: string[];
    targetAgent: AgentType;
    condition?: (context: RoutingContext, entities: Record<string, any>) => boolean;
}

export interface AgentRouterConfig {
    enableContextMaintenance: boolean;
    maxContextHistory: number;
    defaultConfidenceThreshold: number;
    fallbackAgent: AgentType;
    enableIntentLearning: boolean;
}

/**
 * AgentRouter handles natural language intent recognition and routes requests
 * to appropriate agents while maintaining conversation context
 */
export class AgentRouter {
    private logger: Logger;
    private stateManager: AgentStateManager;
    private config: AgentRouterConfig;
    private agents: Map<AgentType, IAgent> = new Map();
    private routingRules: RoutingRule[] = [];
    private intentPatterns: Map<string, RegExp> = new Map();

    constructor(
        stateManager: AgentStateManager,
        config: Partial<AgentRouterConfig> = {}
    ) {
        this.stateManager = stateManager;
        this.config = {
            enableContextMaintenance: true,
            maxContextHistory: 10,
            defaultConfidenceThreshold: 0.7,
            fallbackAgent: 'inventory',
            enableIntentLearning: false,
            ...config,
        };

        this.logger = new Logger({
            component: 'AgentRouter',
            level: 'info',
        });

        this.initializeRoutingRules();
        this.initializeIntentPatterns();

        this.logger.info('AgentRouter initialized', {
            contextMaintenance: this.config.enableContextMaintenance,
            maxContextHistory: this.config.maxContextHistory,
            fallbackAgent: this.config.fallbackAgent,
        });
    }

    /**
     * Register an agent with the router
     */
    registerAgent(agent: IAgent): void {
        this.agents.set(agent.config.agentType, agent);
        this.logger.debug('Agent registered with router', {
            agentType: agent.config.agentType,
            agentId: agent.config.agentId,
        });
    }

    /**
     * Route a user request to the appropriate agent
     */
    async routeRequest(
        userInput: string,
        context: RoutingContext
    ): Promise<{
        targetAgent: IAgent;
        intentResult: IntentRecognitionResult;
        message: AgentMessage;
    }> {
        try {
            this.logger.debug('Processing routing request', {
                conversationId: context.conversationId,
                userInput: userInput.substring(0, 100),
            });

            // Recognize intent and extract entities
            const intentResult = await this.recognizeIntent(userInput, context);

            // Find target agent
            const targetAgent = this.agents.get(intentResult.targetAgent);
            if (!targetAgent) {
                throw new Error(`Target agent not found: ${intentResult.targetAgent}`);
            }

            // Create agent message
            const message: AgentMessage = {
                id: uuidv4(),
                messageId: uuidv4(),
                fromAgent: 'router',
                toAgent: targetAgent.config.agentId,
                messageType: 'request',
                payload: {
                    userInput,
                    intent: intentResult.intent,
                    entities: intentResult.entities,
                    context: context.currentContext,
                },
                timestamp: new Date(),
                correlationId: context.conversationId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Update conversation context
            if (this.config.enableContextMaintenance) {
                await this.updateConversationContext(context, intentResult, targetAgent.config.agentId);
            }

            this.logger.info('Request routed successfully', {
                conversationId: context.conversationId,
                intent: intentResult.intent,
                targetAgent: intentResult.targetAgent,
                confidence: intentResult.confidence,
            });

            return {
                targetAgent,
                intentResult,
                message,
            };
        } catch (error) {
            this.logger.error('Failed to route request', {
                conversationId: context.conversationId,
                userInput: userInput.substring(0, 100),
                error: error instanceof Error ? error.message : String(error),
            });

            // Fallback to default agent
            const fallbackAgent = this.agents.get(this.config.fallbackAgent);
            if (!fallbackAgent) {
                throw new Error('Fallback agent not available');
            }

            const fallbackMessage: AgentMessage = {
                id: uuidv4(),
                messageId: uuidv4(),
                fromAgent: 'router',
                toAgent: fallbackAgent.config.agentId,
                messageType: 'request',
                payload: {
                    userInput,
                    intent: 'unknown',
                    entities: {},
                    context: context.currentContext,
                    routingError: error instanceof Error ? error.message : String(error),
                },
                timestamp: new Date(),
                correlationId: context.conversationId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            return {
                targetAgent: fallbackAgent,
                intentResult: {
                    intent: 'unknown',
                    confidence: 0.0,
                    entities: {},
                    targetAgent: this.config.fallbackAgent,
                    reasoning: 'Fallback due to routing error',
                },
                message: fallbackMessage,
            };
        }
    }

    /**
     * Recognize intent from user input using pattern matching and context
     */
    private async recognizeIntent(
        userInput: string,
        context: RoutingContext
    ): Promise<IntentRecognitionResult> {
        const normalizedInput = userInput.toLowerCase().trim();

        // Extract entities first
        const entities = this.extractEntities(normalizedInput);

        // Check routing rules in priority order
        for (const rule of this.routingRules.sort((a, b) => b.priority - a.priority)) {
            const pattern = this.intentPatterns.get(rule.intentPattern);
            if (!pattern) continue;

            if (pattern.test(normalizedInput)) {
                // Check entity requirements
                const hasRequiredEntities = rule.entityRequirements.every(
                    req => entities.hasOwnProperty(req)
                );

                if (hasRequiredEntities) {
                    // Check additional conditions if any
                    if (rule.condition && !rule.condition(context, entities)) {
                        continue;
                    }

                    const confidence = this.calculateConfidence(normalizedInput, rule, entities, context);

                    if (confidence >= this.config.defaultConfidenceThreshold) {
                        return {
                            intent: rule.intentPattern,
                            confidence,
                            entities,
                            targetAgent: rule.targetAgent,
                            reasoning: `Matched rule ${rule.ruleId} with confidence ${confidence}`,
                        };
                    }
                }
            }
        }

        // Fallback intent recognition
        return this.getFallbackIntent(normalizedInput, entities, context);
    }

    /**
     * Extract entities from user input using pattern matching
     */
    private extractEntities(input: string): Record<string, any> {
        const entities: Record<string, any> = {};

        // Extract quantities and units
        const quantityMatch = input.match(/(\d+)\s*(包|个|瓶|盒|袋|件|支|条|张|本)/);
        if (quantityMatch) {
            entities.quantity = parseInt(quantityMatch[1]);
            entities.unit = quantityMatch[2];
        }

        // Extract item names (Chinese characters and common product names)
        // First try to extract item name before action words
        const beforeActionMatch = input.match(/([\u4e00-\u9fff]+)(?=消耗|添加|查询|更新|购买|采购)/);
        if (beforeActionMatch) {
            entities.itemName = beforeActionMatch[1];
        } else {
            // Fallback to general extraction
            const itemMatches = input.match(/([\u4e00-\u9fff]+|[a-zA-Z]+(?:\s+[a-zA-Z]+)*)/g);
            if (itemMatches) {
                // Filter out common action words
                const actionWords = ['消耗', '添加', '查询', '更新', '购买', '采购', '分析', '报告', '通知'];
                const items = itemMatches.filter(item =>
                    !actionWords.includes(item) &&
                    item.length > 1 &&
                    !/^\d+$/.test(item)
                );
                if (items.length > 0) {
                    entities.itemName = items[0];
                    entities.allItems = items;
                }
            }
        }

        // Extract actions
        const actionPatterns = [
            { pattern: /(消耗|用了|用掉|减少)/, action: 'consume' },
            { pattern: /(添加|增加|买了|购买)/, action: 'add' },
            { pattern: /(查询|查看|显示|看看)/, action: 'query' },
            { pattern: /(更新|修改|改变)/, action: 'update' },
            { pattern: /(采购|购买|买|订购)/, action: 'purchase' },
            { pattern: /(分析|统计|计算)/, action: 'analyze' },
            { pattern: /(报告|汇报|总结)/, action: 'report' },
            { pattern: /(通知|提醒|告知)/, action: 'notify' },
        ];

        for (const { pattern, action } of actionPatterns) {
            if (pattern.test(input)) {
                entities.action = action;
                break;
            }
        }

        // Extract time references
        const timePatterns = [
            { pattern: /(今天|今日)/, time: 'today' },
            { pattern: /(昨天|昨日)/, time: 'yesterday' },
            { pattern: /(明天|明日)/, time: 'tomorrow' },
            { pattern: /(本周|这周)/, time: 'this_week' },
            { pattern: /(上周|上星期)/, time: 'last_week' },
            { pattern: /(本月|这个月)/, time: 'this_month' },
            { pattern: /(上月|上个月)/, time: 'last_month' },
        ];

        for (const { pattern, time } of timePatterns) {
            if (pattern.test(input)) {
                entities.timeReference = time;
                break;
            }
        }

        // Extract monetary amounts
        const moneyMatch = input.match(/(\d+(?:\.\d+)?)\s*[元块钱]/);
        if (moneyMatch) {
            entities.amount = parseFloat(moneyMatch[1]);
            entities.currency = 'CNY';
        }

        return entities;
    }

    /**
     * Calculate confidence score for intent recognition
     */
    private calculateConfidence(
        input: string,
        rule: RoutingRule,
        entities: Record<string, any>,
        context: RoutingContext
    ): number {
        let confidence = 0.5; // Base confidence

        // Boost confidence based on entity completeness
        const entityBoost = Math.min(Object.keys(entities).length * 0.1, 0.3);
        confidence += entityBoost;

        // Boost confidence based on context consistency
        if (context.sessionHistory.length > 0) {
            const recentAgent = context.sessionHistory[context.sessionHistory.length - 1]?.agentId;
            if (recentAgent && recentAgent.includes(rule.targetAgent)) {
                confidence += 0.1;
            }
        }

        // Boost confidence for exact keyword matches
        const keywords = this.getKeywordsForAgent(rule.targetAgent);
        const keywordMatches = keywords.filter(keyword => input.includes(keyword)).length;
        confidence += Math.min(keywordMatches * 0.05, 0.2);

        return Math.min(confidence, 1.0);
    }

    /**
     * Get fallback intent when no rules match
     */
    private getFallbackIntent(
        input: string,
        entities: Record<string, any>,
        context: RoutingContext
    ): IntentRecognitionResult {
        // Simple heuristic-based fallback
        if (entities.action === 'consume' || entities.action === 'add' || entities.action === 'query') {
            return {
                intent: 'inventory_management',
                confidence: 0.6,
                entities,
                targetAgent: 'inventory',
                reasoning: 'Fallback to inventory agent based on action type',
            };
        }

        if (entities.action === 'purchase' || entities.action === 'analyze') {
            return {
                intent: 'procurement_management',
                confidence: 0.6,
                entities,
                targetAgent: 'procurement',
                reasoning: 'Fallback to procurement agent based on action type',
            };
        }

        if (entities.action === 'report' || entities.amount) {
            return {
                intent: 'financial_analysis',
                confidence: 0.6,
                entities,
                targetAgent: 'finance',
                reasoning: 'Fallback to finance agent based on action type or monetary reference',
            };
        }

        // Default fallback
        return {
            intent: 'general_inquiry',
            confidence: 0.3,
            entities,
            targetAgent: this.config.fallbackAgent,
            reasoning: 'Default fallback - no clear intent detected',
        };
    }

    /**
     * Initialize routing rules for different agents
     */
    private initializeRoutingRules(): void {
        this.routingRules = [
            // Inventory Agent Rules
            {
                ruleId: 'inventory_consume',
                priority: 10,
                intentPattern: 'inventory_consume',
                entityRequirements: ['action', 'itemName'],
                targetAgent: 'inventory',
                condition: (context, entities) => entities.action === 'consume',
            },
            {
                ruleId: 'inventory_add',
                priority: 10,
                intentPattern: 'inventory_add',
                entityRequirements: ['action', 'itemName'],
                targetAgent: 'inventory',
                condition: (context, entities) => entities.action === 'add',
            },
            {
                ruleId: 'inventory_query',
                priority: 9,
                intentPattern: 'inventory_query',
                entityRequirements: ['action'],
                targetAgent: 'inventory',
                condition: (context, entities) => entities.action === 'query',
            },
            {
                ruleId: 'inventory_photo',
                priority: 8,
                intentPattern: 'inventory_photo',
                entityRequirements: [],
                targetAgent: 'inventory',
                condition: (context, entities) =>
                    context.currentContext.hasPhoto ||
                    /照片|图片|拍照|扫描/.test(context.currentContext.userInput || ''),
            },

            // Procurement Agent Rules
            {
                ruleId: 'procurement_purchase',
                priority: 10,
                intentPattern: 'procurement_purchase',
                entityRequirements: ['action'],
                targetAgent: 'procurement',
                condition: (context, entities) => entities.action === 'purchase',
            },
            {
                ruleId: 'procurement_import',
                priority: 9,
                intentPattern: 'procurement_import',
                entityRequirements: [],
                targetAgent: 'procurement',
                condition: (context, entities) =>
                    context.currentContext.hasFile ||
                    /导入|上传|文件|excel|订单/.test(context.currentContext.userInput || ''),
            },
            {
                ruleId: 'procurement_recommendation',
                priority: 8,
                intentPattern: 'procurement_recommendation',
                entityRequirements: [],
                targetAgent: 'procurement',
                condition: (context, entities) =>
                    /建议|推荐|采购|补货|购物清单/.test(context.currentContext.userInput || ''),
            },

            // Finance Agent Rules
            {
                ruleId: 'finance_report',
                priority: 10,
                intentPattern: 'finance_report',
                entityRequirements: ['action'],
                targetAgent: 'finance',
                condition: (context, entities) => entities.action === 'report',
            },
            {
                ruleId: 'finance_analysis',
                priority: 9,
                intentPattern: 'finance_analysis',
                entityRequirements: ['action'],
                targetAgent: 'finance',
                condition: (context, entities) => entities.action === 'analyze',
            },
            {
                ruleId: 'finance_spending',
                priority: 8,
                intentPattern: 'finance_spending',
                entityRequirements: ['amount'],
                targetAgent: 'finance',
            },

            // Notification Agent Rules
            {
                ruleId: 'notification_send',
                priority: 10,
                intentPattern: 'notification_send',
                entityRequirements: ['action'],
                targetAgent: 'notification',
                condition: (context, entities) => entities.action === 'notify',
            },
        ];

        this.logger.debug('Routing rules initialized', {
            rulesCount: this.routingRules.length,
        });
    }

    /**
     * Initialize intent patterns for regex matching
     */
    private initializeIntentPatterns(): void {
        const patterns: Array<[string, RegExp]> = [
            // Inventory patterns
            ['inventory_consume', /(消耗|用了|用掉|减少).*(包|个|瓶|盒|袋)/],
            ['inventory_add', /(添加|增加|买了|购买).*(包|个|瓶|盒|袋)/],
            ['inventory_query', /(查询|查看|显示|看看).*(库存|剩余|还有)/],
            ['inventory_photo', /(照片|图片|拍照|扫描|识别)/],

            // Procurement patterns
            ['procurement_purchase', /(采购|购买|买|订购|补货)/],
            ['procurement_import', /(导入|上传|文件|excel|订单|平台)/],
            ['procurement_recommendation', /(建议|推荐|采购|补货|购物清单|需要买)/],

            // Finance patterns
            ['finance_report', /(报告|汇报|总结|月报|季报|年报)/],
            ['finance_analysis', /(分析|统计|计算|支出|花费|消费)/],
            ['finance_spending', /(\d+(?:\.\d+)?)\s*[元块钱]/],

            // Notification patterns
            ['notification_send', /(通知|提醒|告知|发送|推送)/],
        ];

        for (const [intent, pattern] of patterns) {
            this.intentPatterns.set(intent, pattern);
        }

        this.logger.debug('Intent patterns initialized', {
            patternsCount: this.intentPatterns.size,
        });
    }

    /**
     * Get keywords associated with each agent type
     */
    private getKeywordsForAgent(agentType: AgentType): string[] {
        const keywords = {
            inventory: ['库存', '消耗', '添加', '剩余', '照片', '扫描', '物品'],
            procurement: ['采购', '购买', '订单', '导入', '建议', '推荐', '补货'],
            finance: ['财务', '支出', '分析', '报告', '花费', '消费', '预算'],
            notification: ['通知', '提醒', '告知', '发送', '推送', '消息'],
        };

        return keywords[agentType] || [];
    }

    /**
     * Update conversation context with new turn
     */
    private async updateConversationContext(
        context: RoutingContext,
        intentResult: IntentRecognitionResult,
        targetAgentId: string
    ): Promise<void> {
        try {
            const newTurn: ConversationTurn = {
                turnId: uuidv4(),
                userInput: context.currentContext.userInput || '',
                agentResponse: '', // Will be filled when agent responds
                intent: intentResult.intent,
                entities: intentResult.entities,
                timestamp: new Date(),
                agentId: targetAgentId,
            };

            // Add to session history
            context.sessionHistory.push(newTurn);

            // Limit history size
            if (context.sessionHistory.length > this.config.maxContextHistory) {
                context.sessionHistory = context.sessionHistory.slice(-this.config.maxContextHistory);
            }

            // Save to state manager
            const conversationState: ConversationState = {
                conversationId: context.conversationId,
                userId: context.userId,
                currentIntent: intentResult.intent,
                entities: intentResult.entities,
                history: context.sessionHistory,
                lastActivity: new Date(),
                agentContext: context.currentContext,
            };

            await this.stateManager.saveConversationState(context.conversationId, conversationState);

            this.logger.debug('Conversation context updated', {
                conversationId: context.conversationId,
                intent: intentResult.intent,
                historyLength: context.sessionHistory.length,
            });
        } catch (error) {
            this.logger.error('Failed to update conversation context', {
                conversationId: context.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Get conversation context for a conversation ID
     */
    async getConversationContext(conversationId: string): Promise<RoutingContext | null> {
        try {
            const conversationState = await this.stateManager.loadConversationState(conversationId);
            if (!conversationState) {
                return null;
            }

            return {
                conversationId,
                userId: conversationState.userId,
                sessionHistory: conversationState.history,
                currentContext: conversationState.agentContext,
                timestamp: new Date(),
            };
        } catch (error) {
            this.logger.error('Failed to get conversation context', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Clear conversation context
     */
    async clearConversationContext(conversationId: string): Promise<void> {
        try {
            await this.stateManager.deleteConversationState(conversationId);
            this.logger.debug('Conversation context cleared', { conversationId });
        } catch (error) {
            this.logger.error('Failed to clear conversation context', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Get routing statistics
     */
    getRoutingStats(): {
        registeredAgents: number;
        routingRules: number;
        intentPatterns: number;
    } {
        return {
            registeredAgents: this.agents.size,
            routingRules: this.routingRules.length,
            intentPatterns: this.intentPatterns.size,
        };
    }

    /**
     * Add custom routing rule
     */
    addRoutingRule(rule: RoutingRule): void {
        this.routingRules.push(rule);
        this.logger.debug('Custom routing rule added', {
            ruleId: rule.ruleId,
            targetAgent: rule.targetAgent,
            priority: rule.priority,
        });
    }

    /**
     * Add custom intent pattern
     */
    addIntentPattern(intent: string, pattern: RegExp): void {
        this.intentPatterns.set(intent, pattern);
        this.logger.debug('Custom intent pattern added', {
            intent,
            pattern: pattern.source,
        });
    }

    /**
     * Shutdown the router
     */
    async shutdown(): Promise<void> {
        this.agents.clear();
        this.routingRules = [];
        this.intentPatterns.clear();
        this.logger.info('AgentRouter shutdown completed');
    }
}
