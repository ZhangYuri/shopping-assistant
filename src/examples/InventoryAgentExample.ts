/**
 * Inventory Agent Usage Example
 */

import { InventoryAgent } from '@/agents/InventoryAgent';
import { MCPManager } from '@/mcp/MCPManager';
import { AgentConfig } from '@/types/agent.types';

// Example usage of the Inventory Agent
export class InventoryAgentExample {
    private inventoryAgent: InventoryAgent;
    private mcpManager: MCPManager;

    constructor() {
        // Initialize MCP Manager
        this.mcpManager = new MCPManager({
            registry: {
                healthCheckInterval: 30000,
                maxRetries: 3,
                retryDelay: 1000,
            },
            autoStart: true,
            configValidation: true,
        });

        // Configure Inventory Agent
        const agentConfig: AgentConfig = {
            agentId: 'inventory-agent',
            agentType: 'inventory',
            name: 'Household Inventory Agent',
            description: 'Manages household inventory through natural language and photo processing',
            capabilities: [
                'natural_language_inventory',
                'photo_inventory_add',
                'inventory_monitoring',
            ],
            retryPolicy: {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 5000,
            },
            maxConcurrentTasks: 5,
            timeoutMs: 30000,
        };

        this.inventoryAgent = new InventoryAgent(agentConfig, this.mcpManager);
    }

    async initialize(): Promise<void> {
        console.log('Initializing Inventory Agent Example...');

        // Start MCP Manager
        await this.mcpManager.start();

        // Register MCP servers
        const serverConfigs = MCPManager.createDefaultServerConfigs();
        await this.mcpManager.registerServersFromConfigs(serverConfigs);

        // Initialize and start the inventory agent
        await this.inventoryAgent.initialize();
        await this.inventoryAgent.start();

        console.log('Inventory Agent Example initialized successfully!');
    }

    async demonstrateNaturalLanguageCommands(): Promise<void> {
        console.log('\n=== Natural Language Command Examples ===');

        const commands = [
            '抽纸消耗1包',
            '添加牛奶2瓶',
            '查询抽纸库存',
            '洗发水设置为3瓶',
        ];

        for (const command of commands) {
            console.log(`\nProcessing: "${command}"`);
            try {
                const result = await this.inventoryAgent.processNaturalLanguageCommand(command);
                console.log(`Result: ${result.message}`);
                if (result.item) {
                    console.log(`Item: ${result.item.item_name}, Quantity: ${result.item.current_quantity} ${result.item.unit}`);
                }
            } catch (error) {
                console.error(`Error: ${error}`);
            }
        }
    }

    async demonstratePhotoProcessing(): Promise<void> {
        console.log('\n=== Photo Processing Example ===');

        // This would normally be a real file ID from uploaded photo
        const mockPhotoFileId = 'example-photo-123';
        const description = '维他奶豆奶';

        console.log(`Processing photo: ${mockPhotoFileId} with description: "${description}"`);

        try {
            const result = await this.inventoryAgent.processPhotoUpload(mockPhotoFileId, description);
            console.log(`Result: ${result.message}`);
            if (result.item) {
                console.log(`Added item: ${result.item.item_name}, Quantity: ${result.item.current_quantity} ${result.item.unit}`);
            }
        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }

    async demonstrateInventoryMonitoring(): Promise<void> {
        console.log('\n=== Inventory Monitoring Example ===');

        try {
            // Check inventory levels
            console.log('Checking inventory levels...');
            const alerts = await this.inventoryAgent.checkInventoryLevels();

            if (alerts.length > 0) {
                console.log(`Found ${alerts.length} low stock alerts:`);
                for (const alert of alerts) {
                    console.log(`- ${alert.item.item_name}: ${alert.item.current_quantity} ${alert.item.unit} (${alert.recommendedAction})`);
                }
            } else {
                console.log('No low stock alerts found.');
            }

            // Get inventory health report
            console.log('\nGenerating inventory health report...');
            const report = await this.inventoryAgent.getInventoryHealthReport();

            console.log(`Total items: ${report.totalItems}`);
            console.log(`Low stock items: ${report.lowStockItems}`);
            console.log('Category breakdown:');
            for (const [category, count] of Object.entries(report.categoryBreakdown)) {
                console.log(`  ${category}: ${count} items`);
            }
            console.log('Recommendations:');
            for (const recommendation of report.recommendations) {
                console.log(`  - ${recommendation}`);
            }

        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }

    async demonstrateInventoryQueries(): Promise<void> {
        console.log('\n=== Inventory Query Examples ===');

        try {
            // Get all inventory items
            console.log('Getting all inventory items...');
            const allItems = await this.inventoryAgent.getInventoryStatus();
            console.log(`Found ${allItems.length} items in inventory:`);

            for (const item of allItems.slice(0, 5)) { // Show first 5 items
                console.log(`- ${item.item_name}: ${item.current_quantity} ${item.unit} (${item.category})`);
            }

            if (allItems.length > 5) {
                console.log(`... and ${allItems.length - 5} more items`);
            }

            // Query specific item
            console.log('\nQuerying specific item...');
            const specificItems = await this.inventoryAgent.getInventoryStatus('抽纸');
            if (specificItems.length > 0) {
                const item = specificItems[0];
                console.log(`抽纸: ${item.current_quantity} ${item.unit}`);
            } else {
                console.log('抽纸 not found in inventory');
            }

        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }

    async runFullDemo(): Promise<void> {
        try {
            await this.initialize();
            await this.demonstrateNaturalLanguageCommands();
            await this.demonstratePhotoProcessing();
            await this.demonstrateInventoryMonitoring();
            await this.demonstrateInventoryQueries();
        } catch (error) {
            console.error('Demo failed:', error);
        } finally {
            await this.cleanup();
        }
    }

    async cleanup(): Promise<void> {
        console.log('\n=== Cleaning up ===');

        try {
            await this.inventoryAgent.stop();
            await this.mcpManager.stop();
            console.log('Cleanup completed successfully');
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    const example = new InventoryAgentExample();
    example.runFullDemo().catch(console.error);
}
