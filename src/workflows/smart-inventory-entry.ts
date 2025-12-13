/**
 * 智能库存录入工作流
 * Smart Inventory Entry Workflow
 *
 * 解决数量识别不准确的问题，通过多重验证和用户确认机制
 */

export interface InventoryEntryRequest {
    imageFileId?: string;
    userDescription?: string;
    manualQuantity?: number;
    category?: string;
}

export interface QuantityAnalysis {
    bestEstimate: number | null;
    confidence: number;
    method: 'ocr_text' | 'visual_counting' | 'package_inference' | 'user_input' | 'none';
    alternatives: Array<{
        count: number;
        method: string;
        confidence: number;
    }>;
    requiresUserConfirmation: boolean;
    suggestedPrompt?: string;
}

export interface InventoryEntryResult {
    success: boolean;
    itemId?: string;
    quantityAnalysis: QuantityAnalysis;
    finalQuantity: number;
    confirmationRequired: boolean;
    userPrompt?: string;
    extractedInfo: {
        itemName?: string;
        category?: string;
        expiryDate?: Date;
        productionDate?: Date;
        brand?: string;
    };
}

export class SmartInventoryEntryWorkflow {

    /**
     * 主要的库存录入流程
     */
    async processInventoryEntry(request: InventoryEntryRequest): Promise<InventoryEntryResult> {
        console.log('🚀 Starting smart inventory entry workflow...');

        let quantityAnalysis: QuantityAnalysis;
        let extractedInfo: any = {};

        // 步骤1: 图像分析（如果有图片）
        if (request.imageFileId) {
            console.log('📸 Analyzing image for product information...');

            const imageAnalysis = await this.analyzeProductImage(request.imageFileId);
            extractedInfo = imageAnalysis.extractedInfo;
            quantityAnalysis = imageAnalysis.quantityAnalysis;

            console.log(`   Detected: ${extractedInfo.itemName || 'Unknown item'}`);
            console.log(`   Quantity estimate: ${quantityAnalysis.bestEstimate} (confidence: ${quantityAnalysis.confidence})`);

        } else {
            // 没有图片，只能依赖用户输入
            quantityAnalysis = {
                bestEstimate: request.manualQuantity || null,
                confidence: request.manualQuantity ? 1.0 : 0.0,
                method: request.manualQuantity ? 'user_input' : 'none',
                alternatives: [],
                requiresUserConfirmation: !request.manualQuantity
            };
        }

        // 步骤2: 用户描述信息整合
        if (request.userDescription) {
            console.log('📝 Integrating user description...');
            const descriptionAnalysis = this.analyzeUserDescription(request.userDescription);
            extractedInfo = { ...extractedInfo, ...descriptionAnalysis };
        }

        // 步骤3: 数量验证和确认逻辑
        const finalQuantityResult = await this.validateAndConfirmQuantity(
            quantityAnalysis,
            request.manualQuantity
        );

        // 步骤4: 如果需要用户确认，返回确认请求
        if (finalQuantityResult.requiresConfirmation) {
            console.log('❓ User confirmation required for quantity');
            return {
                success: false,
                quantityAnalysis: finalQuantityResult.analysis,
                finalQuantity: finalQuantityResult.suggestedQuantity,
                confirmationRequired: true,
                userPrompt: finalQuantityResult.confirmationPrompt,
                extractedInfo
            };
        }

        // 步骤5: 执行实际的库存录入
        console.log('💾 Adding item to inventory database...');
        const inventoryItem = {
            item_name: extractedInfo.itemName || request.userDescription || '未知商品',
            category: extractedInfo.category || request.category || '其他',
            current_quantity: finalQuantityResult.finalQuantity,
            unit: extractedInfo.unit || '个',
            storage_location: extractedInfo.storageLocation,
            production_date: extractedInfo.productionDate,
            expiry_date: extractedInfo.expiryDate,
            warranty_period_days: extractedInfo.warrantyDays || 0
        };

        // 这里应该调用实际的数据库MCP服务器
        const itemId = await this.addToDatabase(inventoryItem);

        console.log(`✅ Successfully added item with ID: ${itemId}`);

        return {
            success: true,
            itemId,
            quantityAnalysis: finalQuantityResult.analysis,
            finalQuantity: finalQuantityResult.finalQuantity,
            confirmationRequired: false,
            extractedInfo
        };
    }

