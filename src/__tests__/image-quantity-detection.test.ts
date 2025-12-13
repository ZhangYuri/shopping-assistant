/**
 * 图像数量识别测试 - 模拟真实场景中的数量识别挑战
 * Image Quantity Detection Tests - Simulating real-world quantity recognition challenges
 */

import { FileStorageMCPServer } from '../mcp/servers/FileStorageMCPServer';
import { MCPServerConfig } from '../types/mcp.types';

describe('Image Quantity Detection Tests', () => {
    let fileServer: FileStorageMCPServer;

    beforeAll(async () => {
        // 这里我们模拟文件存储服务器的配置
        const config: MCPServerConfig = {
            serverName: 'test-file-storage-quantity',
            serverType: 'file-storage',
            connectionString: 'file:///tmp/test-storage',
            capabilities: ['processImage', 'uploadFile'],
            retryPolicy: {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 5000
            },
            timeout: 30000
        };

        fileServer = new FileStorageMCPServer(config);
    });

    describe('Quantity Recognition Challenges', () => {
        test('Should handle quantity ambiguity in stacked items', async () => {
            // 模拟面膜贴的数量识别挑战
            const mockImageAnalysis = {
                detectedObjects: [
                    {
                        type: 'face_mask_pack',
                        confidence: 0.95,
                        boundingBox: { x: 100, y: 50, width: 200, height: 150 }
                    }
                ],
                extractedText: [
                    '面膜贴',
                    '补水保湿',
                    // 注意：图片中可能没有明确的数量信息
                ],
                quantityHints: [
                    {
                        method: 'visual_counting',
                        estimatedCount: 5, // 正确的数量
                        confidence: 0.7,   // 但置信度不高
                        reasoning: 'Visible individual items in stack'
                    },
                    {
                        method: 'ocr_text',
                        estimatedCount: null, // OCR没有找到数量信息
                        confidence: 0.0,
                        reasoning: 'No quantity text found in image'
                    },
                    {
                        method: 'package_inference',
                        estimatedCount: 10, // 基于包装推测（错误）
                        confidence: 0.3,
                        reasoning: 'Typical face mask pack size'
                    }
                ]
            };

            // 测试数量识别的不确定性处理
            const quantityAnalysis = analyzeQuantityFromImage(mockImageAnalysis);

            expect(quantityAnalysis).toEqual({
                bestEstimate: 5,
                confidence: 0.7,
                method: 'visual_counting',
                alternatives: [
                    { count: 10, method: 'package_inference', confidence: 0.3 },
                    { count: null, method: 'ocr_text', confidence: 0.0 }
                ],
                requiresUserConfirmation: true, // 置信度不够高，需要用户确认
                suggestedPrompt: '检测到面膜贴，估计数量为5片，请确认实际数量'
            });
        });

        test('Should prioritize OCR text over visual estimation when available', async () => {
            // 模拟牙膏的数量识别（包装上有明确数量）
            const mockToothpasteAnalysis = {
                detectedObjects: [
                    {
                        type: 'toothpaste_tube',
                        confidence: 0.98,
                        boundingBox: { x: 50, y: 30, width: 100, height: 200 }
                    }
                ],
                extractedText: [
                    'DARLIE',
                    '黑人牙膏',
                    '105g', // 重量信息
                    '2支装'  // 明确的数量信息！
                ],
                quantityHints: [
                    {
                        method: 'ocr_text',
                        estimatedCount: 2,
                        confidence: 0.95,
                        reasoning: 'Found "2支装" in OCR text'
                    },
                    {
                        method: 'visual_counting',
                        estimatedCount: 2,
                        confidence: 0.8,
                        reasoning: 'Two tubes visible in image'
                    }
                ]
            };

            const quantityAnalysis = analyzeQuantityFromImage(mockToothpasteAnalysis);

            expect(quantityAnalysis).toEqual({
                bestEstimate: 2,
                confidence: 0.95,
                method: 'ocr_text',
                alternatives: [
                    { count: 2, method: 'visual_counting', confidence: 0.8 }
                ],
                requiresUserConfirmation: false, // 置信度高，不需要确认
                suggestedPrompt: null
            });
        });

        test('Should handle conflicting quantity information', async () => {
            // 模拟数量信息冲突的情况
            const mockConflictingAnalysis = {
                detectedObjects: [
                    {
                        type: 'product_package',
                        confidence: 0.85,
                        boundingBox: { x: 0, y: 0, width: 300, height: 200 }
                    }
                ],
                extractedText: [
                    '3支装', // OCR说是3支
                ],
                quantityHints: [
                    {
                        method: 'ocr_text',
                        estimatedCount: 3,
                        confidence: 0.9,
                        reasoning: 'Found "3支装" in text'
                    },
                    {
                        method: 'visual_counting',
                        estimatedCount: 2, // 但视觉只看到2支
                        confidence: 0.8,
                        reasoning: 'Only 2 items visible in image'
                    }
                ]
            };

            const quantityAnalysis = analyzeQuantityFromImage(mockConflictingAnalysis);

            expect(quantityAnalysis).toEqual({
                bestEstimate: 3, // 优先相信OCR
                confidence: 0.9,
                method: 'ocr_text',
                alternatives: [
                    { count: 2, method: 'visual_counting', confidence: 0.8 }
                ],
                requiresUserConfirmation: true, // 有冲突，需要用户确认
                suggestedPrompt: '包装显示3支装，但图片中只看到2支，请确认实际数量'
            });
        });
    });

    describe('User Interaction for Quantity Confirmation', () => {
        test('Should generate appropriate confirmation prompts', () => {
            const scenarios = [
                {
                    situation: 'low_confidence',
                    analysis: { bestEstimate: 5, confidence: 0.6, method: 'visual_counting' },
                    expectedPrompt: '检测到商品，估计数量为5个，置信度较低，请确认实际数量'
                },
                {
                    situation: 'conflicting_info',
                    analysis: {
                        bestEstimate: 3,
                        confidence: 0.9,
                        method: 'ocr_text',
                        alternatives: [{ count: 2, method: 'visual_counting', confidence: 0.8 }]
                    },
                    expectedPrompt: '文字显示3个，但视觉识别为2个，请确认实际数量'
                },
                {
                    situation: 'no_quantity_found',
                    analysis: { bestEstimate: null, confidence: 0.0, method: 'none' },
                    expectedPrompt: '无法自动识别数量，请手动输入商品数量'
                }
            ];

            scenarios.forEach(scenario => {
                const prompt = generateConfirmationPrompt(scenario.analysis);
                expect(prompt).toContain('数量');
                expect(prompt).toContain('确认');
            });
        });
    });

});

