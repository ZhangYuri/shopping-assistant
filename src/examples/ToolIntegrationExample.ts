/**
 * Tool Integration Example
 * Demonstrates how to use the integrated tools with agents
 */

import { BaseAgent, BaseAgentConfig } from '@/agents/base/BaseAgent';
import { ToolFactory, createToolsForAgent } from '@/tools/ToolFactory';
import { DatabaseService } from '@/services/DatabaseService';
import { StateManagementService } from '@/services/StateManagementService';
import { NotificationService } from '@/services/NotificationService';
import { Logger } from '@/utils/Logger';

const logger = new Logger({
    component: 'ToolIntegrationExample',
    level: 'info'
});

/**
 * Example agent that uses integrated tools
 */
class ExampleAgent extends BaseAgent {
    constructor(config: BaseAgentConfig) {
        super(config);
    }

    protected getDefaultSystemPrompt(): string {
        return `你是一个购物助手智能体，可以帮助用户管理库存、处理订单、分析财务数据和发送通知。

你有以下工具可以使用：
- 数据库工具：管理库存、订单、购物清单和财务数据
- 文件存储工具：处理图片、Excel文件和OCR识别
- 状态管理工具：管理对话状态和缓存
- 通知工具：发送多渠道通知

请根据用户的需求选择合适的工具来完成任务。始终用中文回复用户。`;
    }
}

/**
 * Initialize all services
 */
async function initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    // Initialize database service
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();

    // Initialize state management service
    const stateManagementService = StateManagementService.getInstance();
    await stateManagementService.initialize();

    // Initialize notification service
    const notificationService = NotificationService.getInstance();
    await notificationService.initialize();

    logger.info('All services initialized successfully');
}

/**
 * Create an agent with integrated tools
 */
async function createAgentWithTools(agentType: 'inventory' | 'procurement' | 'finance' | 'notification' = 'inventory'): Promise<ExampleAgent> {
    // Initialize services first
    await initializeServices();

    // Create tools for the specific agent type
    const toolFactory = ToolFactory.getInstance();
    const tools = toolFactory.createAgentTools({ agentType });

    logger.info('Created tools for agent', {
        agentType,
        toolCount: tools.length,
        toolNames: tools.map(t => t.name)
    });

    // Create agent configuration
    const config: BaseAgentConfig = {
        agentId: `example-${agentType}-agent`,
        name: `Example ${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent`,
        description: `An example agent demonstrating ${agentType} tool integration`,
        tools,
        memoryEnabled: true
    };

    // Create and initialize agent
    const agent = new ExampleAgent(config);
    await agent.initialize();

    logger.info('Agent created and initialized', {
        agentId: config.agentId,
        toolCount: tools.length
    });

    return agent;
}

/**
 * Example: Inventory management workflow
 */
async function inventoryWorkflowExample(): Promise<void> {
    logger.info('Starting inventory workflow example');

    const agent = await createAgentWithTools('inventory');

    // Example 1: Check inventory levels
    const checkInventoryResult = await agent.invoke(
        '请检查库存中数量低于5的物品，并生成补货建议',
        { configurable: { thread_id: 'inventory-example-1' } }
    );

    logger.info('Inventory check result', {
        success: checkInventoryResult.success,
        messageCount: checkInventoryResult.messages.length
    });

    // Example 2: Add new inventory item
    const addItemResult = await agent.invoke(
        '添加新物品：牛奶，数量10瓶，分类：饮品，存储位置：冰箱',
        { configurable: { thread_id: 'inventory-example-2' } }
    );

    logger.info('Add item result', {
        success: addItemResult.success,
        messageCount: addItemResult.messages.length
    });

    // Example 3: Process image with OCR
    const ocrResult = await agent.invoke(
        '我上传了一张产品图片，请帮我识别其中的文字信息并添加到库存中',
        { configurable: { thread_id: 'inventory-example-3' } }
    );

    logger.info('OCR processing result', {
        success: ocrResult.success,
        messageCount: ocrResult.messages.length
    });
}

/**
 * Example: Procurement workflow
 */