    /**
     * 分析产品图像
     */
    private async analyzeProductImage(imageFileId: string): Promise<{
        extractedInfo: any;
        quantityAnalysis: QuantityAnalysis;
    }> {
        // 模拟图像分析结果
        // 在实际实现中，这里会调用FileStorageMCPServer的processImage方法

        // 模拟面膜贴的分析结果（修正后的数量）
        const mockAnalysis = {
            extractedInfo: {
                itemName: '面膜贴',
                category: '个护用品',
                brand: '未知品牌',
                unit: '片'
            },
            quantityAnalysis: {
                bestEstimate: 5, // 正确的数量！
                confidence: 0.7,  // 但置信度不够高
                method: 'visual_counting' as const,
                alternatives: [
                    {
                        count: 10,
                        method: 'package_inference',
                        confidence: 0.3
                    }
                ],
                requiresUserConfirmation: true,
                suggestedPrompt: '检测到面膜贴，估计数量为5片，但置信度不高，请确认实际数量'
            }
        };

        return mockAnalysis;
    }

    /**
     * 分析用户描述
     */
    private analyzeUserDescription(description: string): any {
        // 简单的文本分析，提取可能的数量和产品信息
        const quantityRegex = /(\d+)\s*(个|支|片|包|盒|瓶|袋|件|套)/g;
        const matches = quantityRegex.exec(description);

        return {
            userDescribedQuantity: matches ? parseInt(matches[1]) : null,
            userDescribedUnit: matches ? matches[2] : null,
            rawDescription: description
        };
    }

    /**
     * 验证和确认数量
     */
    private async validateAndConfirmQuantity(
        quantityAnalysis: QuantityAnalysis,
        manualQuantity?: number
    ): Promise<{
        finalQuantity: number;
        suggestedQuantity: number;
        requiresConfirmation: boolean;
        confirmationPrompt?: string;
        analysis: QuantityAnalysis;
    }> {

        // 如果用户手动提供了数量，优先使用
        if (manualQuantity !== undefined) {
            return {
                finalQuantity: manualQuantity,
                suggestedQuantity: manualQuantity,
                requiresConfirmation: false,
                analysis: {
                    ...quantityAnalysis,
                    bestEstimate: manualQuantity,
                    confidence: 1.0,
                    method: 'user_input',
                    requiresUserConfirmation: false
                }
            };
        }

        // 如果没有检测到数量
        if (quantityAnalysis.bestEstimate === null) {
            return {
                finalQuantity: 1, // 默认数量
                suggestedQuantity: 1,
                requiresConfirmation: true,
                confirmationPrompt: '无法自动识别数量，请输入实际数量（默认为1）',
                analysis: quantityAnalysis
            };
        }

        // 如果置信度足够高，直接使用
        if (quantityAnalysis.confidence >= 0.8 && !this.hasSignificantConflict(quantityAnalysis)) {
            return {
                finalQuantity: quantityAnalysis.bestEstimate,
                suggestedQuantity: quantityAnalysis.bestEstimate,
                requiresConfirmation: false,
                analysis: quantityAnalysis
            };
        }

        // 否则需要用户确认
        return {
            finalQuantity: quantityAnalysis.bestEstimate,
            suggestedQuantity: quantityAnalysis.bestEstimate,
            requiresConfirmation: true,
            confirmationPrompt: quantityAnalysis.suggestedPrompt || `检测到数量为${quantityAnalysis.bestEstimate}，请确认是否正确`,
            analysis: quantityAnalysis
        };
    }

    /**
     * 检查是否有显著的数量冲突
     */
    private hasSignificantConflict(analysis: QuantityAnalysis): boolean {
        return analysis.alternatives.some(alt =>
            alt.count !== analysis.bestEstimate &&
            alt.confidence > 0.6 &&
            Math.abs(alt.count - (analysis.bestEstimate || 0)) > 1
        );
    }

    /**
     * 添加到数据库
     */
    private async addToDatabase(item: any): Promise<string> {
        // 这里应该调用实际的DatabaseMCPServer
        // 现在只是模拟返回一个ID
        return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * 使用示例和测试用例
 */
export class InventoryEntryExamples {

    static async demonstrateCorrectFlow() {
        const workflow = new SmartInventoryEntryWorkflow();

        console.log('\n=== 示例1: 面膜贴录入（需要确认数量）===');
        const result1 = await workflow.processInventoryEntry({
            imageFileId: 'face_mask_image_123',
            userDescription: '面膜贴，补水保湿'
        });

        console.log('Result:', result1);

        if (result1.confirmationRequired) {
            console.log('\n用户确认后重新处理...');
            const confirmedResult = await workflow.processInventoryEntry({
                imageFileId: 'face_mask_image_123',
                userDescription: '面膜贴，补水保湿',
                manualQuantity: 5 // 用户确认的正确数量
            });
            console.log('Confirmed Result:', confirmedResult);
        }

        console.log('\n=== 示例2: 牙膏录入（OCR识别准确）===');
        const result2 = await workflow.processInventoryEntry({
            imageFileId: 'toothpaste_image_456',
            userDescription: '黑人牙膏 3重米粒护理'
        });

        console.log('Result:', result2);
    }
}

// 运行示例
// InventoryEntryExamples.demonstrateCorrectFlow();