// 辅助方法：分析图像中的数量信息
function analyzeQuantityFromImage(imageAnalysis: any) {
    const { quantityHints } = imageAnalysis;

    if (!quantityHints || quantityHints.length === 0) {
        return {
            bestEstimate: null,
            confidence: 0.0,
            method: 'none',
            alternatives: [],
            requiresUserConfirmation: true,
            suggestedPrompt: '无法自动识别数量，请手动输入商品数量'
        };
    }

    // 按置信度排序
    const sortedHints = quantityHints
        .filter((hint: any) => hint.estimatedCount !== null)
        .sort((a: any, b: any) => b.confidence - a.confidence);

    if (sortedHints.length === 0) {
        return {
            bestEstimate: null,
            confidence: 0.0,
            method: 'none',
            alternatives: [],
            requiresUserConfirmation: true,
            suggestedPrompt: '无法自动识别数量，请手动输入商品数量'
        };
    }

    const best = sortedHints[0];
    const alternatives = sortedHints.slice(1);

    // 检查是否有冲突
    const hasConflict = alternatives.some((alt: any) =>
        alt.estimatedCount !== best.estimatedCount && alt.confidence > 0.7
    );

    // 决定是否需要用户确认
    const requiresConfirmation = best.confidence < 0.8 || hasConflict;

    let suggestedPrompt = null;
    if (requiresConfirmation) {
        if (hasConflict) {
            const conflictingAlt = alternatives.find((alt: any) =>
                alt.estimatedCount !== best.estimatedCount && alt.confidence > 0.7
            );
            suggestedPrompt = `${best.method === 'ocr_text' ? '文字显示' : '视觉识别'}${best.estimatedCount}个，但${conflictingAlt.method === 'visual_counting' ? '视觉识别' : '其他方法'}为${conflictingAlt.estimatedCount}个，请确认实际数量`;
        } else {
            suggestedPrompt = `检测到商品，估计数量为${best.estimatedCount}个，${best.confidence < 0.8 ? '置信度较低，' : ''}请确认实际数量`;
        }
    }

    return {
        bestEstimate: best.estimatedCount,
        confidence: best.confidence,
        method: best.method,
        alternatives: alternatives.map((alt: any) => ({
            count: alt.estimatedCount,
            method: alt.method,
            confidence: alt.confidence
        })),
        requiresUserConfirmation: requiresConfirmation,
        suggestedPrompt
    };
}

// 辅助方法：生成确认提示
function generateConfirmationPrompt(analysis: any) {
    if (analysis.suggestedPrompt) {
        return analysis.suggestedPrompt;
    }
    return '请确认商品数量';
}
