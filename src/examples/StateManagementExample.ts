/**
 * Example demonstrating LangChain state management integration
 * Shows how to use AgentStateManager and LangGraphWorkflowEngine
 */

import { StateManagementIntegration } from '../integration/StateManagementIntegration';
import { AgentStateManager, ConversationState } from '../state/AgentStateManager';
import { LangGraphWorkflowEngine } from '../workflows/LangGraphWorkflowEngine';
import { createConfiguredStateManagement, getStateManagementConfig } from '../config/StateManagementConfig';
import { Logger } from '../utils/Logger';

/**
 * Example class demonstrating state management usage
 */
export class StateManagementExample {
    private logger: Logger;
    private stateManager: AgentStateManager;
    private workflowEngine: LangGraphWorkflowEngine;
    private integration: StateManagementIntegration;

    constructor() {
        this.logger = new Logger({
            component: 'StateManagementExample',
            level: 'info',
        });

        // Create configured state management system
        const { stateManager, workflowEngine } = createConfiguredStateManagement('development');
        this.stateManager = stateManager;
        this.workflowEngine = workflowEngine;

        // Create integration helper
        this.integration = new StateManagementIntegration({
            environment: 'development',
            enableMCPIntegration: true,
            enableAgentIntegration: true,
            enableWorkflowIntegration: true,
        });

        this.logger.info('State management example initialized');
    }

    /**
     * Example 1: Conversation state management
     */
    async demonstrateConversationState(): Promise<void> {
        this.logger.info('=== Conversation State Management Example ===');

        const conversationId = 'user-123-conversation';

        // Create initial conversation state
        const initialState: ConversationState = {
            conversationId,
            userId: 'user-123',
            currentIntent: 'inventory_management',
            entities: {
                items: ['抽纸', '洗发水'],
                quantities: [1, 2],
            },
            history: [],
            lastActivity: new Date(),
            agentContext: {
                preferredLanguage: 'zh-CN',
                lastAgent: 'inventory',
            },
        };

        // Save conversation state
        await this.stateManager.saveConversationState(conversationId, initialState);
        this.logger.info('Conversation state saved', { conversationId });

        // Add a conversation turn
        initialState.history.push({
            turnId: 'turn-1',
            userInput: '抽纸消耗1包',
            agentResponse: '已更新抽纸库存，当前剩余5包',
            intent: 'update_inventory',
            entities: { item: '抽纸', quantity: 1, action: '消耗' },
            timestamp: new Date(),
            agentId: 'inventory',
        });

        initialState.lastActivity = new Date();
        await this.stateManager.saveConversationState(conversationId, initialState);

        // Load and verify conversation state
        const loadedState = await this.stateManager.loadConversationState(conversationId);
        this.logger.info('Conversation state loaded', {
            conversationId,
            historyLength: loadedState?.history.length,
            currentIntent: loadedState?.currentIntent,
        });
    }

    /**
     * Example 2: Analysis result caching
     */
    async demonstrateAnalysisResultCaching(): Promise<void> {
        this.logger.info('=== Analysis Result Caching Example ===');

        // Simulate expensive analysis result
        const analysisResult = {
            totalItems: 25,
            lowStockItems: ['抽纸', '洗发水'],
            recommendations: [
                { item: '抽纸', suggestedQuantity: 10, priority: 'high' },
                { item: '洗发水', suggestedQuantity: 5, priority: 'medium' },
            ],
            analysisDate: new Date(),
            confidence: 0.95,
        };

        const cacheKey = 'inventory_analysis:2024-12-13';

        // Cache the analysis result
        await this.stateManager.cacheAnalysisResult(cacheKey, analysisResult, 3600000); // 1 hour TTL
        this.logger.info('Analysis result cached', { cacheKey });

        // Retrieve from cache
        const cachedResult = await this.stateManager.getCachedResult(cacheKey);
        this.logger.info('Analysis result retrieved from cache', {
            cacheKey,
            found: !!cachedResult,
            lowStockItems: (cachedResult as any)?.lowStockItems,
        });

        // Cache financial analysis
        const financialAnalysis = {
            monthlySpending: 1250.50,
            categoryBreakdown: {
                '日用品': 450.30,
                '食品': 600.20,
                '清洁用品': 200.00,
            },
            anomalies: [],
            trends: ['increasing_daily_items', 'stable_food_spending'],
        };

        await this.stateManager.cacheAnalysisResult(
            'financial_analysis:2024-12',
            financialAnalysis,
            7200000 // 2 hours TTL
        );
        this.logger.info('Financial analysis cached');
    }

