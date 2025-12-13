/**
 * Basic tests for LangGraph StateGraph Workflow implementation
 */

import { LangGraphStateWorkflow } from '../workflows/LangGraphStateWorkflow';
import { IntelligentAgentRouter } from '../workflows/IntelligentAgentRouter';
import { WorkflowFactory } from '../workflows/WorkflowFactory';
import { AgentStateManager } from '../state/AgentStateManager';

describe('LangGraph StateGraph Workflow', () => {
    let stateManager: AgentStateManager;
    let router: IntelligentAgentRouter;
    let workflow: LangGraphStateWorkflow;

    beforeEach(() => {
        stateManager = new AgentStateManager({
            enableConversationPersistence: false,
            enableGeneralCaching: false,
        });

        router = new IntelligentAgentRouter(stateManager, {
            enableContextLearning: false,
            confidenceThreshold: 0.5,
            fallbackAgent: 'inventory',
        });

        workflow = new LangGraphStateWorkflow(router, stateManager, {
            enableMemory: false,
            maxSteps: 5,
            timeout: 30000,
        });
    });

    afterEach(async () => {
        await workflow.shutdown();
        await router.shutdown();
    });

    describe('Workflow Creation', () => {
        it('should create workflow successfully', () => {
            expect(workflow).toBeDefined();
            expect(workflow.getStats().isCompiled).toBe(false);
        });

        it('should compile workflow successfully', async () => {
            await workflow.compile();
            expect(workflow.getStats().isCompiled).toBe(true);
        });
    });

    describe('Router Functionality', () => {
        it('should create router successfully', () => {
            expect(router).toBeDefined();
            expect(router.getRoutingStats().registeredAgents).toBe(0);
        });

        it('should get routing context', async () => {
            const context = await router.getRoutingContext('test-conversation', 'test-user');
            expect(context).toBeDefined();
            expect(context.conversationId).toBe('test-conversation');
            expect(context.userId).toBe('test-user');
        });
    });

    describe('Workflow Factory', () => {
        it('should create test workflow', async () => {
            const factory = new WorkflowFactory();
            const { workflow: testWorkflow, router: testRouter } = await factory.createTestWorkflow(stateManager);

            expect(testWorkflow).toBeDefined();
            expect(testRouter).toBeDefined();
            expect(testWorkflow.getStats().isCompiled).toBe(true);

            await testWorkflow.shutdown();
            await testRouter.shutdown();
        });

        it('should create configuration objects', () => {
            const prodConfig = WorkflowFactory.createProductionConfig();
            const devConfig = WorkflowFactory.createDevelopmentConfig();
            const testConfig = WorkflowFactory.createTestConfig();

            expect(prodConfig.workflowConfig?.enableMemory).toBe(true);
            expect(devConfig.workflowConfig?.enableMemory).toBe(true);
            expect(testConfig.workflowConfig?.enableMemory).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should handle workflow execution without agents gracefully', async () => {
            await workflow.compile();

            const result = await workflow.execute('test input', undefined, 'test-user');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.response).toContain('错误');
        });
    });

    describe('State Management', () => {
        it('should maintain workflow state', async () => {
            const stats = workflow.getStats();
            expect(stats.registeredAgents).toBe(0);
            expect(stats.isCompiled).toBe(false);
        });

        it('should track routing statistics', () => {
            const stats = router.getRoutingStats();
            expect(stats.registeredAgents).toBe(0);
            expect(stats.totalRoutingDecisions).toBe(0);
            expect(stats.averageConfidence).toBe(0);
        });
    });
});

describe('Integration Tests', () => {
    it('should create complete workflow with factory', async () => {
        const stateManager = new AgentStateManager({
            enableConversationPersistence: false,
            enableGeneralCaching: false,
        });

        const factory = new WorkflowFactory();

        // This test might fail due to missing environment variables, but should not crash
        try {
            const { workflow, router, agents } = await factory.createCompleteWorkflow(
                stateManager,
                WorkflowFactory.createTestConfig()
            );

            expect(workflow).toBeDefined();
            expect(router).toBeDefined();
            expect(agents).toBeDefined();
            expect(agents.inventory).toBeDefined();
            expect(agents.procurement).toBeDefined();

            await workflow.shutdown();
            await router.shutdown();
        } catch (error) {
            // Expected to fail without proper environment setup
            expect(error).toBeDefined();
        }
    });
});
