/**
 * Procurement Agent Example - Demonstrates tool-based LangChain agent usage
 */

import { ProcurementAgent } from '@/agents/ProcurementAgent';
import { ProcurementToolsFactory } from '@/agents/tools/ProcurementTools';
import { MCPManager } from '@/mcp/MCPManager';
import { Logger } from '@/utils/Logger';

async function runProcurementAgentExample() {
    const logger = new Logger({
        component: 'ProcurementAgentExample',
        level: 'info',
    });

    try {
        logger.info('Starting Procurement Agent Example with Tool-based Architecture');

        // Initialize MCP Manager
        const mcpManager = new MCPManager({
            registry: {
                healthCheckInterval: 30000,
                maxConcurrentCalls: 10,
                defaultTimeout: 5000,
            },
            autoStart: true,
            configValidation: true,
        });

        // Register MCP servers
        const serverConfigs = MCPManager.createDefaultServerConfigs();
        await mcpManager.registerServersFromConfigs(serverConfigs);
        await mcpManager.start();

        // Create tools using the factory
        const toolsFactory = new ProcurementToolsFactory(mcpManager);
        const tools = toolsFactory.createAllTools();

        logger.info(`Created ${tools.length} tools for Procurement Agent`);

        // Create Procurement Agent with tools
        const procurementAgent = new ProcurementAgent({
            agentId: "",
            name: "",
            description: "",
            tools,
            systemPrompt: `你是一个专业的采购智能体，负责管理家庭购物和采购计划。

你拥有以下工具来帮助用户：

**数据库工具**：
- import_orders: 导入多平台订单数据
- get_order_history: 查询历史订单
- get_shopping_list: 获取购物清单
- manage_shopping_list: 管理购物清单（增删改查）
- get_inventory_items: 查询库存物品
- analyze_purchase_patterns: 分析购买模式
- generate_purchase_recommendations: 生成采购建议

**文件处理工具**：
- upload_file: 上传文件
- parse_excel_file: 解析Excel文件
- process_image: 图像OCR处理

**通知工具**：
- send_notification: 发送通知

请根据用户的需求智能选择合适的工具来完成任务。当用户询问相关功能时，主动使用相应的工具来提供准确的信息和服务。`,
        });

        logger.info('Procurement Agent initialized successfully');
        logger.info(`Available tools: ${procurementAgent.getAvailableTools().join(', ')}`);

        // Example interactions
        const examples = [
            "你好，请介绍一下你的功能和可用的工具",
            "我想查看当前的购物清单",
            "帮我生成一些采购建议",
            "分析一下我最近的购买模式",
            "添加牛奶到购物清单，数量2，优先级高",
            "查询库存中的日用品类别物品",
        ];

        for (const [index, example] of examples.entries()) {
            logger.info(`\n=== 示例 ${index + 1}: ${example} ===`);

            try {
                const result = await procurementAgent.invoke(example, {
                    configurable: { thread_id: 'example-session' }
                });

                logger.info('Agent 响应:', {
                    messageCount: result.messages?.length || 0,
                });

                // Extract and display the response
                if (result.messages && result.messages.length > 0) {
                    const lastMessage = result.messages[result.messages.length - 1];
                    console.log(`\n智能体回复: ${lastMessage.content}\n`);
                }

            } catch (error) {
                logger.error('处理用户输入时出错', { example, error });
                console.log(`\n❌ 处理失败: ${error instanceof Error ? error.message : String(error)}\n`);
            }

            // Add a small delay between examples
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Demonstrate tool usage information
        logger.info('\n=== 工具信息展示 ===');
        console.log(`\n📊 工具统计:`);
        console.log(`- 总工具数: ${procurementAgent.getAvailableTools().length}`);
        console.log(`- 可用工具: ${procurementAgent.getAvailableTools().join(', ')}`);

        console.log(`\n🔧 工具详情:`);
        for (const toolName of procurementAgent.getAvailableTools()) {
            const description = procurementAgent.getToolDescription(toolName);
            console.log(`- ${toolName}: ${description}`);
        }

        // Example of streaming response
        logger.info('\n=== 流式响应示例 ===');
        const streamInput = "请详细解释你的采购建议功能是如何工作的，包括使用了哪些工具";

        try {
            console.log('\n🔄 开始流式响应...\n');
            const stream = await procurementAgent.stream(streamInput, {
                configurable: { thread_id: 'example-session' }
            });

            for await (const chunk of stream) {
                if (chunk.messages && chunk.messages.length > 0) {
                    const message = chunk.messages[chunk.messages.length - 1];
                    if (message.content) {
                        process.stdout.write(message.content);
                    }
                }
            }
            console.log('\n\n✅ 流式响应完成');

        } catch (error) {
            logger.error('流式响应出错', { error });
            console.log(`\n❌ 流式响应失败: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Cleanup
        await mcpManager.stop();
        logger.info('Procurement Agent Example completed successfully');

    } catch (error) {
        logger.error('Procurement Agent Example failed', { error });
        throw error;
    }
}

// Export for use in other modules
export { runProcurementAgentExample };

// Run example if this file is executed directly
if (require.main === module) {
    runProcurementAgentExample()
        .then(() => {
            console.log('\n🎉 Procurement Agent Example completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Procurement Agent Example failed:', error);
            process.exit(1);
        });
}