    /**
     * Example 3: Agent context management
     */
    async demonstrateAgentContextManagement(): Promise<void> {
        this.logger.info('=== Agent Context Management Example ===');

        const agentId = 'inventory-agent-1';

        // Save agent context
        const agentContext = {
            currentSession: 'session-456',
            processingQueue: ['task-1', 'task-2'],
            lastProcessedItem: '抽纸',
            userPreferences: {
                language: 'zh-CN',
                notificationLevel: 'normal',
            },
            temporaryData: {
                ocrResults: ['text1', 'text2'],
                pendingUpdates: 3,
            },
        };

        await this.stateManager.saveAgentContext(agentId, agentContext);
        this.logger.info('Agent context saved', { agentId });

        // Load agent context
        const loadedContext = await this.stateManager.loadAgentContext(agentId);
        this.logger.info('Agent context loaded', {
            agentId,
            sessionId: loadedContext?.currentSession,
            queueLength: loadedContext?.processingQueue?.length,
        });
    }

    /**
     * Example 4: Workflow state management
     */
    async demonstrateWorkflowStateManagement(): Promise<void> {
        this.logger.info('=== Workflow State Management Example ===');

        try {
            // Create a sample workflow
            const workflowId = await this.integration.createSampleWorkflow();
            this.logger.info('Sample workflow created', { workflowId });

            // Execute the workflow
            const workflowResult = await this.workflowEngine.executeWorkflow(workflowId, {
                userId: 'user-123',
                action: 'inventory_update',
                items: ['抽纸', '洗发水'],
            });

            this.logger.info('Workflow execution completed', {
                executionId: workflowResult.executionId,
                status: workflowResult.status,
                duration: workflowResult.duration,
                stepsExecuted: workflowResult.stepsExecuted,
            });

            // Get workflow status
            const workflowStatus = await this.workflowEngine.getWorkflowStatus(
                workflowResult.executionId
            );
            this.logger.info('Workflow status retrieved', {
                executionId: workflowResult.executionId,
                currentStep: workflowStatus.currentStep,
                status: workflowStatus.status,
            });
        } catch (error) {
            this.logger.error('Workflow demonstration failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Example 5: Cache invalidation and cleanup
     */
    async demonstrateCacheManagement(): Promise<void> {
        this.logger.info('=== Cache Management Example ===');

        // Cache multiple items
        await this.stateManager.cacheAnalysisResult('test:item1', { data: 'value1' }, 60000);
        await this.stateManager.cacheAnalysisResult('test:item2', { data: 'value2' }, 60000);
        await this.stateManager.cacheAnalysisResult('other:item3', { data: 'value3' }, 60000);

        this.logger.info('Multiple items cached');

        // Invalidate specific cache entry
        await this.stateManager.invalidateCache('test:item1');
        this.logger.info('Specific cache entry invalidated');

        // Try to retrieve invalidated item
        const invalidatedItem = await this.stateManager.getCachedResult('test:item1');
        const validItem = await this.stateManager.getCachedResult('test:item2');

        this.logger.info('Cache retrieval after invalidation', {
            invalidatedItem: !!invalidatedItem,
            validItem: !!validItem,
        });

        // Get cache statistics
        const stats = await this.stateManager.getStats();
        this.logger.info('Cache statistics', stats);
    }

    /**
     * Run all examples
     */
    async runAllExamples(): Promise<void> {
        this.logger.info('Starting state management examples');

        try {
            await this.demonstrateConversationState();
            await this.demonstrateAnalysisResultCaching();
            await this.demonstrateAgentContextManagement();
            await this.demonstrateWorkflowStateManagement();
            await this.demonstrateCacheManagement();

            this.logger.info('All state management examples completed successfully');
        } catch (error) {
            this.logger.error('Example execution failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        this.logger.info('Cleaning up state management example');

        await this.integration.shutdown();

        this.logger.info('State management example cleanup completed');
    }
}

/**
 * Standalone function to run the examples
 */
export async function runStateManagementExamples(): Promise<void> {
    const example = new StateManagementExample();

    try {
        await example.runAllExamples();
    } finally {
        await example.cleanup();
    }
}

// Export for use in other modules
