/**
 * Example usage of the new InventoryAgent with LangChain integration
 */

import { InventoryAgent } from '@/agents/InventoryAgent';
import { ChatDeepSeek } from '@langchain/deepseek';

async function demonstrateInventoryAgent() {
    // Create tools for the inventory agent
    const { databaseTools, fileStorageTools, notificationTools } = InventoryAgent.createInventoryTools();

    // Initialize the inventory agent
    const inventoryAgent = new InventoryAgent({
        agentId: 'inventory-001',
        name: 'HomeInventoryAgent',
        description: '家庭库存管理智能体',
        databaseTools,
        fileStorageTools,
        notificationTools,
        defaultThresholds: {
            '日用品': 2,
            '食品': 3,
            '清洁用品': 1,
            '个人护理': 2,
        },
        model: new ChatDeepSeek({
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: 'deepseek-chat',
            temperature: 0.1,
        }),
    });

    // Initialize the agent
    await inventoryAgent.initialize();

    console.log('=== 库存智能体演示 ===\n');

    // Example 1: Natural language inventory command
    console.log('1. 自然语言库存命令:');
    const result1 = await inventoryAgent.processInventoryCommand('抽纸消耗1包');
    console.log('用户输入: "抽纸消耗1包"');
    console.log('智能体回复:', result1.messages[result1.messages.length - 1]?.content);
    console.log('');

    // Example 2: Add inventory items
    console.log('2. 添加库存物品:');
    const result2 = await inventoryAgent.processInventoryCommand('添加牛奶3瓶');
    console.log('用户输入: "添加牛奶3瓶"');
    console.log('智能体回复:', result2.messages[result2.messages.length - 1]?.content);
    console.log('');

    // Example 3: Query inventory status
    console.log('3. 查询库存状态:');
    const result3 = await inventoryAgent.processInventoryCommand('查询抽纸还有多少');
    console.log('用户输入: "查询抽纸还有多少"');
    console.log('智能体回复:', result3.messages[result3.messages.length - 1]?.content);
    console.log('');

    // Example 4: Photo upload processing
    console.log('4. 照片上传处理:');
    const result4 = await inventoryAgent.processPhotoUpload('photo-123', '这是一包新买的抽纸');
    console.log('用户操作: 上传照片并描述 "这是一包新买的抽纸"');
    console.log('智能体回复:', result4.messages[result4.messages.length - 1]?.content);
    console.log('');

    // Example 5: Check inventory levels
    console.log('5. 检查库存水平:');
    const result5 = await inventoryAgent.checkInventoryLevels();
    console.log('系统操作: 检查所有物品的库存水平');
    console.log('智能体回复:', result5.messages[result5.messages.length - 1]?.content);
    console.log('');

    // Example 6: Generate inventory report
    console.log('6. 生成库存报告:');
    const result6 = await inventoryAgent.getInventoryReport();
    console.log('用户请求: 生成完整库存报告');
    console.log('智能体回复:', result6.messages[result6.messages.length - 1]?.content);
    console.log('');

    // Example 7: Streaming response
    console.log('7. 流式响应演示:');
    console.log('用户输入: "请详细分析当前库存状况并给出建议"');
    console.log('智能体流式回复:');

    const stream = await inventoryAgent.stream('请详细分析当前库存状况并给出建议');
    for await (const chunk of stream) {
        if (chunk.messages && chunk.messages.length > 0) {
            const lastMessage = chunk.messages[chunk.messages.length - 1];
            if (lastMessage.content) {
                process.stdout.write(lastMessage.content);
            }
        }
    }
    console.log('\n');

    // Display agent metrics
    console.log('=== 智能体性能指标 ===');
    const metrics = inventoryAgent.getMetrics();
    console.log(`任务完成数: ${metrics.tasksCompleted}`);
    console.log(`任务失败数: ${metrics.tasksFailedCount}`);
    console.log(`平均响应时间: ${metrics.averageResponseTime}ms`);
    console.log(`错误率: ${(metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`最后活动时间: ${metrics.lastActiveTime.toLocaleString()}`);
    console.log('');

    // Display available tools
    console.log('=== 可用工具 ===');
    const tools = inventoryAgent.getAvailableTools();
    tools.forEach(toolName => {
        const description = inventoryAgent.getToolDescription(toolName);
        console.log(`- ${toolName}: ${description}`);
    });
}

// Run the demonstration
if (require.main === module) {
    demonstrateInventoryAgent()
        .then(() => {
            console.log('\n库存智能体演示完成！');
        })
        .catch(error => {
            console.error('演示过程中出错:', error);
        });
}

export { demonstrateInventoryAgent };
