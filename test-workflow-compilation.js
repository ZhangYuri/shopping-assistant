/**
 * Simple test to verify workflow compilation and agent creation
 */

const { WorkflowFactory } = require('./dist/workflows/WorkflowFactory');
const { AgentStateManager } = require('./dist/state/AgentStateManager');

async function testWorkflowCompilation() {
    try {
        console.log('Testing workflow compilation...');

        // Create state manager
        const stateManager = new AgentStateManager();

        // Create workflow factory
        const factory = new WorkflowFactory();

        // Try to create a test workflow (simpler, no LLM required)
        const { workflow, router } = await factory.createTestWorkflow(stateManager);

        console.log('✅ Workflow compilation successful!');
        console.log('Workflow stats:', workflow.getStats());
        console.log('Router stats:', router.getRoutingStats());

        await workflow.shutdown();
        await router.shutdown();

        console.log('✅ All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testWorkflowCompilation();