async function procurementWorkflowExample(): Promise<void> {
    logger.info('Starting procurement workflow example');

    const agent = await createAgentWithTools('procurement');

    // Example 1: Import orders from Excel
    const importResult = await agent.invoke(
        '请导入淘宝订单Excel文件，文件ID是file_123456',
        { configurable: { thread_id: 'procurement-example-1' } }
    );

    logger.info('Import orders result', {
        success: importResult.success,
        messageCount: importResult.messages.length
    });

    // Example 2: Generate purchase recommendations
    const recommendationResult = await agent.invoke(
        '基于最近30天的消费数据，生成采购建议',
        { configurable: { thread_id: 'procurement-example-2' } }
    );

    logger.info('Purchase recommendation result', {
        success: recommendationResult.success,
        messageCount: recommendationResult.messages.length
    });

    // Example 3: Manage shopping list
    const shoppingListResult = await agent.invoke(
        '将抽纸添加到购物清单，建议数量5包，优先级高',
        { configurable: { thread_id: 'procurement-example-3' } }
    );

    logger.info('Shopping list result', {
        success: shoppingListResult.success,
        messageCount: shoppingListResult.messages.length
    });
}

/**
 * Example: Notification workflow
 */
async function notificationWorkflowExample(): Promise<void> {
    logger.info('Starting notification workflow example');

    const agent = await createAgentWithTools('notification');

    // Example 1: Send inventory alert
    const alertResult = await agent.invoke(
        '发送库存预警通知：抽纸库存不足，当前数量2包，建议补货10包',
        { configurable: { thread_id: 'notification-example-1' } }
    );

    logger.info('Inventory alert result', {
        success: alertResult.success,
        messageCount: alertResult.messages.length
    });

    // Example 2: Send Teams notification
    const teamsResult = await agent.invoke(
        '向Teams发送通知：系统已完成月度财务分析，请查看报告',
        { configurable: { thread_id: 'notification-example-2' } }
    );

    logger.info('Teams notification result', {
        success: teamsResult.success,
        messageCount: teamsResult.messages.length
    });
}

/**
 * Example: Multi-agent collaboration
 */
async function multiAgentCollaborationExample(): Promise<void> {
    logger.info('Starting multi-agent collaboration example');

    // Create different types of agents
    const inventoryAgent = await createAgentWithTools('inventory');
    const procurementAgent = await createAgentWithTools('procurement');
    const notificationAgent = await createAgentWithTools('notification');

    // Simulate a workflow where inventory agent detects low stock,
    // procurement agent generates recommendations,
    // and notification agent sends alerts

    // Step 1: Inventory agent checks stock levels
    const inventoryResult = await inventoryAgent.invoke(
        '检查所有物品的库存水平，找出需要补货的物品',
        { configurable: { thread_id: 'collaboration-inventory' } }
    );

    // Step 2: Procurement agent generates recommendations
    const procurementResult = await procurementAgent.invoke(
        '基于库存不足的物品，生成详细的采购建议',
        { configurable: { thread_id: 'collaboration-procurement' } }
    );

    // Step 3: Notification agent sends alerts
    const notificationResult = await notificationAgent.invoke(
        '发送采购建议通知到Teams频道',
        { configurable: { thread_id: 'collaboration-notification' } }
    );

    logger.info('Multi-agent collaboration completed', {
        inventorySuccess: inventoryResult.success,
        procurementSuccess: procurementResult.success,
        notificationSuccess: notificationResult.success
    });
}

/**
 * Main example function
 */
export async function runToolIntegrationExample(): Promise<void> {
    try {
        logger.info('Starting tool integration example');

        // Run individual workflow examples
        await inventoryWorkflowExample();
        await procurementWorkflowExample();
        await notificationWorkflowExample();

        // Run multi-agent collaboration example
        await multiAgentCollaborationExample();

        // Display tool statistics
        const toolFactory = ToolFactory.getInstance();
        const stats = toolFactory.getToolStatistics();

        logger.info('Tool integration example completed', {
            toolStatistics: stats
        });

    } catch (error) {
        logger.error('Tool integration example failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

// Export for use in other examples
export {
    ExampleAgent,
    createAgentWithTools,
    initializeServices
};

// Run example if this file is executed directly
if (require.main === module) {
    runToolIntegrationExample()
        .then(() => {
            logger.info('Example completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Example failed', { error });
            process.exit(1);
        });
}
