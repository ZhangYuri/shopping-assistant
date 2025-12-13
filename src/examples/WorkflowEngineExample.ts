/**
 * Example demonstrating LangGraph Workflow Engine and Agent Router usage
 */

import { LangGraphWorkflowEngine } from '../workflows/LangGraphWorkflowEngine';
import { AgentRouter } from '../workflows/AgentRouter';
import { AgentStateManager } from '../state/AgentStateManager';
import { WorkflowDefinition } from '../types/workflow.types';
import { Logger } from '../utils/Logger';

export class WorkflowEngineExample {
    private stateManager: AgentStateManager;
    private workflowEngine: LangGraphWorkflowEngine;
    private agentRouter: AgentRouter;
    private logger: Logger;

    constructor() {
        this.logger = new Logger({
            component: 'WorkflowEngineExample',
            level: 'info',
        });

        // Initialize components
        this.stateManager = new AgentStateManager({
            enableConversationPersistence: true,
            enableGeneralCaching: true,
        });

        this.workflowEngine = new LangGraphWorkflowEngine(this.stateManager);
        this.agentRouter = new AgentRouter(this.stateManager);
    }

    /**
     * Demonstrate natural language routing
     */
    async demonstrateRouting(): Promise<void> {
        this.logger.info('=== Agent Router Demonstration ===');

        const testInputs = [
            '抽纸消耗1包',
            '需要采购洗发水',
            '生成本月财务报告',
            '发送库存不足通知',
            '查询当前库存状态',
        ];

        for (const input of testInputs) {
            try {
                const context = {
                    conversationId: `demo-${Date.now()}`,
                    userId: 'demo-user',
                    sessionHistory: [],
                    currentContext: { userInput: input },
                    timestamp: new Date(),
                };

                const routingResult = await this.agentRouter.routeRequest(input, context);

                this.logger.info('Routing Result', {
                    input,
                    targetAgent: routingResult.targetAgent.config.agentType,
                    intent: routingResult.intentResult.intent,
                    confidence: routingResult.intentResult.confidence,
                    entities: routingResult.intentResult.entities,
                });
            } catch (error) {
                this.logger.error('Routing failed', {
                    input,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * Demonstrate workflow creation and execution
     */
    async demonstrateWorkflow(): Promise<void> {
        this.logger.info('=== Workflow Engine Demonstration ===');

        // Create a simple workflow definition
        const workflowDefinition: WorkflowDefinition = {
            id: 'demo-workflow',
            workflowId: 'demo-workflow',
            name: 'Demo Workflow',
            description: 'Demonstration workflow for testing',
            version: '1.0.0',
            steps: [
                {
                    stepId: 'step-1',
                    stepType: 'sequential',
                    name: 'Demo Step',
                    description: 'Simple demonstration step',
                    nextSteps: [],
                    errorHandling: {
                        strategy: 'fail_fast',
                    },
                },
            ],
            triggers: [
                {
                    triggerId: 'manual-trigger',
                    triggerType: 'manual',
                    condition: 'user_initiated',
                    parameters: {},
                },
            ],
            metadata: {
                created_by: 'demo',
                purpose: 'demonstration',
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        try {
            // Create workflow
            const workflowId = await this.workflowEngine.createWorkflow(workflowDefinition);
            this.logger.info('Workflow created', { workflowId });

            // Execute workflow
            const result = await this.workflowEngine.executeWorkflow(workflowId, {
                demo: true,
                message: 'Hello from workflow engine!',
            });

            this.logger.info('Workflow execution result', {
                status: result.status,
                duration: result.duration,
                stepsExecuted: result.stepsExecuted,
            });

            if (result.error) {
                this.logger.error('Workflow execution error', {
                    error: result.error.message,
                });
            }
        } catch (error) {
            this.logger.error('Workflow demonstration failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Demonstrate integrated routing and workflow execution
     */
    async demonstrateIntegration(): Promise<void> {
        this.logger.info('=== Integration Demonstration ===');

        const userInput = '查询库存状态';

        try {
            // Step 1: Route the request
            const context = {
                conversationId: 'integration-demo',
                userId: 'demo-user',
                sessionHistory: [],
                currentContext: { userInput },
                timestamp: new Date(),
            };

            const routingResult = await this.agentRouter.routeRequest(userInput, context);

            this.logger.info('Request routed', {
                input: userInput,
                targetAgent: routingResult.targetAgent.config.agentType,
                intent: routingResult.intentResult.intent,
            });

            // Step 2: Create a workflow that would use the routed agent
            const workflowDefinition: WorkflowDefinition = {
                id: 'integration-workflow',
                workflowId: 'integration-workflow',
                name: 'Integration Workflow',
                description: 'Workflow demonstrating routing integration',
                version: '1.0.0',
                steps: [
                    {
                        stepId: 'routed-step',
                        stepType: 'sequential',
                        name: 'Routed Processing Step',
                        description: 'Process request using routed agent',
                        nextSteps: [],
                        errorHandling: {
                            strategy: 'fail_fast',
                        },
                    },
                ],
                triggers: [],
                metadata: {
                    routedAgent: routingResult.targetAgent.config.agentType,
                    originalIntent: routingResult.intentResult.intent,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const workflowId = await this.workflowEngine.createWorkflow(workflowDefinition);

            // Step 3: Execute the workflow with the routed message payload
            const result = await this.workflowEngine.executeWorkflow(
                workflowId,
                routingResult.message.payload
            );

            this.logger.info('Integration workflow completed', {
                status: result.status,
                duration: result.duration,
                routedAgent: routingResult.targetAgent.config.agentType,
            });

        } catch (error) {
            this.logger.error('Integration demonstration failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Run all demonstrations
     */
    async runDemo(): Promise<void> {
        this.logger.info('Starting Workflow Engine and Agent Router Demonstration');

        try {
            await this.demonstrateRouting();
            await this.demonstrateWorkflow();
            await this.demonstrateIntegration();
        } catch (error) {
            this.logger.error('Demo failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            await this.shutdown();
        }

        this.logger.info('Demonstration completed');
    }

    /**
     * Cleanup resources
     */
    async shutdown(): Promise<void> {
        await this.workflowEngine.shutdown();
        await this.agentRouter.shutdown();
        await this.stateManager.shutdown();
    }
}

// Example usage
if (require.main === module) {
    const demo = new WorkflowEngineExample();
    demo.runDemo().catch(console.error);
}
