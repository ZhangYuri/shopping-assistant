/**
 * Tests for the new InventoryAgent implementation
 */

import { InventoryAgent } from '../agents/InventoryAgent';
import { ChatDeepSeek } from '@langchain/deepseek';

// Mock the ChatDeepSeek to avoid API calls in tests
jest.mock('@langchain/deepseek', () => ({
    ChatDeepSeek: jest.fn().mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
            content: '模拟的智能体回复：操作已完成',
        }),
        stream: jest.fn().mockImplementation(async function* () {
            yield { content: '模拟' };
            yield { content: '流式' };
            yield { content: '回复' };
        }),
    })),
}));

// Mock createReactAgent to avoid LangGraph initialization
jest.mock('@langchain/langgraph/prebuilt', () => ({
    createReactAgent: jest.fn().mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
            messages: [
                {
                    content: '模拟的智能体回复：操作已完成',
                    role: 'assistant',
                },
            ],
        }),
        stream: jest.fn().mockImplementation(async function* () {
            yield {
                messages: [{ content: '模拟流式回复' }],
            };
        }),
    })),
}));

// Mock MemorySaver
jest.mock('@langchain/langgraph', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({})),
}));

describe('InventoryAgent', () => {
    let inventoryAgent: InventoryAgent;

    beforeEach(() => {
        // Create mock tools
        const { databaseTools, fileStorageTools, notificationTools } = InventoryAgent.createInventoryTools();

        // Initialize agent with test configuration
        inventoryAgent = new InventoryAgent({
            agentId: 'test-inventory-agent',
            name: 'TestInventoryAgent',
            description: 'Test inventory agent for unit testing',
            databaseTools,
            fileStorageTools,
            notificationTools,
            defaultThresholds: {
                '日用品': 2,
                '食品': 3,
            },
            // Use mocked model for testing
            model: new ChatDeepSeek({
                apiKey: 'mock-key',
                model: 'deepseek-chat',
            }),
        });
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            await expect(inventoryAgent.initialize()).resolves.not.toThrow();
        });

        it('should have correct configuration', () => {
            const config = inventoryAgent.getConfig();
            expect(config.agentId).toBe('test-inventory-agent');
            expect(config.name).toBe('TestInventoryAgent');
            expect(config.tools.length).toBeGreaterThan(0);
        });

        it('should have default thresholds set', () => {
            const thresholds = inventoryAgent.getThresholds();
            expect(thresholds['日用品']).toBe(2);
            expect(thresholds['食品']).toBe(3);
        });
    });

    describe('Tool Management', () => {
        beforeEach(async () => {
            await inventoryAgent.initialize();
        });

        it('should have required database tools', () => {
            const tools = inventoryAgent.getAvailableTools();
            expect(tools).toContain('getInventoryItem');
            expect(tools).toContain('updateInventoryQuantity');
            expect(tools).toContain('addInventoryItem');
            expect(tools).toContain('searchInventoryItems');
        });

        it('should have file storage tools', () => {
            const tools = inventoryAgent.getAvailableTools();
            expect(tools).toContain('processImage');
            expect(tools).toContain('getFileMetadata');
        });

        it('should have notification tools', () => {
            const tools = inventoryAgent.getAvailableTools();
            expect(tools).toContain('sendLowStockAlert');
            expect(tools).toContain('notifyProcurementAgent');
        });

        it('should provide tool descriptions', () => {
            const description = inventoryAgent.getToolDescription('getInventoryItem');
            expect(description).toBeDefined();
            expect(description).toContain('查询库存信息');
        });
    });

    describe('Inventory Operations', () => {
        beforeEach(async () => {
            await inventoryAgent.initialize();
        });

        it('should process natural language commands', async () => {
            const result = await inventoryAgent.processInventoryCommand('查询抽纸库存');

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
            expect(result.messages.length).toBeGreaterThan(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should handle photo upload requests', async () => {
            const result = await inventoryAgent.processPhotoUpload('test-photo-id', '新买的抽纸');

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should check inventory levels', async () => {
            const result = await inventoryAgent.checkInventoryLevels();

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate inventory reports', async () => {
            const result = await inventoryAgent.getInventoryReport();

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate item-specific reports', async () => {
            const result = await inventoryAgent.getInventoryReport('抽纸');

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });
    });

    describe('Threshold Management', () => {
        beforeEach(async () => {
            await inventoryAgent.initialize();
        });

        it('should update thresholds', () => {
            const newThresholds = { '日用品': 5, '清洁用品': 3 };
            inventoryAgent.updateThresholds(newThresholds);

            const updatedThresholds = inventoryAgent.getThresholds();
            expect(updatedThresholds['日用品']).toBe(5);
            expect(updatedThresholds['清洁用品']).toBe(3);
        });

        it('should preserve existing thresholds when updating', () => {
            inventoryAgent.updateThresholds({ '个人护理': 4 });

            const thresholds = inventoryAgent.getThresholds();
            expect(thresholds['日用品']).toBe(2); // Original value preserved
            expect(thresholds['食品']).toBe(3); // Original value preserved
            expect(thresholds['个人护理']).toBe(4); // New value added
        });
    });

    describe('Metrics and Monitoring', () => {
        beforeEach(async () => {
            await inventoryAgent.initialize();
        });

        it('should track metrics', async () => {
            const initialMetrics = inventoryAgent.getMetrics();
            expect(initialMetrics.tasksCompleted).toBe(0);
            expect(initialMetrics.tasksFailedCount).toBe(0);

            // Process a command to update metrics
            await inventoryAgent.processInventoryCommand('查询库存');

            const updatedMetrics = inventoryAgent.getMetrics();
            expect(updatedMetrics.tasksCompleted).toBe(1);
            expect(updatedMetrics.averageResponseTime).toBeGreaterThanOrEqual(0);
        });

        it('should update last active time', async () => {
            const initialMetrics = inventoryAgent.getMetrics();
            const initialTime = initialMetrics.lastActiveTime;

            // Wait a bit and process a command
            await new Promise(resolve => setTimeout(resolve, 10));
            await inventoryAgent.processInventoryCommand('查询库存');

            const updatedMetrics = inventoryAgent.getMetrics();
            expect(updatedMetrics.lastActiveTime.getTime()).toBeGreaterThan(initialTime.getTime());
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await inventoryAgent.initialize();
        });

        it('should handle empty commands gracefully', async () => {
            const result = await inventoryAgent.processInventoryCommand('');

            // Should not throw, but may return an error response
            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
        });

        it('should handle invalid photo IDs', async () => {
            const result = await inventoryAgent.processPhotoUpload('invalid-id', '测试描述');

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
        });
    });

    describe('Streaming Responses', () => {
        beforeEach(async () => {
            await inventoryAgent.initialize();
        });

        it('should support streaming responses', async () => {
            const stream = await inventoryAgent.stream('生成库存报告');

            expect(stream).toBeDefined();
            expect(typeof stream[Symbol.asyncIterator]).toBe('function');
        });
    });
});
