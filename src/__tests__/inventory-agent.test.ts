/**
 * Inventory Agent Tests
 */

import { InventoryAgent } from '@/agents/InventoryAgent';
import { MCPManager } from '@/mcp/MCPManager';
import { AgentConfig } from '@/types/agent.types';

// Mock MCP Manager
const mockMCPManager = {
    isServerRegistered: jest.fn().mockReturnValue(true),
    callTool: jest.fn(),
} as unknown as MCPManager;

// Mock agent config
const mockConfig: AgentConfig = {
    agentId: 'inventory-test',
    agentType: 'inventory',
    name: 'Test Inventory Agent',
    description: 'Test inventory agent',
    capabilities: ['natural_language_inventory'],
    retryPolicy: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 5000,
    },
    maxConcurrentTasks: 5,
    timeoutMs: 30000,
};

describe('InventoryAgent', () => {
    let agent: InventoryAgent;

    beforeEach(() => {
        jest.clearAllMocks();
        agent = new InventoryAgent(mockConfig, mockMCPManager);
    });

    describe('Natural Language Command Processing', () => {
        test('should parse consumption command correctly', async () => {
            // Mock database response
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        id: 1,
                        item_name: '抽纸',
                        current_quantity: 5,
                        unit: '包',
                        category: '日用品',
                    },
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: true,
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        id: 1,
                        item_name: '抽纸',
                        current_quantity: 4,
                        unit: '包',
                        category: '日用品',
                    },
                });

            const result = await agent.processNaturalLanguageCommand('抽纸消耗1包');

            expect(result.success).toBe(true);
            expect(result.message).toContain('成功消耗');
            expect(result.previousQuantity).toBe(5);
            expect(result.newQuantity).toBe(4);
        });

        test('should parse addition command correctly', async () => {
            // Mock database response for new item
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: null, // Item doesn't exist
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: '123', // New item ID
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: [{
                        id: 123,
                        item_name: '牛奶',
                        current_quantity: 2,
                        unit: '瓶',
                        category: '食品',
                    }],
                });

            const result = await agent.processNaturalLanguageCommand('添加牛奶2瓶');

            expect(result.success).toBe(true);
            expect(result.message).toContain('成功添加新物品');
            expect(result.newQuantity).toBe(2);
        });

        test('should handle insufficient stock', async () => {
            // Mock database response
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        id: 1,
                        item_name: '抽纸',
                        current_quantity: 1,
                        unit: '包',
                        category: '日用品',
                    },
                });

            const result = await agent.processNaturalLanguageCommand('抽纸消耗3包');

            expect(result.success).toBe(false);
            expect(result.message).toContain('库存不足');
        });

        test('should handle unclear commands', async () => {
            const result = await agent.processNaturalLanguageCommand('不清楚的命令');

            expect(result.success).toBe(false);
            expect(result.message).toContain('命令不够清晰');
        });
    });

    describe('Inventory Threshold Monitoring', () => {
        test('should detect low stock items', async () => {
            // Mock database responses for different categories
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: [{
                        id: 1,
                        item_name: '抽纸',
                        current_quantity: 1,
                        unit: '包',
                        category: '日用品',
                    }],
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: [],
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: [],
                })
                .mockResolvedValueOnce({
                    success: true,
                    data: [],
                });

            const alerts = await agent.checkInventoryLevels();

            expect(alerts).toHaveLength(1);
            expect(alerts[0].item.item_name).toBe('抽纸');
            expect(alerts[0].recommendedAction).toContain('建议');
        });

        test('should handle empty inventory', async () => {
            // Mock empty responses
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValue({
                    success: true,
                    data: [],
                });

            const alerts = await agent.checkInventoryLevels();

            expect(alerts).toHaveLength(0);
        });
    });

    describe('Photo Processing', () => {
        test('should handle successful OCR processing', async () => {
            // Mock file metadata
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        fileId: 'test-file-id',
                        mimeType: 'image/jpeg',
                        originalName: 'test.jpg',
                    },
                })
                // Mock OCR result
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        extractedText: '维他奶 豆奶 250ml',
                        confidence: 0.9,
                        detectedFields: [{
                            fieldType: 'product_name',
                            value: '维他奶',
                            confidence: 0.9,
                        }],
                    },
                });

            const result = await agent.processPhotoUpload('test-file-id', '维他奶');

            expect(result.success).toBe(true);
            expect(result.message).toContain('成功处理照片');
        });

        test('should handle OCR failure gracefully', async () => {
            // Mock file metadata
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        fileId: 'test-file-id',
                        mimeType: 'image/jpeg',
                        originalName: 'test.jpg',
                    },
                })
                // Mock OCR failure
                .mockResolvedValueOnce({
                    success: false,
                    error: 'OCR processing failed',
                });

            const result = await agent.processPhotoUpload('test-file-id', '手动输入的物品');

            expect(result.success).toBe(true);
            expect(result.message).toContain('图像识别失败，已根据描述处理');
        });

        test('should reject non-image files', async () => {
            // Mock file metadata for non-image
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: {
                        fileId: 'test-file-id',
                        mimeType: 'text/plain',
                        originalName: 'test.txt',
                    },
                });

            const result = await agent.processPhotoUpload('test-file-id', '测试');

            expect(result.success).toBe(false);
            expect(result.message).toContain('文件不是图片格式');
        });
    });

    describe('Inventory Health Report', () => {
        test('should generate comprehensive health report', async () => {
            // Mock all inventory items
            (mockMCPManager.callTool as jest.Mock)
                .mockResolvedValueOnce({
                    success: true,
                    data: [
                        {
                            id: 1,
                            item_name: '抽纸',
                            current_quantity: 5,
                            category: '日用品',
                            updated_at: new Date(),
                        },
                        {
                            id: 2,
                            item_name: '牛奶',
                            current_quantity: 2,
                            category: '食品',
                            updated_at: new Date(),
                        },
                    ],
                })
                // Mock low stock check (empty results for simplicity)
                .mockResolvedValue({
                    success: true,
                    data: [],
                });

            const report = await agent.getInventoryHealthReport();

            expect(report.totalItems).toBe(2);
            expect(report.categoryBreakdown).toHaveProperty('日用品', 1);
            expect(report.categoryBreakdown).toHaveProperty('食品', 1);
            expect(report.recommendations).toContain('库存状况良好，无需特别关注');
        });
    });
});
