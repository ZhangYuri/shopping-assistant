/**
 * Conversation Manager for multi-turn dialogue context maintenance
 * Handles intent recognition, entity extraction, and agent routing integration
 */

import { ChatDeepSeek } from '@langchain/deepseek';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { Logger } from '../utils/Logger';
import { AgentStateManager, ConversationState, ConversationTurn } from '../state/AgentStateManager';
import { IntelligentAgentRouter, IntelligentRoutingResult, RoutingContext, AgentType } from './IntelligentAgentRouter';
import { MultilingualService, SupportedLanguage, LanguageDetectionResult, TranslationContext } from '../services/MultilingualService';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationContext {
    conversationId: string;
    userId: string;
    currentIntent: string;
    entities: Record<string, any>;
    sessionHistory: ConversationTurn[];
    contextualInfo: Record<string, any>;
    userPreferences: Record<string, any>;
    lastActivity: Date;
    preferredLanguage?: SupportedLanguage;
    detectedLanguage?: SupportedLanguage;
}

export interface IntentRecognitionResult {
    intent: string;
    confidence: number;
    entities: Record<string, any>;
    reasoning: string;
    suggestedClarifications?: string[];
    contextualInfo: string;
}

export interface EntityExtractionResult {
    entities: Record<string, any>;
    confidence: number;
    extractedFields: ExtractedField[];
    missingFields?: string[];
}

export interface ExtractedField {
    fieldName: string;
    value: any;
    confidence: number;
    source: 'user_input' | 'context' | 'inference';
}

export interface ConversationManagerConfig {
    enableLLMIntentRecognition: boolean;
    enableEntityExtraction: boolean;
    enableContextLearning: boolean;
    maxContextHistory: number;
    intentConfidenceThreshold: number;
    entityConfidenceThreshold: number;
    enableClarificationQuestions: boolean;
    maxClarificationAttempts: number;
    fallbackIntent: string;
    enableMultilingualSupport: boolean;
    defaultLanguage: SupportedLanguage;
    languageDetectionThreshold: number;
}

export interface ClarificationRequest {
    requestId: string;
    question: string;
    expectedEntityType: string;
    context: string;
    attempts: number;
    maxAttempts: number;
    originalInput: string;
    missingEntities: string[];
    suggestedResponses: string[];
    timestamp: Date;
}

export interface ClarificationAnalysis {
    needsClarification: boolean;
    reason: string;
    missingEntities: string[];
    ambiguousTerms: string[];
    confidence: number;
    suggestedQuestions: string[];
    guidanceType: 'entity_missing' | 'ambiguous_intent' | 'incomplete_command' | 'context_needed';
}
export interface ConversationResult {
    success: boolean;
    conversationId: string;
    routingResult: IntelligentRoutingResult;
    intentResult: IntentRecognitionResult;
    entityResult: EntityExtractionResult;
    clarificationRequest?: ClarificationRequest;
    updatedContext: ConversationContext;
    error?: string;
    languageDetection?: LanguageDetectionResult;
    metadata: {
        processingTime: number;
        requiresClarification: boolean;
        contextUpdated: boolean;
        detectedLanguage?: SupportedLanguage;
        responseLanguage?: SupportedLanguage;
    };
}

/**
 * ConversationManager handles multi-turn dialogue context maintenance,
 * intent recognition, entity extraction, and integration with AgentRouter
 */
export class ConversationManager {
    private logger: Logger;
    private stateManager: AgentStateManager;
    private agentRouter: IntelligentAgentRouter;
    private llm?: ChatDeepSeek;
    private multilingualService: MultilingualService;
    private config: ConversationManagerConfig;
    private activeConversations: Map<string, ConversationContext> = new Map();
    private clarificationRequests: Map<string, ClarificationRequest> = new Map();

