/**
 * Unified Agent Example - Demonstrates consistent interface between InventoryAgent and ProcurementAgent
 */

import { InventoryAgent } from '@/agents/InventoryAgent';
import { ProcurementAgent } from '@/agents/ProcurementAgent';
import { MCPManager } from '@/mcp/MCPManager';

async function demonstrateUnifiedAgentInterface() {
    console.log('=== 统一智能体接口演示 ===\n');

    // 创建模拟的 MCP Manager
    const mockMCPManager = new MCPManager();

    // 1. 创建 InventoryAgent
    console.log('1. 创建库存智能体...');
    const { databaseTools: invDbTools, fileStorageTools: invFileTools, notificationTools: invNotifyTools } =
        InventoryAgent.createInventoryTools();

    const inventoryAgent = new InventoryAgent({
        agentId: 'inventory-001',
        name: 'HomeInventoryAgent',
        description: '家庭库存管理智能体',
        databaseTools: invDbTools,
        fileStorageTools: invFileTools,
        notificationTools: invNotifyTools,
        defaultThresholds: {
            '日用品': 2,
            '食品': 3,
            '清洁用品': 1,
            '个人护理': 2,
        },
    });

    // 2. 创建 ProcurementAgent
    console.log('2. 创建采购智能体...');
    const { databaseTools: procDbTools, fileStorageTools: procFileTools, notificationTools: procNotifyTools } =
        ProcurementAgent.createProcurementTools(mockMCPManager);

    const procurementAgent = new ProcurementAgent({
        agentId: 'procurement-001',
        name: 'HomeProcurementAgent',
        description: '家庭采购管理智能体',
        databaseTools: procDbTools,
        fileStorageTools: procFileTools,
        notificationTools: procNotifyTools,
        mcpManager: mockMCPManager,
        defaultPlatforms: ['淘宝', '京东', '拼多多'],
    });

    // 3. 初始化智能体
    console.log('3. 初始化智能体...');
    await inventoryAgent.initialize();
    await procurementAgent.initialize();

    // 4. 展示统一的接口
    console.log('\n=== 统一接口演示 ===');

    // 4.1 获取配置信息
    console.log('\n4.1 配置信息:');
    console.log('库存智能体配置:', {
        agentId: inventoryAgent.getConfig().agentId,
        name: inventoryAgent.getConfig().name,
        toolCount: inventoryAgent.getAvailableTools().length,
        thresholds: inventoryAgent.getThresholds(),
    });

    console.log('采购智能体配置:', {
        agentId: procurementAgent.getConfig().agentId,
        name: procurementAgent.getConfig().name,
        toolCount: procurementAgent.getAvailableTools().length,
        platforms: procurementAgent.getDefaultPlatforms(),
    });

    // 4.2 获取工具信息
    console.log('\n4.2 可用工具:');
    console.log('库存智能体工具:', inventoryAgent.getAvailableTools());
    console.log('采购智能体工具:', procurementAgent.getAvailableTools());

    // 4.3 获取指标信息
    console.log('\n4.3 性能指标:');
    console.log('库存智能体指标:', inventoryAgent.getMetrics());
    console.log('采购智能体指标:', procurementAgent.getMetrics());

    // 4.4 演示自然语言交互 (模拟)
    console.log('\n4.4 自然语言交互演示:');

    try {
        // 库存查询
        console.log('库存查询: "查询抽纸库存"');
        const inventoryResult = await inventoryAgent.processInventoryCommand('查询抽纸库存');
        console.log('库存智能体响应:', inventoryResult.success ? '成功' : '失败');

        // 采购建议
        console.log('采购建议: "生成购买建议"');
        const procurementResult = await procurementAgent.generatePurchaseRecommendations(30, ['日用品']);
        console.log('采购智能体响应:', procurementResult.success ? '成功' : '失败');

    } catch (error) {
        console.log('交互演示完成 (模拟环境)');
    }

    // 5. 展示配置更新
    console.log('\n5. 配置更新演示:');

    // 更新库存阈值
    inventoryAgent.updateThresholds({ '日用品': 5, '新类别': 3 });
    console.log('更新后的库存阈值:', inventoryAgent.getThresholds());

    // 更新采购平台
    procurementAgent.updateDefaultPlatforms(['淘宝', '京东', '天猫', '苏宁']);
    console.log('更新后的采购平台:', procurementAgent.getDefaultPlatforms());

    console.log('\n=== 演示完成 ===');
    console.log('两个智能体现在使用完全统一的接口模式！');
}

// 导出演示函数
export { demonstrateUnifiedAgentInterface };

// 如果直接运行此文件
if (require.main === module) {
    demonstrateUnifiedAgentInterface().catch(console.error);
}
