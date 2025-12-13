/**
 * File Storage Tools
 * DynamicTool implementations for file storage and processing operations
 */

import { DynamicTool } from '@langchain/core/tools';
import { FileStorageService } from '@/services/FileStorageService';
import { OCRService } from '@/services/OCRService';
import { ExcelParsingService } from '@/services/ExcelParsingService';
import { Logger } from '@/utils/Logger';

const logger = new Logger({
    component: 'FileStorageTools',
    level: 'info'
});

const fileStorageService = FileStorageService.getInstance();
const ocrService = OCRService.getInstance();
const excelParsingService = ExcelParsingService.getInstance();

// File upload and management tools

export const uploadFileTool = new DynamicTool({
    name: 'upload_file',
    description: '上传文件到存储系统。输入: {"fileBuffer": "base64编码的文件内容", "originalName": "原始文件名", "mimeType": "文件类型", "tags": ["标签1", "标签2"]}',
    func: async (input: string) => {
        try {
            const { fileBuffer, originalName, mimeType, tags = [] } = JSON.parse(input);

            if (!fileBuffer || !originalName || !mimeType) {
                return JSON.stringify({
                    success: false,
                    error: '文件内容、文件名和文件类型不能为空'
                });
            }

            // Decode base64 buffer
            const buffer = Buffer.from(fileBuffer, 'base64');

            const result = await fileStorageService.uploadFile(
                buffer,
                originalName,
                mimeType,
                'system', // uploadedBy
                tags
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    fileId: result.fileId,
                    metadata: result.metadata
                }
            });

        } catch (error) {
            logger.error('Failed to upload file', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getFileTool = new DynamicTool({
    name: 'get_file',
    description: '根据文件ID获取文件信息。输入: {"fileId": "文件ID"}',
    func: async (input: string) => {
        try {
            const { fileId } = JSON.parse(input);

            if (!fileId) {
                return JSON.stringify({
                    success: false,
                    error: '文件ID不能为空'
                });
            }

            const result = await fileStorageService.getFile(fileId);

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    metadata: result.metadata,
                    hasBuffer: !!result.buffer,
                    bufferSize: result.buffer?.length
                }
            });

        } catch (error) {
            logger.error('Failed to get file', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const deleteFileTool = new DynamicTool({
    name: 'delete_file',
    description: '删除文件。输入: {"fileId": "文件ID"}',
    func: async (input: string) => {
        try {
            const { fileId } = JSON.parse(input);

            if (!fileId) {
                return JSON.stringify({
                    success: false,
                    error: '文件ID不能为空'
                });
            }

            const result = await fileStorageService.deleteFile(fileId);

            return JSON.stringify(result);

        } catch (error) {
            logger.error('Failed to delete file', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Image processing tools

export const processImageTool = new DynamicTool({
    name: 'process_image',
    description: '处理图片（调整大小、优化质量）。输入: {"fileId": "文件ID", "resize": {"width": 宽度, "height": 高度}, "quality": 质量(1-100), "format": "输出格式(jpeg/png/webp)"}',
    func: async (input: string) => {
        try {
            const { fileId, resize, quality, format } = JSON.parse(input);

            if (!fileId) {
                return JSON.stringify({
                    success: false,
                    error: '文件ID不能为空'
                });
            }

            const result = await fileStorageService.processImage(fileId, {
                resize,
                quality,
                format
            });

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    processedPath: result.processedPath,
                    metadata: result.metadata
                }
            });

        } catch (error) {
            logger.error('Failed to process image', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// OCR tools

export const performOCRTool = new DynamicTool({
    name: 'perform_ocr',
    description: '对图片进行OCR文字识别。输入: {"fileId": "文件ID", "language": "识别语言(chi_sim+eng)", "options": {"psm": 页面分割模式, "oem": OCR引擎模式}}',
    func: async (input: string) => {
        try {
            const { fileId, language, options = {} } = JSON.parse(input);

            if (!fileId) {
                return JSON.stringify({
                    success: false,
                    error: '文件ID不能为空'
                });
            }

            const result = await ocrService.processImage(fileId, {
                language,
                ...options
            });

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    extractedText: result.extractedText,
                    confidence: result.confidence,
                    detectedFields: result.detectedFields,
                    processingTime: result.processingTime
                }
            });

        } catch (error) {
            logger.error('Failed to perform OCR', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const performOCRFromBufferTool = new DynamicTool({
    name: 'perform_ocr_from_buffer',
    description: '对图片缓冲区进行OCR文字识别。输入: {"imageBuffer": "base64编码的图片内容", "language": "识别语言", "options": {}}',
    func: async (input: string) => {
        try {
            const { imageBuffer, language, options = {} } = JSON.parse(input);

            if (!imageBuffer) {
                return JSON.stringify({
                    success: false,
                    error: '图片内容不能为空'
                });
            }

            // Decode base64 buffer
            const buffer = Buffer.from(imageBuffer, 'base64');

            const result = await ocrService.processImageBuffer(buffer, {
                language,
                ...options
            });

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    extractedText: result.extractedText,
                    confidence: result.confidence,
                    detectedFields: result.detectedFields,
                    processingTime: result.processingTime
                }
            });

        } catch (error) {
            logger.error('Failed to perform OCR from buffer', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Excel parsing tools

export const parseExcelFileTool = new DynamicTool({
    name: 'parse_excel_file',
    description: '解析Excel文件中的订单数据。输入: {"fileId": "文件ID", "platform": "平台名称(taobao/1688/jd/pdd/generic)"}',
    func: async (input: string) => {
        try {
            const { fileId, platform } = JSON.parse(input);

            if (!fileId || !platform) {
                return JSON.stringify({
                    success: false,
                    error: '文件ID和平台名称不能为空'
                });
            }

            const result = await excelParsingService.parseFile(fileId, platform);

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    orders: result.orders,
                    platform: result.platform,
                    totalRows: result.totalRows,
                    parsedRows: result.parsedRows,
                    skippedRows: result.skippedRows,
                    errors: result.errors
                }
            });

        } catch (error) {
            logger.error('Failed to parse Excel file', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const parseExcelBufferTool = new DynamicTool({
    name: 'parse_excel_buffer',
    description: '解析Excel缓冲区中的订单数据。输入: {"excelBuffer": "base64编码的Excel内容", "platform": "平台名称"}',
    func: async (input: string) => {
        try {
            const { excelBuffer, platform } = JSON.parse(input);

            if (!excelBuffer || !platform) {
                return JSON.stringify({
                    success: false,
                    error: 'Excel内容和平台名称不能为空'
                });
            }

            // Decode base64 buffer
            const buffer = Buffer.from(excelBuffer, 'base64');

            const result = await excelParsingService.parseBuffer(buffer, platform);

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    orders: result.orders,
                    platform: result.platform,
                    totalRows: result.totalRows,
                    parsedRows: result.parsedRows,
                    skippedRows: result.skippedRows,
                    errors: result.errors
                }
            });

        } catch (error) {
            logger.error('Failed to parse Excel buffer', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getSupportedPlatformsTool = new DynamicTool({
    name: 'get_supported_platforms',
    description: '获取支持的电商平台列表。输入: {}',
    func: async (input: string) => {
        try {
            const platforms = excelParsingService.getSupportedPlatforms();

            return JSON.stringify({
                success: true,
                data: {
                    platforms,
                    count: platforms.length
                }
            });

        } catch (error) {
            logger.error('Failed to get supported platforms', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Utility tools

export const cleanupTempFilesTool = new DynamicTool({
    name: 'cleanup_temp_files',
    description: '清理临时文件。输入: {"olderThanHours": 小时数(默认24)}',
    func: async (input: string) => {
        try {
            const { olderThanHours = 24 } = JSON.parse(input);

            await fileStorageService.cleanupTempFiles(olderThanHours);

            return JSON.stringify({
                success: true,
                data: {
                    message: `已清理超过${olderThanHours}小时的临时文件`
                }
            });

        } catch (error) {
            logger.error('Failed to cleanup temp files', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Tool factory functions for easy integration

export function createFileManagementTools(): DynamicTool[] {
    return [
        uploadFileTool,
        getFileTool,
        deleteFileTool,
        cleanupTempFilesTool
    ];
}

export function createImageProcessingTools(): DynamicTool[] {
    return [
        processImageTool,
        performOCRTool,
        performOCRFromBufferTool
    ];
}

export function createExcelParsingTools(): DynamicTool[] {
    return [
        parseExcelFileTool,
        parseExcelBufferTool,
        getSupportedPlatformsTool
    ];
}

export function createAllFileStorageTools(): DynamicTool[] {
    return [
        ...createFileManagementTools(),
        ...createImageProcessingTools(),
        ...createExcelParsingTools()
    ];
}
