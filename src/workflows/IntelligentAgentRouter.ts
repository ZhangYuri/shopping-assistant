/**
 * Intelligent Agent Router for LangGraph StateGraph
 * Enhanced routing with LLM-based intent recognition and context awareness
 */

import { ChatDeepSeek } from '@langchain/deepseek';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Logger } from '../utils/Logger';
import { AgentStateManager, ConversationState, ConversationTurn } from '../state/AgentStateManager';
import { BaseAgent } from '../agents/base/BaseAgent';
import { v4 as uuidv4 } from 'uuid';

export type AgentType = 'inventory' | 'procurement' | 'finance' | 'notification';

export interface IntelligentRoutingResult {
    targetAgent: AgentType;
    confidence: number;
    reasoning: string;
    extractedEntities: Record<string, any>;
    suggestedActions: string[];
    contextualInfo: string;
}

export interface RoutingContext {
    conversationId: string;
    userId: string;
    sessionHistory: ConversationTurn[];
    currentContext: Record<string, any>;
    timestamp: Date;
    userPreferences?: Record<string, any>;
}

export interface IntelligentRouterConfig {
    llmModel?: ChatDeepSeek;
    enableContextLearning: boolean;
    confidenceThreshold: number;
    maxContextHistory: number;
    fallbackAgent: AgentType;
    enableEntityExtraction: boolean;
}

/**
 * Intelligent Agent Router using LLM for sophisticated intent recognition
 * Integrates with LangGraph StateGraph for seamless agent orchestration
 */
export class IntelligentAgentRouter {
    private logger: Logger;
    private stateManager: AgentStateManager;
    private llm: ChatDeepSeek;
    private config: IntelligentRouterConfig;
    private agents: Map<AgentType, BaseAgent> = new Map();
    private routingHistory: Map<string, IntelligentRoutingResult[]> = new Map();

    constructor(
        stateManager: AgentStateManager,
        config: Partial<IntelligentRouterConfig> = {}
    ) {
        this.stateManager = stateManager;
        this.config = {
            enableContextLearning: true,
            confidenceThreshold: 0.7,
            maxContextHistory: 10,
            fallbackAgent: 'inventory',
            enableEntityExtraction: true,
            ...config,
        };

        this.logger = new Logger({
            component: 'IntelligentAgentRouter',
            level: 'info',
        });

        // Initialize LLM for intelligent routing
        this.llm = config.llmModel || new ChatDeepSeek({
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: 'deepseek-chat',
            temperature: 0.1, // Low temperature for consistent routing decisions
        });

        this.logger.info('Intelligent Agent Router initialized', {
            enableContextLearning: this.config.enableContextLearning,
            confidenceThreshold: this.config.confidenceThreshold,
            fallbackAgent: this.config.fallbackAgent,
        });
    }

    /**
     * Register an agent with the router
     */
    registerAgent(agent: BaseAgent): void {
        const agentType = this.getAgentTypeFromConfig(agent.getConfig());
        this.agents.set(agentType, agent);
        this.logger.debug('Agent registered with intelligent router', {
            agentType,
            agentId: agent.getConfig().agentId,
        });
    }

    /**
     * Perform intelligent routing using LLM-based analysis
     */
    async routeIntelligently(
        userInput: string,
        context: RoutingContext
    ): Promise<IntelligentRoutingResult> {
        try {
            this.logger.debug('Starting intelligent routing', {
                conversationId: context.conversationId,
                userInput: userInput.substring(0, 100),
                historyLength: context.sessionHistory.length,
            });

            // Build context-aware prompt for LLM routing
            const routingPrompt = this.buildRoutingPrompt(userInput, context);

            // Get LLM routing decision
            const llmResponse = await this.llm.invoke([
                new SystemMessage(this.getRoutingSystemPrompt()),
                new HumanMessage(routingPrompt),
            ]);

            // Parse LLM response
            const routingResult = this.parseLLMRoutingResponse(llmResponse.content as string, userInput);

            // Apply confidence threshold and fallback logic
            const finalResult = this.applyRoutingLogic(routingResult, context);

            // Store routing decision for learning
            if (this.config.enableContextLearning) {
                await this.storeRoutingDecision(context.conversationId, finalResult);
            }

            this.logger.info('Intelligent routing completed', {
                conversationId: context.conversationId,
                targetAgent: finalResult.targetAgent,
                confidence: finalResult.confidence,
                reasoning: finalResult.reasoning.substring(0, 100),
            });

            return finalResult;
        } catch (error) {
            this.logger.error('Intelligent routing failed', {
                conversationId: context.conversationId,
                userInput: userInput.substring(0, 100),
                error: error instanceof Error ? error.message : String(error),
            });

            // Return fallback routing result
            return this.getFallbackRoutingResult(userInput, error);
        }
    }