    constructor(
        stateManager: AgentStateManager,
        agentRouter: IntelligentAgentRouter,
        config: Partial<ConversationManagerConfig> = {}
    ) {
        this.stateManager = stateManager;
        this.agentRouter = agentRouter;

        this.config = {
            enableLLMIntentRecognition: true,
            enableEntityExtraction: true,
            enableContextLearning: true,
            maxContextHistory: 20,
            intentConfidenceThreshold: 0.7,
            entityConfidenceThreshold: 0.6,
            enableClarificationQuestions: true,
            maxClarificationAttempts: 3,
            fallbackIntent: 'general_inquiry',
            enableMultilingualSupport: true,
            defaultLanguage: 'zh-CN',
            languageDetectionThreshold: 0.7,
            ...config,
        };

        this.logger = new Logger({
            component: 'ConversationManager',
            level: 'info',
        });

        // Initialize multilingual service
        this.multilingualService = new MultilingualService({
            defaultLanguage: this.config.defaultLanguage,
            confidenceThreshold: this.config.languageDetectionThreshold,
            enableAutoTranslation: this.config.enableMultilingualSupport,
            fallbackToDefault: true
        });

        // Initialize LLM for intent recognition and entity extraction if enabled and API key is available
        if (this.config.enableLLMIntentRecognition && process.env.DEEPSEEK_API_KEY) {
            this.llm = new ChatDeepSeek({
                apiKey: process.env.DEEPSEEK_API_KEY,
                model: 'deepseek-chat',
                temperature: 0.1, // Low temperature for consistent analysis
            });
        }

        this.logger.info('ConversationManager initialized', {
            enableLLMIntentRecognition: this.config.enableLLMIntentRecognition,
            enableEntityExtraction: this.config.enableEntityExtraction,
            enableContextLearning: this.config.enableContextLearning,
            enableMultilingualSupport: this.config.enableMultilingualSupport,
            defaultLanguage: this.config.defaultLanguage,
            hasLLM: !!this.llm,
        });
    }
    /**
     * Process a user message through the complete conversation pipeline
     */
    async processMessage(
        userInput: string,
        conversationId: string,
        userId: string
    ): Promise<ConversationResult> {
        const startTime = Date.now();

        try {
            this.logger.info('Processing user message', {
                conversationId,
                userId,
                inputLength: userInput.length,
            });

            // Load or create conversation context
            let context = await this.getOrCreateConversationContext(conversationId, userId);

            // Detect language if multilingual support is enabled
            let languageDetection: LanguageDetectionResult | undefined;
            if (this.config.enableMultilingualSupport) {
                languageDetection = this.multilingualService.detectLanguage(userInput);
                context.detectedLanguage = languageDetection.language;

                // Update preferred language if not set or if detection confidence is high
                if (!context.preferredLanguage || languageDetection.confidence > 0.8) {
                    context.preferredLanguage = languageDetection.language;
                }

                this.logger.debug('Language detected', {
                    conversationId,
                    detectedLanguage: languageDetection.language,
                    confidence: languageDetection.confidence,
                    reasoning: languageDetection.reasoning
                });
            }

            // Check if this is a response to a clarification request
            const pendingClarification = this.clarificationRequests.get(conversationId);
            if (pendingClarification) {
                return await this.processClarificationResponse(
                    userInput,
                    conversationId,
                    userId,
                    context,
                    pendingClarification,
                    startTime
                );
            }

            // Perform intent recognition
            const intentResult = await this.recognizeIntent(userInput, context);

            // Perform entity extraction
            const entityResult = await this.extractEntities(userInput, context, intentResult);

            // Check if clarification is needed
            const clarificationResult = await this.checkForClarificationNeeds(
                userInput,
                intentResult,
                entityResult,
                context
            );

            if (clarificationResult.needsClarification) {
                return await this.handleClarificationRequest(
                    conversationId,
                    userId,
                    context,
                    clarificationResult,
                    intentResult,
                    entityResult,
                    Date.now() - startTime
                );
            }

            // Create routing context
            const routingContext: RoutingContext = {
                conversationId,
                userId,
                sessionHistory: context.sessionHistory,
                currentContext: {
                    ...context.contextualInfo,
                    intent: intentResult.intent,
                    entities: entityResult.entities,
                },
                timestamp: new Date(),
                userPreferences: context.userPreferences,
            };

            // Perform intelligent routing
            const routingResult = await this.agentRouter.routeIntelligently(userInput, routingContext);

            // Update conversation context
            context = await this.updateConversationContext(
                context,
                userInput,
                intentResult,
                entityResult,
                routingResult
            );

            // Update routing context with new information
            await this.agentRouter.updateRoutingContext(routingContext, routingResult, userInput);

            const processingTime = Date.now() - startTime;

            this.logger.info('Message processing completed', {
                conversationId,
                intent: intentResult.intent,
                targetAgent: routingResult.targetAgent,
                processingTime,
                detectedLanguage: languageDetection?.language,
            });

            return {
                success: true,
                conversationId,
                routingResult,
                intentResult,
                entityResult,
                updatedContext: context,
                languageDetection,
                metadata: {
                    processingTime,
                    requiresClarification: false,
                    contextUpdated: true,
                    detectedLanguage: languageDetection?.language,
                    responseLanguage: context.preferredLanguage || this.config.defaultLanguage,
                },
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.logger.error('Message processing failed', {
                conversationId,
                userId,
                error: errorMessage,
                processingTime,
            });

            // Return fallback result
            return this.createFallbackResult(
                conversationId,
                userInput,
                errorMessage,
                processingTime
            );
        }
    }
    /**
     * Recognize intent from user input using rule-based approach
     */
    private async recognizeIntent(
        userInput: string,
        context: ConversationContext
    ): Promise<IntentRecognitionResult> {
        try {
            return await this.performRuleBasedIntentRecognition(userInput, context);
        } catch (error) {
            this.logger.warn('Intent recognition failed, using fallback', {
                conversationId: context.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            return this.getFallbackIntentResult(userInput);
        }
    }

    /**
     * Perform rule-based intent recognition
     */
    private async performRuleBasedIntentRecognition(
        userInput: string,
        context: ConversationContext
    ): Promise<IntentRecognitionResult> {
        const input = userInput.toLowerCase();
        let intent = this.config.fallbackIntent;
        let confidence = 0.5;
        let reasoning = '基于规则的意图识别';

        // Define intent patterns
        const intentPatterns = {
            'inventory_management': [
                '库存', '消耗', '添加', '剩余', '物品', '抽纸', '牛奶', '洗发水',
                '照片', '图片', '拍照', '扫描', '识别'
            ],
            'procurement_management': [
                '采购', '购买', '订单', '导入', '建议', '购物清单', '淘宝', '1688',
                '京东', '拼多多', 'excel', '文件'
            ],
            'financial_analysis': [
                '财务', '支出', '分析', '报告', '预算', '花费', '消费', '异常',
                '月度', '季度', '统计'
            ],
            'notification_management': [
                '通知', '提醒', '告知', '发送', '推送', 'teams', '钉钉', '微信'
            ],
            'query_information': [
                '查询', '查看', '显示', '列出', '状态', '情况', '怎么样'
            ],
            'help_request': [
                '帮助', '怎么', '如何', '什么', '为什么', '能否', '可以'
            ]
        };

        // Find best matching intent
        let maxMatches = 0;
        for (const [intentType, keywords] of Object.entries(intentPatterns)) {
            const matches = keywords.filter(keyword => input.includes(keyword)).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                intent = intentType;
                confidence = Math.min(0.9, 0.5 + (matches * 0.1));
                reasoning = `检测到${matches}个相关关键词，匹配意图: ${intentType}`;
            }
        }

        // Extract basic entities
        const entities = this.extractBasicEntitiesFromInput(userInput);

        return {
            intent,
            confidence,
            entities,
            reasoning,
            contextualInfo: `基于关键词匹配的意图识别，置信度: ${confidence}`,
        };
    }
    /**
     * Extract entities from user input
     */
    private async extractEntities(
        userInput: string,
        context: ConversationContext,
        intentResult: IntentRecognitionResult
    ): Promise<EntityExtractionResult> {
        try {
            return await this.performRuleBasedEntityExtraction(userInput, context, intentResult);
        } catch (error) {
            this.logger.warn('Entity extraction failed, using fallback', {
                conversationId: context.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            return this.getFallbackEntityResult(userInput);
        }
    }

    /**
     * Perform rule-based entity extraction
     */
    private async performRuleBasedEntityExtraction(
        userInput: string,
        context: ConversationContext,
        intentResult: IntentRecognitionResult
    ): Promise<EntityExtractionResult> {
        const entities = this.extractBasicEntitiesFromInput(userInput);
        const extractedFields: ExtractedField[] = [];

        // Convert entities to extracted fields format
        for (const [fieldName, value] of Object.entries(entities)) {
            extractedFields.push({
                fieldName,
                value,
                confidence: 0.7,
                source: 'user_input',
            });
        }

        return {
            entities,
            confidence: 0.7,
            extractedFields,
        };
    }

    /**
     * Update conversation context with new information
     */
    private async updateConversationContext(
        context: ConversationContext,
        userInput: string,
        intentResult: IntentRecognitionResult,
        entityResult: EntityExtractionResult,
        routingResult: IntelligentRoutingResult
    ): Promise<ConversationContext> {
        // Create new conversation turn
        const newTurn: ConversationTurn = {
            turnId: uuidv4(),
            userInput,
            agentResponse: '', // Will be filled by the agent
            intent: intentResult.intent,
            entities: entityResult.entities,
            timestamp: new Date(),
            agentId: routingResult.targetAgent,
        };

        // Update context
        context.sessionHistory.push(newTurn);
        context.currentIntent = intentResult.intent;
        context.entities = { ...context.entities, ...entityResult.entities };
        context.lastActivity = new Date();

        // Update contextual info
        context.contextualInfo = {
            ...context.contextualInfo,
            lastIntent: intentResult.intent,
            lastEntities: entityResult.entities,
            lastRoutingResult: routingResult,
            preferredLanguage: context.preferredLanguage,
            detectedLanguage: context.detectedLanguage,
        };

        // Limit history size
        if (context.sessionHistory.length > this.config.maxContextHistory) {
            context.sessionHistory = context.sessionHistory.slice(-this.config.maxContextHistory);
        }

        // Save to state manager
        const conversationState: ConversationState = {
            conversationId: context.conversationId,
            userId: context.userId,
            currentIntent: context.currentIntent,
            entities: context.entities,
            history: context.sessionHistory,
            lastActivity: context.lastActivity,
            agentContext: context.contextualInfo,
        };

        await this.stateManager.saveConversationState(context.conversationId, conversationState);

        // Update active conversations cache
        this.activeConversations.set(context.conversationId, context);

        return context;
    }
    /**
     * Get or create conversation context
     */
    private async getOrCreateConversationContext(
        conversationId: string,
        userId: string
    ): Promise<ConversationContext> {
        // Check active conversations cache first
        let context = this.activeConversations.get(conversationId);
        if (context) {
            return context;
        }

        // Try to load from state manager
        const conversationState = await this.stateManager.loadConversationState(conversationId);
        if (conversationState) {
            context = {
                conversationId: conversationState.conversationId,
                userId: conversationState.userId,
                currentIntent: conversationState.currentIntent,
                entities: conversationState.entities,
                sessionHistory: conversationState.history,
                contextualInfo: conversationState.agentContext || {},
                userPreferences: {},
                lastActivity: conversationState.lastActivity,
                preferredLanguage: conversationState.agentContext?.preferredLanguage,
                detectedLanguage: conversationState.agentContext?.detectedLanguage,
            };
        } else {
            // Create new context
            context = {
                conversationId,
                userId,
                currentIntent: this.config.fallbackIntent,
                entities: {},
                sessionHistory: [],
                contextualInfo: {},
                userPreferences: {},
                lastActivity: new Date(),
                preferredLanguage: this.config.defaultLanguage,
            };
        }

        // Cache the context
        this.activeConversations.set(conversationId, context);
        return context;
    }

    private extractBasicEntitiesFromInput(userInput: string): Record<string, any> {
        const entities: Record<string, any> = {};
        const input = userInput.toLowerCase();

        // Extract numbers (quantities)
        const numbers = userInput.match(/\d+/g);
        if (numbers) {
            entities.quantities = numbers.map(n => parseInt(n));
            if (entities.quantities.length === 1) {
                entities.quantity = entities.quantities[0];
            }
        }

        // Extract common items
        const commonItems = ['抽纸', '牛奶', '洗发水', '牙膏', '面包', '鸡蛋', '大米', '油', '洗衣液'];
        for (const item of commonItems) {
            if (input.includes(item)) {
                entities.items = entities.items || [];
                entities.items.push(item);
                if (!entities.item_name) {
                    entities.item_name = item;
                }
            }
        }

        // Extract actions
        const actions = ['消耗', '添加', '查询', '更新', '导入', '分析', '发送', '删除', '修改'];
        for (const action of actions) {
            if (input.includes(action)) {
                entities.actions = entities.actions || [];
                entities.actions.push(action);
                if (!entities.action) {
                    entities.action = action;
                }
            }
        }

        // Extract platforms
        const platforms = ['淘宝', '1688', '京东', '拼多多', '抖音', '中免日上', 'teams'];
        for (const platform of platforms) {
            if (input.includes(platform)) {
                entities.platforms = entities.platforms || [];
                entities.platforms.push(platform);
                if (!entities.platform) {
                    entities.platform = platform;
                }
            }
        }

        // Extract units
        const units = ['包', '个', '瓶', '盒', '袋', '斤', '公斤', '升', '毫升'];
        for (const unit of units) {
            if (input.includes(unit)) {
                entities.unit = unit;
                break;
            }
        }

        return entities;
    }
    private getFallbackIntentResult(userInput: string): IntentRecognitionResult {
        return {
            intent: this.config.fallbackIntent,
            confidence: 0.3,
            entities: this.extractBasicEntitiesFromInput(userInput),
            reasoning: '意图识别失败，使用默认意图',
            contextualInfo: '建议提供更清晰的描述',
        };
    }

    private getFallbackEntityResult(userInput: string): EntityExtractionResult {
        const entities = this.extractBasicEntitiesFromInput(userInput);
        const extractedFields: ExtractedField[] = [];

        for (const [fieldName, value] of Object.entries(entities)) {
            extractedFields.push({
                fieldName,
                value,
                confidence: 0.5,
                source: 'user_input',
            });
        }

        return {
            entities,
            confidence: 0.5,
            extractedFields,
        };
    }

    private createFallbackResult(
        conversationId: string,
        userInput: string,
        error: string,
        processingTime: number
    ): ConversationResult {
        // Detect language for error messages
        let languageDetection: LanguageDetectionResult | undefined;
        if (this.config.enableMultilingualSupport) {
            languageDetection = this.multilingualService.detectLanguage(userInput);
        }

        const targetLanguage = languageDetection?.language || this.config.defaultLanguage;
        const errorMessage = this.config.enableMultilingualSupport
            ? this.multilingualService.getLocalizedTemplate('processing_error', targetLanguage)
            : '处理失败';
        const suggestedAction = targetLanguage === 'en-US'
            ? 'Please describe your request again'
            : '请重新描述您的需求';
        const contextInfo = targetLanguage === 'en-US'
            ? 'The system encountered some issues'
            : '系统遇到了一些问题';

        return {
            success: false,
            conversationId,
            routingResult: {
                targetAgent: 'inventory',
                confidence: 0.2,
                reasoning: `${errorMessage}: ${error}`,
                extractedEntities: {},
                suggestedActions: [suggestedAction],
                contextualInfo: contextInfo,
            },
            intentResult: this.getFallbackIntentResult(userInput),
            entityResult: this.getFallbackEntityResult(userInput),
            updatedContext: {
                conversationId,
                userId: 'unknown',
                currentIntent: this.config.fallbackIntent,
                entities: {},
                sessionHistory: [],
                contextualInfo: {},
                userPreferences: {},
                lastActivity: new Date(),
                preferredLanguage: targetLanguage,
                detectedLanguage: languageDetection?.language,
            },
            error,
            languageDetection,
            metadata: {
                processingTime,
                requiresClarification: false,
                contextUpdated: false,
                detectedLanguage: languageDetection?.language,
                responseLanguage: targetLanguage,
            },
        };
    }

    /**
     * Get conversation statistics
     */
    getConversationStats(): {
        activeConversations: number;
        pendingClarifications: number;
        totalProcessedMessages: number;
    } {
        return {
            activeConversations: this.activeConversations.size,
            pendingClarifications: this.clarificationRequests.size,
            totalProcessedMessages: 0, // Would need to track this
        };
    }

    /**
     * Get pending clarification request for a conversation
     */
    getPendingClarification(conversationId: string): ClarificationRequest | undefined {
        return this.clarificationRequests.get(conversationId);
    }

    /**
     * Cancel pending clarification request
     */
    cancelClarificationRequest(conversationId: string): boolean {
        return this.clarificationRequests.delete(conversationId);
    }

    /**
     * Clear conversation context
     */
    async clearConversationContext(conversationId: string): Promise<void> {
        this.activeConversations.delete(conversationId);
        this.clarificationRequests.delete(conversationId);
        await this.stateManager.deleteConversationState(conversationId);

        this.logger.info('Conversation context cleared', { conversationId });
    }

    /**
     * Check if user input needs clarification
     */
    private async checkForClarificationNeeds(
        userInput: string,
        intentResult: IntentRecognitionResult,
        entityResult: EntityExtractionResult,
        context: ConversationContext
    ): Promise<ClarificationAnalysis> {
        if (!this.config.enableClarificationQuestions) {
            return {
                needsClarification: false,
                reason: 'Clarification disabled',
                missingEntities: [],
                ambiguousTerms: [],
                confidence: 1.0,
                suggestedQuestions: [],
                guidanceType: 'entity_missing',
            };
        }

        const analysis: ClarificationAnalysis = {
            needsClarification: false,
            reason: '',
            missingEntities: [],
            ambiguousTerms: [],
            confidence: intentResult.confidence,
            suggestedQuestions: [],
            guidanceType: 'entity_missing',
        };

        // Check for low confidence intent recognition - only for very unclear inputs
        if (intentResult.confidence < 0.5) {
            analysis.needsClarification = true;
            analysis.reason = '意图识别置信度过低';
            analysis.guidanceType = 'ambiguous_intent';
            analysis.suggestedQuestions = this.generateIntentClarificationQuestions(
                userInput,
                intentResult,
                context.preferredLanguage
            );
            return analysis;
        }

        // Check for missing critical entities based on intent
        const missingEntities = this.detectMissingEntities(intentResult.intent, entityResult.entities);
        if (missingEntities.length > 0) {
            analysis.needsClarification = true;
            analysis.reason = '缺少关键信息';
            analysis.missingEntities = missingEntities;
            analysis.guidanceType = 'entity_missing';
            analysis.suggestedQuestions = this.generateEntityClarificationQuestions(
                intentResult.intent,
                missingEntities,
                entityResult.entities,
                context.preferredLanguage
            );
            return analysis;
        }

        // Check for ambiguous terms
        const ambiguousTerms = this.detectAmbiguousTerms(userInput, intentResult.intent);
        if (ambiguousTerms.length > 0) {
            analysis.needsClarification = true;
            analysis.reason = '存在模糊表达';
            analysis.ambiguousTerms = ambiguousTerms;
            analysis.guidanceType = 'context_needed';
            analysis.suggestedQuestions = this.generateAmbiguityResolutionQuestions(ambiguousTerms, userInput);
            return analysis;
        }

        // Check for incomplete commands
        if (this.isIncompleteCommand(userInput, intentResult.intent, entityResult.entities)) {
            analysis.needsClarification = true;
            analysis.reason = '命令不完整';
            analysis.guidanceType = 'incomplete_command';
            analysis.suggestedQuestions = this.generateCompletionQuestions(userInput, intentResult.intent);
            return analysis;
        }

        return analysis;
    }

    /**
     * Generate clarification questions for ambiguous intent
     */
    private generateIntentClarificationQuestions(
        userInput: string,
        intentResult: IntentRecognitionResult,
        language?: SupportedLanguage
    ): string[] {
        const targetLanguage = language || this.config.defaultLanguage;
        const questions: string[] = [];

        // Provide specific intent options based on keywords
        const input = userInput.toLowerCase();

        if (targetLanguage === 'en-US') {
            if (input.includes('query') || input.includes('check') || input.includes('view')) {
                questions.push('Do you want to query inventory information, order status, or financial reports?');
            } else if (input.includes('add') || input.includes('increase')) {
                questions.push('Do you want to add inventory items, import new orders, or perform other operations?');
            } else if (input.includes('analyze') || input.includes('report')) {
                questions.push('What type of analysis do you need? Inventory analysis, procurement analysis, or financial analysis?');
            } else {
                questions.push('Please describe more specifically what operation you want to perform.');
                questions.push('You can say: query inventory, import orders, generate reports, send notifications, etc.');
            }
        } else {
            // Chinese (default)
            if (input.includes('查询') || input.includes('查看')) {
                questions.push('您是想查询库存信息、订单状态、还是财务报告？');
            } else if (input.includes('添加') || input.includes('增加')) {
                questions.push('您是想添加库存物品、导入新订单、还是其他操作？');
            } else if (input.includes('分析') || input.includes('报告')) {
                questions.push('您需要哪种类型的分析？库存分析、采购分析、还是财务分析？');
            } else {
                questions.push('请您更具体地描述您想要执行的操作。');
                questions.push('您可以说：查询库存、导入订单、生成报告、发送通知等。');
            }
        }

        return questions;
    }

    /**
     * Generate clarification questions for missing entities
     */
    private generateEntityClarificationQuestions(
        intent: string,
        missingEntities: string[],
        existingEntities: Record<string, any>,
        language?: SupportedLanguage
    ): string[] {
        const targetLanguage = language || this.config.defaultLanguage;

        if (this.config.enableMultilingualSupport) {
            return this.multilingualService.generateClarificationQuestions(
                missingEntities,
                intent,
                targetLanguage
            );
        }

        // Fallback to original Chinese-only implementation
        const questions: string[] = [];

        for (const entity of missingEntities) {
            switch (entity) {
                case 'item_name':
                    if (intent === 'inventory_management') {
                        questions.push('请告诉我具体是哪种物品？比如：抽纸、牛奶、洗发水等。');
                    }
                    break;
                case 'quantity':
                    questions.push('请告诉我具体的数量是多少？');
                    break;
                case 'platform':
                    if (intent === 'procurement_management') {
                        questions.push('请告诉我是哪个平台的订单？比如：淘宝、京东、1688等。');
                    }
                    break;
                case 'time_period':
                    if (intent === 'financial_analysis') {
                        questions.push('请告诉我需要分析哪个时间段？比如：本月、上月、本季度等。');
                    }
                    break;
                case 'action':
                    questions.push('请告诉我您想要执行什么操作？比如：添加、消耗、查询、更新等。');
                    break;
                default:
                    questions.push(`请提供${entity}的具体信息。`);
            }
        }

        return questions;
    }

    /**
     * Generate questions to resolve ambiguous terms
     */
    private generateAmbiguityResolutionQuestions(ambiguousTerms: string[], userInput: string): string[] {
        const questions: string[] = [];

        for (const term of ambiguousTerms) {
            switch (term) {
                case '这个':
                case '那个':
                case '它':
                    questions.push('请具体说明您指的是哪个物品或操作？');
                    break;
                case '一些':
                case '几个':
                case '多少':
                    questions.push('请告诉我具体的数量？');
                    break;
                case '最近':
                case '之前':
                case '以前':
                    questions.push('请告诉我具体的时间范围？比如：昨天、上周、上个月等。');
                    break;
                default:
                    questions.push(`请澄清"${term}"的具体含义。`);
            }
        }

        return questions;
    }

    /**
     * Generate questions to complete incomplete commands
     */
    private generateCompletionQuestions(userInput: string, intent: string): string[] {
        const questions: string[] = [];

        switch (intent) {
            case 'inventory_management':
                questions.push('请告诉我您想对库存执行什么操作？比如：查询、添加、消耗、更新等。');
                break;
            case 'procurement_management':
                questions.push('请告诉我您想执行什么采购操作？比如：导入订单、生成建议、管理购物清单等。');
                break;
            case 'financial_analysis':
                questions.push('请告诉我您需要什么类型的财务分析？比如：支出报告、预算分析、异常检测等。');
                break;
            case 'notification_management':
                questions.push('请告诉我您想发送什么类型的通知？比如：库存提醒、采购建议、财务报告等。');
                break;
            default:
                questions.push('请提供更多详细信息以便我更好地帮助您。');
        }

        return questions;
    }

    /**
     * Detect missing critical entities for a given intent
     */
    private detectMissingEntities(intent: string, entities: Record<string, any>): string[] {
        const missing: string[] = [];

        switch (intent) {
            case 'inventory_management':
                if (!entities.item_name && !entities.items) {
                    // Only require item name for specific operations
                    if (entities.action && ['添加', '消耗', '更新'].includes(entities.action)) {
                        missing.push('item_name');
                    }
                }
                if (entities.action && ['添加', '消耗'].includes(entities.action) && !entities.quantity && !entities.quantities) {
                    missing.push('quantity');
                }
                break;

            case 'procurement_management':
                if (entities.action === '导入' && !entities.platform && !entities.platforms) {
                    missing.push('platform');
                }
                break;

            case 'financial_analysis':
                if (entities.action === '分析' && !entities.time_period) {
                    // Time period is helpful but not always required
                    // missing.push('time_period');
                }
                break;

            case 'notification_management':
                // Notification management usually doesn't require specific entities
                break;
        }

        return missing;
    }

    /**
     * Detect ambiguous terms in user input
     */
    private detectAmbiguousTerms(userInput: string, intent: string): string[] {
        const ambiguous: string[] = [];
        const input = userInput.toLowerCase();

        // Common ambiguous pronouns and terms
        const ambiguousPatterns = [
            '这个', '那个', '它', '他', '她',
            '一些', '几个', '多少', '很多', '少量',
            '最近', '之前', '以前', '后来', '刚才',
            '东西', '物品', '商品', '那些', '这些'
        ];

        for (const pattern of ambiguousPatterns) {
            if (input.includes(pattern)) {
                ambiguous.push(pattern);
            }
        }

        return ambiguous;
    }

    /**
     * Check if a command is incomplete
     */
    private isIncompleteCommand(userInput: string, intent: string, entities: Record<string, any>): boolean {
        const input = userInput.trim().toLowerCase();

        // Very short inputs are likely incomplete
        if (input.length < 3) {
            return true;
        }

        // Single word commands without context
        if (input.split(/\s+/).length === 1) {
            const singleWords = ['查询', '添加', '导入', '分析', '发送', '更新', '删除'];
            if (singleWords.includes(input)) {
                return true;
            }
        }

        // Commands that start with action words but lack objects
        if (intent === 'inventory_management') {
            if ((input.includes('添加') || input.includes('消耗')) && !entities.item_name && !entities.items) {
                return true;
            }
        }

        if (intent === 'procurement_management') {
            if (input.includes('导入') && !entities.platform && !entities.platforms) {
                return true;
            }
        }

        return false;
    }

    /**
     * Handle clarification request
     */
    private async handleClarificationRequest(
        conversationId: string,
        userId: string,
        context: ConversationContext,
        clarificationAnalysis: ClarificationAnalysis,
        intentResult: IntentRecognitionResult,
        entityResult: EntityExtractionResult,
        processingTime: number
    ): Promise<ConversationResult> {
        const requestId = uuidv4();
        const existingRequest = this.clarificationRequests.get(conversationId);
        const attempts = existingRequest ? existingRequest.attempts + 1 : 1;

        // Check if we've exceeded max attempts
        if (attempts > this.config.maxClarificationAttempts) {
            this.clarificationRequests.delete(conversationId);

            this.logger.warn('Max clarification attempts exceeded', {
                conversationId,
                attempts,
                maxAttempts: this.config.maxClarificationAttempts,
            });

            // Proceed with best effort processing
            const routingContext: RoutingContext = {
                conversationId,
                userId,
                sessionHistory: context.sessionHistory,
                currentContext: {
                    ...context.contextualInfo,
                    intent: intentResult.intent,
                    entities: entityResult.entities,
                },
                timestamp: new Date(),
                userPreferences: context.userPreferences,
            };

            const routingResult = await this.agentRouter.routeIntelligently(
                `${clarificationAnalysis.reason}，尝试处理：${context.sessionHistory[context.sessionHistory.length - 1]?.userInput || ''}`,
                routingContext
            );

            return {
                success: true,
                conversationId,
                routingResult,
                intentResult,
                entityResult,
                updatedContext: context,
                metadata: {
                    processingTime,
                    requiresClarification: false,
                    contextUpdated: true,
                },
            };
        }

        // Create clarification request
        const clarificationRequest: ClarificationRequest = {
            requestId,
            question: this.formatClarificationQuestion(
                clarificationAnalysis,
                context.preferredLanguage
            ),
            expectedEntityType: clarificationAnalysis.missingEntities[0] || 'general',
            context: clarificationAnalysis.reason,
            attempts,
            maxAttempts: this.config.maxClarificationAttempts,
            originalInput: context.sessionHistory[context.sessionHistory.length - 1]?.userInput || '',
            missingEntities: clarificationAnalysis.missingEntities,
            suggestedResponses: this.generateSuggestedResponses(
                clarificationAnalysis,
                context.preferredLanguage
            ),
            timestamp: new Date(),
        };

        // Store clarification request
        this.clarificationRequests.set(conversationId, clarificationRequest);

        this.logger.info('Clarification request generated', {
            conversationId,
            requestId,
            reason: clarificationAnalysis.reason,
            attempts,
            guidanceType: clarificationAnalysis.guidanceType,
        });

        // Create a mock routing result for clarification
        const clarificationRoutingResult = {
            targetAgent: 'inventory' as const,
            confidence: 0.9,
            reasoning: '需要用户澄清信息',
            extractedEntities: entityResult.entities,
            suggestedActions: ['提供澄清信息'],
            contextualInfo: '等待用户响应澄清问题',
        };

        return {
            success: true,
            conversationId,
            routingResult: clarificationRoutingResult,
            intentResult,
            entityResult,
            clarificationRequest,
            updatedContext: context,
            metadata: {
                processingTime,
                requiresClarification: true,
                contextUpdated: true,
                detectedLanguage: context.detectedLanguage,
                responseLanguage: context.preferredLanguage || this.config.defaultLanguage,
            },
        };
    }

    /**
     * Format clarification question with guidance
     */
    private formatClarificationQuestion(
        analysis: ClarificationAnalysis,
        language?: SupportedLanguage
    ): string {
        const targetLanguage = language || this.config.defaultLanguage;
        let question = '';

        // Add context about why clarification is needed using multilingual templates
        if (this.config.enableMultilingualSupport) {
            const templateKey = analysis.guidanceType === 'ambiguous_intent' ? 'intent_clarification' :
                analysis.guidanceType === 'entity_missing' ? 'entity_missing' :
                    analysis.guidanceType === 'incomplete_command' ? 'incomplete_command' :
                        'ambiguous_terms';

            question = this.multilingualService.getLocalizedTemplate(templateKey, targetLanguage);
        } else {
            // Fallback to original Chinese implementation
            switch (analysis.guidanceType) {
                case 'ambiguous_intent':
                    question = '我不太确定您想要执行什么操作。';
                    break;
                case 'entity_missing':
                    question = '为了更好地帮助您，我需要一些额外信息。';
                    break;
                case 'incomplete_command':
                    question = '您的请求似乎不完整。';
                    break;
                case 'context_needed':
                    question = '您的描述中有一些模糊的表达。';
                    break;
            }
        }

        // Add the main clarification questions
        if (analysis.suggestedQuestions.length > 0) {
            question += '\n\n' + analysis.suggestedQuestions.join('\n');
        }

        return question;
    }

    /**
     * Generate suggested responses for clarification
     */
    private generateSuggestedResponses(
        analysis: ClarificationAnalysis,
        language?: SupportedLanguage
    ): string[] {
        const targetLanguage = language || this.config.defaultLanguage;

        if (this.config.enableMultilingualSupport) {
            return this.multilingualService.generateSuggestedResponses(
                analysis.guidanceType,
                analysis.missingEntities,
                targetLanguage
            );
        }

        // Fallback to original Chinese-only implementation
        const suggestions: string[] = [];

        switch (analysis.guidanceType) {
            case 'ambiguous_intent':
                suggestions.push('查询库存', '添加物品', '导入订单', '生成报告');
                break;
            case 'entity_missing':
                if (analysis.missingEntities.includes('item_name')) {
                    suggestions.push('抽纸', '牛奶', '洗发水', '面包');
                }
                if (analysis.missingEntities.includes('quantity')) {
                    suggestions.push('1个', '2包', '3瓶', '5盒');
                }
                if (analysis.missingEntities.includes('platform')) {
                    suggestions.push('淘宝', '京东', '1688', '拼多多');
                }
                break;
            case 'incomplete_command':
                suggestions.push('查询抽纸库存', '添加牛奶2瓶', '导入淘宝订单', '生成月度报告');
                break;
            case 'context_needed':
                suggestions.push('请提供更具体的描述');
                break;
        }

        return suggestions;
    }

    /**
     * Process user response to clarification request
     */
    private async processClarificationResponse(
        userInput: string,
        conversationId: string,
        userId: string,
        context: ConversationContext,
        clarificationRequest: ClarificationRequest,
        startTime: number
    ): Promise<ConversationResult> {
        this.logger.info('Processing clarification response', {
            conversationId,
            requestId: clarificationRequest.requestId,
            attempts: clarificationRequest.attempts,
        });

        // Remove the clarification request
        this.clarificationRequests.delete(conversationId);

        // Combine original input with clarification response
        const combinedInput = `${clarificationRequest.originalInput} ${userInput}`.trim();

        // Re-process with combined input
        const intentResult = await this.recognizeIntent(combinedInput, context);
        const entityResult = await this.extractEntities(combinedInput, context, intentResult);

        // Create routing context
        const routingContext: RoutingContext = {
            conversationId,
            userId,
            sessionHistory: context.sessionHistory,
            currentContext: {
                ...context.contextualInfo,
                intent: intentResult.intent,
                entities: entityResult.entities,
                clarificationProvided: true,
                originalInput: clarificationRequest.originalInput,
                clarificationResponse: userInput,
            },
            timestamp: new Date(),
            userPreferences: context.userPreferences,
        };

        // Perform intelligent routing
        const routingResult = await this.agentRouter.routeIntelligently(combinedInput, routingContext);

        // Update conversation context
        context = await this.updateConversationContext(
            context,
            combinedInput,
            intentResult,
            entityResult,
            routingResult
        );

        // Update routing context with new information
        await this.agentRouter.updateRoutingContext(routingContext, routingResult, combinedInput);

        const processingTime = Date.now() - startTime;

        this.logger.info('Clarification response processed successfully', {
            conversationId,
            combinedInput: combinedInput.substring(0, 100),
            targetAgent: routingResult.targetAgent,
            processingTime,
        });

        // Detect language for the clarification response
        let responseLanguageDetection: LanguageDetectionResult | undefined;
        if (this.config.enableMultilingualSupport) {
            responseLanguageDetection = this.multilingualService.detectLanguage(userInput);
            // Update context language if needed
            if (responseLanguageDetection.confidence > 0.8) {
                context.detectedLanguage = responseLanguageDetection.language;
                context.preferredLanguage = responseLanguageDetection.language;
            }
        }

        return {
            success: true,
            conversationId,
            routingResult,
            intentResult,
            entityResult,
            updatedContext: context,
            languageDetection: responseLanguageDetection,
            metadata: {
                processingTime,
                requiresClarification: false,
                contextUpdated: true,
                detectedLanguage: responseLanguageDetection?.language,
                responseLanguage: context.preferredLanguage || this.config.defaultLanguage,
            },
        };
    }

    /**
     * Get preferred language for a conversation
     */
    getPreferredLanguage(conversationId: string): SupportedLanguage | undefined {
        const context = this.activeConversations.get(conversationId);
        return context?.preferredLanguage;
    }

    /**
     * Set preferred language for a conversation
     */
    async setPreferredLanguage(conversationId: string, language: SupportedLanguage): Promise<void> {
        const context = this.activeConversations.get(conversationId);
        if (context) {
            context.preferredLanguage = language;

            // Update in state manager
            const conversationState: ConversationState = {
                conversationId: context.conversationId,
                userId: context.userId,
                currentIntent: context.currentIntent,
                entities: context.entities,
                history: context.sessionHistory,
                lastActivity: context.lastActivity,
                agentContext: {
                    ...context.contextualInfo,
                    preferredLanguage: language,
                },
            };

            await this.stateManager.saveConversationState(conversationId, conversationState);

            this.logger.info('Preferred language updated', {
                conversationId,
                language,
            });
        }
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages(): SupportedLanguage[] {
        return this.multilingualService.getSupportedLanguages();
    }

    /**
     * Detect language of input text
     */
    detectLanguage(text: string): LanguageDetectionResult {
        return this.multilingualService.detectLanguage(text);
    }

    /**
     * Shutdown the conversation manager
     */
    async shutdown(): Promise<void> {
        this.activeConversations.clear();
        this.clarificationRequests.clear();
        this.logger.info('ConversationManager shutdown completed');
    }
}
