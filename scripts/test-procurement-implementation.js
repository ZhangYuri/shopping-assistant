// Simple test to verify the procurement recommendation implementation
const { ProcurementAgent } = require('../dist/agents/ProcurementAgent');

async function testProcurementRecommendations() {
    try {
        console.log('Testing procurement recommendation implementation...');

        // Create tools
        const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools();

        console.log('Database tools:', databaseTools.map(t => t.name));
        console.log('File storage tools:', fileStorageTools.map(t => t.name));
        console.log('Notification tools:', notificationTools.map(t => t.name));

        // Create agent
        const agent = new ProcurementAgent({
            agentId: 'test-procurement',
            name: 'TestProcurementAgent',
            description: 'Test procurement agent',
            databaseTools,
            fileStorageTools,
            notificationTools,
        });

        console.log('Available tools:', agent.getAvailableTools());

        // Test the new methods
        console.log('Testing generateAdvancedRecommendations...');
        const recommendations = await agent.generateAdvancedRecommendations({
            analysisDepthDays: 30,
            categories: ['食品', '日用品'],
            includeSeasonality: true,
            minPriority: 2
        });

        console.log('Recommendations result:', recommendations);

        console.log('Testing analyzeComprehensivePurchasePatterns...');
        const patterns = await agent.analyzeComprehensivePurchasePatterns({
            timeRangeDays: 90,
            categories: ['食品'],
            includeSeasonality: true
        });

        console.log('Patterns result:', patterns);

        console.log('Testing manageShoppingListAdvanced...');
        const shoppingList = await agent.manageShoppingListAdvanced({
            action: 'prioritize'
        });

        console.log('Shopping list result:', shoppingList);

        console.log('All tests completed successfully!');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testProcurementRecommendations();