    /**
     * Build context-aware routing prompt for LLM
     */
    private buildRoutingPrompt(userInput: string, context: RoutingContext): string {
        let prompt = `用户输入: "${userInput}"\n\n`;

        // Add conversation history context
        if (context.sessionHistory.length > 0) {
            prompt += `对话历史:\n`;
            const recentHistory = context.sessionHistory.slice(-3); // Last 3 turns
            for (const turn of recentHistory) {
                prompt += `- 用户: ${turn.userInput}\n`;
                prompt += `- 智能体(${turn.agentId}): ${turn.agentResponse}\n`;
            }
            prompt += `\n`;
        }

        // Add current context information
        if (context.currentContext && Object.keys(context.currentContext).length > 0) {
            prompt += `当前上下文:\n`;
            for (const [key, value] of Object.entries(context.currentContext)) {
                if (key !== 'userInput') {
                    prompt += `- ${key}: ${value}\n`;
                }
            }
            prompt += `\n`;
        }

        // Add user preferences if available
        if (context.userPreferences && Object.keys(context.userPreferences).length > 0) {
            prompt += `用户偏好:\n`;
            for (const [key, value] of Object.entries(context.userPreferences)) {
                prompt += `- ${key}: ${value}\n`;
            }
            prompt += `\n`;
        }

        prompt += `请分析这个请求并决定应该路由到哪个智能体。`;

        return prompt;
    }

    /**
     * Get system prompt for LLM routing
     */
    private getRoutingSystemPrompt(): string {
        return `你是一个专业的智能体路由系统，负责分析用户请求并决定将其路由到最合适的智能体。

可用的智能体类型：

1. **inventory** (库存智能体)
   - 处理库存管理相关请求
   - 关键词：库存、消耗、添加、剩余、照片识别、物品管理
   - 示例：查询库存、添加物品、消耗记录、照片识别

2. **procurement** (采购智能体)
   - 处理采购和订单管理相关请求
   - 关键词：采购、购买、订单、导入、建议、购物清单
   - 示例：导入订单、生成采购建议、管理购物清单

3. **finance** (财务智能体)
   - 处理财务分析和报告相关请求
   - 关键词：财务、支出、分析、报告、预算、花费
   - 示例：支出分析、财务报告、预算监控

4. **notification** (通知智能体)
   - 处理通知和提醒相关请求
   - 关键词：通知、提醒、告知、发送、推送
   - 示例：发送通知、设置提醒、通知偏好

请以JSON格式返回路由决策，包含以下字段：
{
  "targetAgent": "智能体类型",
  "confidence": 0.0-1.0的置信度,
  "reasoning": "详细的路由理由",
  "extractedEntities": {
    "实体类型": "实体值"
  },
  "suggestedActions": ["建议的操作1", "建议的操作2"],
  "contextualInfo": "基于上下文的额外信息"
}

分析原则：
1. 仔细分析用户输入的核心意图
2. 考虑对话历史和上下文信息
3. 提取关键实体（物品名称、数量、时间等）
4. 提供清晰的路由理由
5. 给出具体的操作建议
6. 置信度应该反映路由决策的确定性`;
    }

