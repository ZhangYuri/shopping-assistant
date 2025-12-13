/**
 * Example usage of LangGraph StateGraph Workflow with Intelligent Agent Router
 */

import { WorkflowFactory } from '../workflows/WorkflowFactory';
import { AgentStateManager } from '../state/AgentStateManager';
import { Logger } from '../utils/Logger';

/**
 * Example demonstrating LangGraph workflow usage
 */
export class LangGraphWorkflowExample {
    private logger: Logger;

    constructor() {
        this.logger = new Logger({
            component: 'LangGraphWorkflowExample',
            level: 'info',
        });
    }

    /**
     * Run complete workflow example
     */
    async runCompleteExample(): Promise<void> {
        try {
            this.logger.info('Starting LangGraph workflow example');

            // Create state manager
            const stateManager = new AgentStateManager({
                enableConversationPersistence: true,
                enableGeneralCaching: true,
            });

            // Create workflow factory
            const factory = new WorkflowFactory();

            // Create complete workflow with development configuration
            const { workflow, router, agents } = await factory.createCompleteWorkflow(
                stateManager,
                WorkflowFactory.createDevelopmentConfig()
            );

            // Test various user inputs
            const testInputs = [
                '抽纸消耗了2包',
                '查询当前库存状态',
                '上传一张产品照片，帮我添加到库存',
                '导入淘宝订单数据',
                '生成这个月的采购建议',
                '分析我的支出情况',
                '发送库存不足的通知',
            ];

            for (const input of testInputs) {
                this.logger.info(`Testing input: ${input}`);

                const result = await workflow.execute(input, undefined, 'test-user');

                this.logger.info('Workflow result', {
                    success: result.success,
                    response: result.response.substring(0, 200),
                    agentUsed: result.metadata?.agentUsed,
                    duration: result.metadata?.duration,
                });

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Get routing statistics
            const routingStats = router.getRoutingStats();
            this.logger.info('Routing statistics', routingStats);

            // Get workflow statistics
            const workflowStats = workflow.getStats();
            this.logger.info('Workflow statistics', workflowStats);

            this.logger.info('LangGraph workflow example completed successfully');
        } catch (error) {
            this.logger.error('LangGraph workflow example failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Run streaming example
     */
    async runStreamingExample(): Promise<void> {
        try {
            this.logger.info('Starting LangGraph streaming example');

            // Create state manager
            const stateManager = new AgentStateManager({
                enableConversationPersistence: true,
                enableGeneralCaching: true,
            });

            // Create workflow factory
            const factory = new WorkflowFactory();

            // Create workflow
            const { workflow } = await factory.createCompleteWorkflow(
                stateManager,
                WorkflowFactory.createDevelopmentConfig()
            );

            // Test streaming response
            const userInput = '请分析我的库存状态并生成详细报告';
            this.logger.info(`Streaming test input: ${userInput}`);

            const stream = await workflow.stream(userInput, undefined, 'streaming-user');

            for await (const chunk of stream) {
                this.logger.info('Stream chunk received', {
                    nodeKey: Object.keys(chunk)[0],
                    hasData: !!chunk[Object.keys(chunk)[0]],
                });
            }

            this.logger.info('LangGraph streaming example completed');
        } catch (error) {
            this.logger.error('LangGraph streaming example failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Run conversation context example
     */
    async runConversationExample(): Promise<void> {
        try {
            this.logger.info('Starting conversation context example');

            // Create state manager
            const stateManager = new AgentStateManager({
                enableConversationPersistence: true,
                enableGeneralCaching: true,
            });

            // Create workflow factory
            const factory = new WorkflowFactory();

            // Create workflow
            const { workflow } = await factory.createCompleteWorkflow(
                stateManager,
                WorkflowFactory.createDevelopmentConfig()
            );

            const conversationId = 'conversation-001';
            const userId = 'context-user';

            // Simulate a multi-turn conversation
            const conversationTurns = [
                '查询抽纸的库存',
                '消耗了1包',
                '现在还剩多少？',
                '如果低于阈值，请生成采购建议',
                '好的，请帮我添加到购物清单',
            ];

            for (let i = 0; i < conversationTurns.length; i++) {
                const input = conversationTurns[i];
                this.logger.info(`Conversation turn ${i + 1}: ${input}`);

                const result = await workflow.execute(input, conversationId, userId);

                this.logger.info(`Turn ${i + 1} result`, {
                    success: result.success,
                    response: result.response.substring(0, 150),
                    agentUsed: result.metadata?.agentUsed,
                });

                // Add delay between turns
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            this.logger.info('Conversation context example completed');
        } catch (error) {
            this.logger.error('Conversation context example failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Run error handling example
     */
    async runErrorHandlingExample(): Promise<void> {
        try {
            this.logger.info('Starting error handling example');

            // Create state manager
            const stateManager = new AgentStateManager({
                enableConversationPersistence: true,
                enableGeneralCaching: true,
            });

            // Create workflow factory
            const factory = new WorkflowFactory();

            // Create workflow
            const { workflow } = await factory.createCompleteWorkflow(
                stateManager,
                WorkflowFactory.createDevelopmentConfig()
            );

            // Test various error scenarios
            const errorInputs = [
                '', // Empty input
                '这是一个非常模糊的请求，没有明确的意图', // Ambiguous input
                '请执行一个不存在的操作', // Invalid operation
                '查询一个不存在的物品的库存信息', // Non-existent item
            ];

            for (const input of errorInputs) {
                this.logger.info(`Testing error scenario: ${input || '(empty)'}`);

                const result = await workflow.execute(input, undefined, 'error-test-user');

                this.logger.info('Error handling result', {
                    success: result.success,
                    response: result.response.substring(0, 150),
                    hasError: !!result.error,
                });
            }

            this.logger.info('Error handling example completed');
        } catch (error) {
            this.logger.error('Error handling example failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Run performance test example
     */
    async runPerformanceExample(): Promise<void> {
        try {
            this.logger.info('Starting performance test example');

            // Create state manager
            const stateManager = new AgentStateManager({
                enableConversationPersistence: true,
                enableGeneralCaching: true,
            });

            // Create workflow factory
            const factory = new WorkflowFactory();

            // Create workflow
            const { workflow } = await factory.createCompleteWorkflow(
                stateManager,
                WorkflowFactory.createDevelopmentConfig()
            );

            const testInput = '查询库存状态';
            const iterations = 5;
            const durations: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();

                const result = await workflow.execute(
                    testInput,
                    `perf-test-${i}`,
                    'performance-user'
                );

                const duration = Date.now() - startTime;
                durations.push(duration);

                this.logger.info(`Performance test ${i + 1}`, {
                    duration,
                    success: result.success,
                    agentUsed: result.metadata?.agentUsed,
                });
            }

            // Calculate statistics
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const minDuration = Math.min(...durations);
            const maxDuration = Math.max(...durations);

            this.logger.info('Performance test results', {
                iterations,
                averageDuration: avgDuration,
                minDuration,
                maxDuration,
                totalTime: durations.reduce((a, b) => a + b, 0),
            });

            this.logger.info('Performance test example completed');
        } catch (error) {
            this.logger.error('Performance test example failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}

// Example usage
async function runExamples(): Promise<void> {
    const example = new LangGraphWorkflowExample();

    try {
        // Run all examples
        await example.runCompleteExample();
        await example.runStreamingExample();
        await example.runConversationExample();
        await example.runErrorHandlingExample();
        await example.runPerformanceExample();

        console.log('All LangGraph workflow examples completed successfully!');
    } catch (error) {
        console.error('Example execution failed:', error);
        process.exit(1);
    }
}

// Run examples if this file is executed directly
if (require.main === module) {
    runExamples();
}
