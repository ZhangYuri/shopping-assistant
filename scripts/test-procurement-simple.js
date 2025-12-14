// Simple test for the procurement recommendation algorithm
const { generatePurchaseRecommendationsTool, analyzePurchasePatternsDetailedTool, manageShoppingListAdvancedTool } = require('../src/tools/DatabaseTools');

async function testProcurementTools() {
    console.log('Testing procurement recommendation tools...');

    try {
        // Test the generate purchase recommendations tool
        console.log('\n1. Testing generatePurchaseRecommendationsTool...');
        const recommendationsInput = JSON.stringify({
            analysisDepthDays: 90,
            categories: ['食品', '日用品'],
            includeSeasonality: true
        });

        const recommendationsResult = await generatePurchaseRecommendationsTool.func(recommendationsInput);
        console.log('Recommendations result:', JSON.parse(recommendationsResult));

        // Test the analyze purchase patterns tool
        console.log('\n2. Testing analyzePurchasePatternsDetailedTool...');
        const patternsInput = JSON.stringify({
            timeRange: 365,
            categories: ['食品'],
            includeSeasonality: true
        });

        const patternsResult = await analyzePurchasePatternsDetailedTool.func(patternsInput);
        console.log('Patterns result:', JSON.parse(patternsResult));

        // Test the advanced shopping list management tool
        console.log('\n3. Testing manageShoppingListAdvancedTool...');
        const shoppingListInput = JSON.stringify({
            action: 'prioritize'
        });

        const shoppingListResult = await manageShoppingListAdvancedTool.func(shoppingListInput);
        console.log('Shopping list result:', JSON.parse(shoppingListResult));

        console.log('\nAll procurement tools tested successfully!');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testProcurementTools();