    /**
     * Parse LLM routing response
     */
    private parseLLMRoutingResponse(response: string, userInput: string): IntelligentRoutingResult {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in LLM response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                targetAgent: parsed.targetAgent || this.config.fallbackAgent,
                confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
                reasoning: parsed.reasoning || 'LLM路由决策',
                extractedEntities: parsed.extractedEntities || {},
                suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
                contextualInfo: parsed.contextualInfo || '',
            };
        } catch (error) {
            this.logger.warn('Failed to parse LLM routing response, using fallback', {
                response: response.substring(0, 200),
                error: error instanceof Error ? error.message : String(error),
            });

            // Fallback to pattern-based routing
            return this.getPatternBasedRouting(userInput);
        }
    }

    /**
     * Apply routing logic with confidence threshold and validation
     */
    private applyRoutingLogic(
        routingResult: IntelligentRoutingResult,
        context: RoutingContext
    ): IntelligentRoutingResult {
        // Validate target agent exists
        if (!this.agents.has(routingResult.targetAgent)) {
            this.logger.warn('Target agent not found, using fallback', {
                targetAgent: routingResult.targetAgent,
                fallbackAgent: this.config.fallbackAgent,
            });

            routingResult.targetAgent = this.config.fallbackAgent;
            routingResult.confidence = Math.max(0.3, routingResult.confidence - 0.2);
            routingResult.reasoning += ' (已切换到备用智能体)';
        }

        // Apply confidence threshold
        if (routingResult.confidence < this.config.confidenceThreshold) {
            this.logger.debug('Confidence below threshold, applying context boost', {
                originalConfidence: routingResult.confidence,
                threshold: this.config.confidenceThreshold,
            });

            // Try to boost confidence based on context
            const contextBoost = this.calculateContextBoost(routingResult, context);
            routingResult.confidence += contextBoost;

            if (routingResult.confidence < this.config.confidenceThreshold) {
                routingResult.targetAgent = this.config.fallbackAgent;
                routingResult.reasoning += ' (置信度不足，使用备用智能体)';
            }
        }

        return routingResult;
    }

    /**
     * Calculate confidence boost based on context
     */
    private calculateContextBoost(
        routingResult: IntelligentRoutingResult,
        context: RoutingContext
    ): number {
        let boost = 0;

        // Boost based on recent agent usage
        if (context.sessionHistory.length > 0) {
            const recentAgents = context.sessionHistory
                .slice(-3)
                .map(turn => this.extractAgentTypeFromId(turn.agentId))
                .filter(Boolean);

            if (recentAgents.includes(routingResult.targetAgent)) {
                boost += 0.1;
            }
        }

        // Boost based on entity completeness
        const entityCount = Object.keys(routingResult.extractedEntities).length;
        if (entityCount > 2) {
            boost += 0.1;
        }

        return Math.min(boost, 0.3); // Cap boost at 0.3
    }

    /**
     * Get pattern-based routing as fallback
     */
    private getPatternBasedRouting(userInput: string): IntelligentRoutingResult {
        const input = userInput.toLowerCase();

        // Simple pattern matching for fallback
        if (/库存|消耗|添加|剩余|照片|扫描/.test(input)) {
            return {
                targetAgent: 'inventory',
                confidence: 0.6,
                reasoning: '基于关键词匹配的库存管理路由',
                extractedEntities: {},
                suggestedActions: ['查询库存', '更新库存'],
                contextualInfo: '检测到库存相关关键词',
            };
        }

        if (/采购|购买|订单|导入|建议/.test(input)) {
            return {
                targetAgent: 'procurement',
                confidence: 0.6,
                reasoning: '基于关键词匹配的采购管理路由',
                extractedEntities: {},
                suggestedActions: ['查看订单', '生成建议'],
                contextualInfo: '检测到采购相关关键词',
            };
        }

        if (/财务|支出|分析|报告|预算/.test(input)) {
            return {
                targetAgent: 'finance',
                confidence: 0.6,
                reasoning: '基于关键词匹配的财务管理路由',
                extractedEntities: {},
                suggestedActions: ['查看报告', '分析支出'],
                contextualInfo: '检测到财务相关关键词',
            };
        }

        if (/通知|提醒|告知|发送/.test(input)) {
            return {
                targetAgent: 'notification',
                confidence: 0.6,
                reasoning: '基于关键词匹配的通知管理路由',
                extractedEntities: {},
                suggestedActions: ['发送通知', '设置提醒'],
                contextualInfo: '检测到通知相关关键词',
            };
        }

        // Default fallback
        return {
            targetAgent: this.config.fallbackAgent,
            confidence: 0.3,
            reasoning: '无法识别明确意图，使用默认智能体',
            extractedEntities: {},
            suggestedActions: ['请提供更具体的请求'],
            contextualInfo: '建议提供更详细的描述',
        };
    }

    /**
     * Get fallback routing result for errors
     */
    private getFallbackRoutingResult(userInput: string, error: any): IntelligentRoutingResult {
        return {
            targetAgent: this.config.fallbackAgent,
            confidence: 0.2,
            reasoning: `路由过程出现错误，使用备用智能体: ${error instanceof Error ? error.message : String(error)}`,
            extractedEntities: {},
            suggestedActions: ['请重新描述您的需求'],
            contextualInfo: '系统遇到了一些问题，请稍后重试',
        };
    }

    /**
     * Store routing decision for learning
     */
    private async storeRoutingDecision(
        conversationId: string,
        routingResult: IntelligentRoutingResult
    ): Promise<void> {
        try {
            const history = this.routingHistory.get(conversationId) || [];
            history.push(routingResult);

            // Keep only recent decisions
            if (history.length > this.config.maxContextHistory) {
                history.splice(0, history.length - this.config.maxContextHistory);
            }

            this.routingHistory.set(conversationId, history);

            // Also store in state manager for persistence
            const conversationState = await this.stateManager.loadConversationState(conversationId);
            if (conversationState) {
                conversationState.agentContext = {
                    ...conversationState.agentContext,
                    routingHistory: history.slice(-5), // Keep last 5 decisions
                };
                await this.stateManager.saveConversationState(conversationId, conversationState);
            }
        } catch (error) {
            this.logger.warn('Failed to store routing decision', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Get conversation context for routing
     */
    async getRoutingContext(conversationId: string, userId: string): Promise<RoutingContext> {
        try {
            const conversationState = await this.stateManager.loadConversationState(conversationId);

            return {
                conversationId,
                userId,
                sessionHistory: conversationState?.history || [],
                currentContext: conversationState?.agentContext || {},
                timestamp: new Date(),
                userPreferences: conversationState?.agentContext?.userPreferences,
            };
        } catch (error) {
            this.logger.warn('Failed to get routing context, using default', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                conversationId,
                userId,
                sessionHistory: [],
                currentContext: {},
                timestamp: new Date(),
            };
        }
    }

    /**
     * Update conversation context after routing
     */
    async updateRoutingContext(
        context: RoutingContext,
        routingResult: IntelligentRoutingResult,
        userInput: string
    ): Promise<void> {
        try {
            const newTurn: ConversationTurn = {
                turnId: uuidv4(),
                userInput,
                agentResponse: '', // Will be filled by the agent
                intent: `${routingResult.targetAgent}_request`,
                entities: routingResult.extractedEntities,
                timestamp: new Date(),
                agentId: routingResult.targetAgent,
            };

            context.sessionHistory.push(newTurn);

            // Limit history size
            if (context.sessionHistory.length > this.config.maxContextHistory) {
                context.sessionHistory = context.sessionHistory.slice(-this.config.maxContextHistory);
            }

            // Update context with routing information
            context.currentContext = {
                ...context.currentContext,
                lastRoutingResult: routingResult,
                lastRoutingTime: new Date(),
            };

            // Save to state manager
            const conversationState: ConversationState = {
                conversationId: context.conversationId,
                userId: context.userId,
                currentIntent: `${routingResult.targetAgent}_request`,
                entities: routingResult.extractedEntities,
                history: context.sessionHistory,
                lastActivity: new Date(),
                agentContext: context.currentContext,
            };

            await this.stateManager.saveConversationState(context.conversationId, conversationState);
        } catch (error) {
            this.logger.error('Failed to update routing context', {
                conversationId: context.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // Helper methods

    private getAgentTypeFromConfig(config: any): AgentType {
        // Extract agent type from agent configuration
        if (config.name?.toLowerCase().includes('inventory')) return 'inventory';
        if (config.name?.toLowerCase().includes('procurement')) return 'procurement';
        if (config.name?.toLowerCase().includes('finance')) return 'finance';
        if (config.name?.toLowerCase().includes('notification')) return 'notification';

        // Fallback to agentId analysis
        if (config.agentId?.toLowerCase().includes('inventory')) return 'inventory';
        if (config.agentId?.toLowerCase().includes('procurement')) return 'procurement';
        if (config.agentId?.toLowerCase().includes('finance')) return 'finance';
        if (config.agentId?.toLowerCase().includes('notification')) return 'notification';

        return this.config.fallbackAgent;
    }

    private extractAgentTypeFromId(agentId: string): AgentType | null {
        if (agentId.includes('inventory')) return 'inventory';
        if (agentId.includes('procurement')) return 'procurement';
        if (agentId.includes('finance')) return 'finance';
        if (agentId.includes('notification')) return 'notification';
        return null;
    }

    /**
     * Get routing statistics
     */
    getRoutingStats(): {
        registeredAgents: number;
        totalRoutingDecisions: number;
        averageConfidence: number;
        agentDistribution: Record<AgentType, number>;
    } {
        let totalDecisions = 0;
        let totalConfidence = 0;
        const agentDistribution: Record<AgentType, number> = {
            inventory: 0,
            procurement: 0,
            finance: 0,
            notification: 0,
        };

        for (const history of Array.from(this.routingHistory.values())) {
            for (const decision of history) {
                totalDecisions++;
                totalConfidence += decision.confidence;
                agentDistribution[decision.targetAgent]++;
            }
        }

        return {
            registeredAgents: this.agents.size,
            totalRoutingDecisions: totalDecisions,
            averageConfidence: totalDecisions > 0 ? totalConfidence / totalDecisions : 0,
            agentDistribution,
        };
    }

    /**
     * Shutdown the router
     */
    async shutdown(): Promise<void> {
        this.agents.clear();
        this.routingHistory.clear();
        this.logger.info('Intelligent Agent Router shutdown completed');
    }
}
