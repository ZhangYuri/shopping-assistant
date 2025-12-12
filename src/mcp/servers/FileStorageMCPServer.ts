/**
 * File Storage MCP Server - Provides file storage, OCR, and Excel processing services
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import { BaseMCPServer } from '../base/BaseMCPServer';
import { MCPServerConfig, MCPToolDefinition } from '@/types/mcp.types';

// File-related interfaces
interface FileMetadata {
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    uploadedBy: string;
    uploadedAt: Date;
    tags: string[];
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

interface OCRResult {
    fileId: string;
    extractedText: string;
    confidence: number;
    detectedFields: DetectedField[];
    processingTime: number;
}

interface DetectedField {
    fieldType: 'expiry_date' | 'production_date' | 'warranty_info' | 'product_name' | 'price' | 'other';
    value: string;
    confidence: number;
    boundingBox?: BoundingBox;
}

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ImageProcessingOptions {
    enhanceImage?: boolean;
    language?: string;
    detectFields?: boolean;
    outputFormat?: 'text' | 'structured';
}

interface ExcelData {
    sheets: ExcelSheet[];
    metadata: {
        fileName: string;
        totalSheets: number;
        processingTime: number;
    };
}

interface ExcelSheet {
    name: string;
    data: any[][];
    headers?: string[];
    rowCount: number;
    columnCount: number;
}

interface FileStorageConfig {
    storagePath: string;
    maxFileSize: number;
    allowedMimeTypes: string[];
    ocrLanguage: string;
}

export class FileStorageMCPServer extends BaseMCPServer {
    private storageConfig: FileStorageConfig;
    private fileMetadataStore: Map<string, FileMetadata> = new Map();

    constructor(config: MCPServerConfig) {
        super(config);

        // Parse storage configuration from connection string
        this.storageConfig = this.parseStorageConfig(config.connectionString);
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing File Storage MCP Server');

        // Ensure storage directory exists
        try {
            await fs.access(this.storageConfig.storagePath);
        } catch {
            await fs.mkdir(this.storageConfig.storagePath, { recursive: true });
            this.logger.info('Created storage directory', { path: this.storageConfig.storagePath });
        }

        // Create subdirectories for different file types
        const subdirs = ['images', 'documents', 'temp', 'processed'];
        for (const subdir of subdirs) {
            const dirPath = path.join(this.storageConfig.storagePath, subdir);
            try {
                await fs.access(dirPath);
            } catch {
                await fs.mkdir(dirPath, { recursive: true });
            }
        }

        this.logger.info('File Storage MCP Server initialized successfully');
    }

    protected async onConnect(): Promise<void> {
        // Test storage access
        try {
            const testFile = path.join(this.storageConfig.storagePath, 'test.txt');
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            this.logger.info('File storage connection established successfully');
        } catch (error) {
            throw new Error(`Failed to connect to file storage: ${error}`);
        }
    }

    protected async onDisconnect(): Promise<void> {
        // Clean up any temporary files
        const tempDir = path.join(this.storageConfig.storagePath, 'temp');
        try {
            const files = await fs.readdir(tempDir);
            for (const file of files) {
                await fs.unlink(path.join(tempDir, file));
            }
            this.logger.info('Cleaned up temporary files');
        } catch (error) {
            this.logger.warn('Failed to clean up temporary files', { error });
        }
    }

    protected async onHealthCheck(): Promise<boolean> {
        try {
            // Check if storage directory is accessible
            await fs.access(this.storageConfig.storagePath);

            // Check if we can write to storage
            const testFile = path.join(this.storageConfig.storagePath, 'health-check.txt');
            await fs.writeFile(testFile, 'health check');
            await fs.unlink(testFile);

            return true;
        } catch (error) {
            this.logger.error('File storage health check failed', { error });
            return false;
        }
    }

    protected async onCallTool<T = any>(toolName: string, parameters: any): Promise<T> {
        switch (toolName) {
            case 'uploadFile':
                return this.uploadFile(parameters.file, parameters.metadata) as T;
            case 'downloadFile':
                return this.downloadFile(parameters.fileId) as T;
            case 'processImage':
                return this.processImage(parameters.fileId, parameters.options) as T;
            case 'parseExcelFile':
                return this.parseExcelFile(parameters.fileId, parameters.sheetName) as T;
            case 'deleteFile':
                return this.deleteFile(parameters.fileId) as T;
            case 'getFileMetadata':
                return this.getFileMetadata(parameters.fileId) as T;
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    protected async onGetAvailableTools(): Promise<MCPToolDefinition[]> {
        return [
            {
                name: 'uploadFile',
                description: 'Upload a file to storage',
                inputSchema: {
                    type: 'object',
                    properties: {
                        file: {
                            type: 'string',
                            description: 'Base64 encoded file content'
                        },
                        metadata: {
                            type: 'object',
                            properties: {
                                originalName: { type: 'string' },
                                mimeType: { type: 'string' },
                                uploadedBy: { type: 'string' },
                                tags: {
                                    type: 'array',
                                    items: { type: 'string' }
                                }
                            },
                            required: ['originalName', 'mimeType', 'uploadedBy']
                        }
                    },
                    required: ['file', 'metadata']
                },
                outputSchema: {
                    type: 'string',
                    description: 'File ID of the uploaded file'
                },
                serverName: this.config.serverName
            },
            {
                name: 'downloadFile',
                description: 'Download a file from storage',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fileId: {
                            type: 'string',
                            description: 'ID of the file to download'
                        }
                    },
                    required: ['fileId']
                },
                outputSchema: {
                    type: 'string',
                    description: 'Base64 encoded file content'
                },
                serverName: this.config.serverName
            },
            {
                name: 'processImage',
                description: 'Process image with OCR and field detection',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fileId: {
                            type: 'string',
                            description: 'ID of the image file to process'
                        },
                        options: {
                            type: 'object',
                            properties: {
                                enhanceImage: { type: 'boolean' },
                                language: { type: 'string' },
                                detectFields: { type: 'boolean' },
                                outputFormat: {
                                    type: 'string',
                                    enum: ['text', 'structured']
                                }
                            }
                        }
                    },
                    required: ['fileId']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        fileId: { type: 'string' },
                        extractedText: { type: 'string' },
                        confidence: { type: 'number' },
                        detectedFields: { type: 'array' },
                        processingTime: { type: 'number' }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'parseExcelFile',
                description: 'Parse Excel file and extract data',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fileId: {
                            type: 'string',
                            description: 'ID of the Excel file to parse'
                        },
                        sheetName: {
                            type: 'string',
                            description: 'Optional specific sheet name to parse'
                        }
                    },
                    required: ['fileId']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        sheets: { type: 'array' },
                        metadata: { type: 'object' }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'deleteFile',
                description: 'Delete a file from storage',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fileId: {
                            type: 'string',
                            description: 'ID of the file to delete'
                        }
                    },
                    required: ['fileId']
                },
                outputSchema: {
                    type: 'boolean',
                    description: 'True if file was successfully deleted'
                },
                serverName: this.config.serverName
            },
            {
                name: 'getFileMetadata',
                description: 'Get metadata for a file',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fileId: {
                            type: 'string',
                            description: 'ID of the file'
                        }
                    },
                    required: ['fileId']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        fileId: { type: 'string' },
                        originalName: { type: 'string' },
                        mimeType: { type: 'string' },
                        size: { type: 'number' },
                        uploadedBy: { type: 'string' },
                        uploadedAt: { type: 'string' },
                        tags: { type: 'array' },
                        processingStatus: { type: 'string' }
                    }
                },
                serverName: this.config.serverName
            }
        ];
    }

    // File operations
    private async uploadFile(fileBase64: string, metadata: Partial<FileMetadata>): Promise<string> {
        const fileId = uuidv4();
        const fileBuffer = Buffer.from(fileBase64, 'base64');

        // Validate file size
        if (fileBuffer.length > this.storageConfig.maxFileSize) {
            throw new Error(`File size exceeds maximum allowed size of ${this.storageConfig.maxFileSize} bytes`);
        }

        // Validate MIME type
        if (!this.isMimeTypeAllowed(metadata.mimeType!)) {
            throw new Error(`MIME type ${metadata.mimeType} is not allowed`);
        }

        // Determine storage subdirectory based on MIME type
        const subdir = this.getStorageSubdirectory(metadata.mimeType!);
        const filePath = path.join(this.storageConfig.storagePath, subdir, fileId);

        // Save file to storage
        await fs.writeFile(filePath, fileBuffer);

        // Create and store metadata
        const fileMetadata: FileMetadata = {
            fileId,
            originalName: metadata.originalName!,
            mimeType: metadata.mimeType!,
            size: fileBuffer.length,
            uploadedBy: metadata.uploadedBy!,
            uploadedAt: new Date(),
            tags: metadata.tags || [],
            processingStatus: 'pending'
        };

        this.fileMetadataStore.set(fileId, fileMetadata);

        this.logger.info('File uploaded successfully', {
            fileId,
            originalName: metadata.originalName,
            size: fileBuffer.length
        });

        return fileId;
    }

    private async downloadFile(fileId: string): Promise<string> {
        const metadata = this.fileMetadataStore.get(fileId);
        if (!metadata) {
            throw new Error(`File not found: ${fileId}`);
        }

        const subdir = this.getStorageSubdirectory(metadata.mimeType);
        const filePath = path.join(this.storageConfig.storagePath, subdir, fileId);

        try {
            const fileBuffer = await fs.readFile(filePath);
            return fileBuffer.toString('base64');
        } catch (error) {
            throw new Error(`Failed to read file: ${error}`);
        }
    }

    private async processImage(fileId: string, options: ImageProcessingOptions = {}): Promise<OCRResult> {
        const startTime = Date.now();

        const metadata = this.fileMetadataStore.get(fileId);
        if (!metadata) {
            throw new Error(`File not found: ${fileId}`);
        }

        if (!metadata.mimeType.startsWith('image/')) {
            throw new Error(`File is not an image: ${metadata.mimeType}`);
        }

        // Update processing status
        metadata.processingStatus = 'processing';
        this.fileMetadataStore.set(fileId, metadata);

        try {
            const subdir = this.getStorageSubdirectory(metadata.mimeType);
            const filePath = path.join(this.storageConfig.storagePath, subdir, fileId);

            let processedImagePath = filePath;

            // Enhance image if requested
            if (options.enhanceImage) {
                processedImagePath = await this.enhanceImage(filePath, fileId);
            }

            // Perform OCR
            const ocrResult = await Tesseract.recognize(
                processedImagePath,
                options.language || this.storageConfig.ocrLanguage || 'eng+chi_sim',
                {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            this.logger.debug('OCR progress', {
                                fileId,
                                progress: m.progress
                            });
                        }
                    }
                }
            );

            const extractedText = ocrResult.data.text;
            const confidence = ocrResult.data.confidence;

            // Detect fields if requested
            let detectedFields: DetectedField[] = [];
            if (options.detectFields !== false) {
                // Use available text blocks for field detection
                const textBlocks = ocrResult.data.blocks || [];
                detectedFields = this.detectFields(extractedText, textBlocks);
            }

            const processingTime = Date.now() - startTime;

            const result: OCRResult = {
                fileId,
                extractedText,
                confidence,
                detectedFields,
                processingTime
            };

            // Update processing status
            metadata.processingStatus = 'completed';
            this.fileMetadataStore.set(fileId, metadata);

            this.logger.info('Image processed successfully', {
                fileId,
                confidence,
                fieldsDetected: detectedFields.length,
                processingTime
            });

            return result;

        } catch (error) {
            // Update processing status
            metadata.processingStatus = 'failed';
            this.fileMetadataStore.set(fileId, metadata);

            this.logger.error('Image processing failed', { fileId, error });
            throw new Error(`Image processing failed: ${error}`);
        }
    }

    private async parseExcelFile(fileId: string, sheetName?: string): Promise<ExcelData> {
        const startTime = Date.now();

        const metadata = this.fileMetadataStore.get(fileId);
        if (!metadata) {
            throw new Error(`File not found: ${fileId}`);
        }

        const isExcelFile = metadata.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            metadata.mimeType === 'application/vnd.ms-excel';

        if (!isExcelFile) {
            throw new Error(`File is not an Excel file: ${metadata.mimeType}`);
        }

        try {
            const subdir = this.getStorageSubdirectory(metadata.mimeType);
            const filePath = path.join(this.storageConfig.storagePath, subdir, fileId);

            const workbook = XLSX.readFile(filePath);
            const sheets: ExcelSheet[] = [];

            const sheetNames = sheetName ? [sheetName] : workbook.SheetNames;

            for (const name of sheetNames) {
                if (!workbook.Sheets[name]) {
                    this.logger.warn('Sheet not found', { fileId, sheetName: name });
                    continue;
                }

                const worksheet = workbook.Sheets[name];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                const headers = jsonData.length > 0 ? jsonData[0] as string[] : [];
                const data = jsonData as any[][];

                sheets.push({
                    name,
                    data,
                    headers,
                    rowCount: data.length,
                    columnCount: headers.length
                });
            }

            const processingTime = Date.now() - startTime;

            const result: ExcelData = {
                sheets,
                metadata: {
                    fileName: metadata.originalName,
                    totalSheets: workbook.SheetNames.length,
                    processingTime
                }
            };

            this.logger.info('Excel file parsed successfully', {
                fileId,
                sheetsProcessed: sheets.length,
                processingTime
            });

            return result;

        } catch (error) {
            this.logger.error('Excel parsing failed', { fileId, error });
            throw new Error(`Excel parsing failed: ${error}`);
        }
    }

    private async deleteFile(fileId: string): Promise<boolean> {
        const metadata = this.fileMetadataStore.get(fileId);
        if (!metadata) {
            return false;
        }

        try {
            const subdir = this.getStorageSubdirectory(metadata.mimeType);
            const filePath = path.join(this.storageConfig.storagePath, subdir, fileId);

            await fs.unlink(filePath);
            this.fileMetadataStore.delete(fileId);

            this.logger.info('File deleted successfully', { fileId });
            return true;

        } catch (error) {
            this.logger.error('File deletion failed', { fileId, error });
            return false;
        }
    }

    private async getFileMetadata(fileId: string): Promise<FileMetadata> {
        const metadata = this.fileMetadataStore.get(fileId);
        if (!metadata) {
            throw new Error(`File not found: ${fileId}`);
        }

        return { ...metadata };
    }

    // Helper methods
    private getStorageSubdirectory(mimeType: string): string {
        if (mimeType.startsWith('image/')) {
            return 'images';
        } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
            return 'documents';
        } else {
            return 'documents';
        }
    }

    private isMimeTypeAllowed(mimeType: string): boolean {
        return this.storageConfig.allowedMimeTypes.some(allowedType => {
            if (allowedType.includes('*')) {
                // Handle wildcard patterns like 'image/*' or 'text/*'
                const pattern = allowedType.replace('*', '.*');
                const regex = new RegExp(`^${pattern}$`);
                return regex.test(mimeType);
            } else {
                // Exact match
                return allowedType === mimeType;
            }
        });
    }

    private async enhanceImage(imagePath: string, fileId: string): Promise<string> {
        const enhancedPath = path.join(
            this.storageConfig.storagePath,
            'processed',
            `enhanced_${fileId}.png`
        );

        await sharp(imagePath)
            .resize(null, 1200, { withoutEnlargement: true })
            .sharpen()
            .normalize()
            .png()
            .toFile(enhancedPath);

        return enhancedPath;
    }

    private detectFields(text: string, textBlocks: any[]): DetectedField[] {
        const fields: DetectedField[] = [];

        // Date patterns
        const datePatterns = [
            { pattern: /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g, type: 'expiry_date' as const },
            { pattern: /生产日期[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g, type: 'production_date' as const },
            { pattern: /保质期[：:]\s*(\d+)\s*(天|月|年)/g, type: 'warranty_info' as const }
        ];

        // Price patterns
        const pricePatterns = [
            { pattern: /[￥¥$]\s*(\d+\.?\d*)/g, type: 'price' as const },
            { pattern: /价格[：:]\s*(\d+\.?\d*)/g, type: 'price' as const }
        ];

        // Product name patterns (simple heuristic)
        const productPatterns = [
            { pattern: /^([^\d\s][^：:]{2,20})$/gm, type: 'product_name' as const }
        ];

        const allPatterns = [...datePatterns, ...pricePatterns, ...productPatterns];

        for (const { pattern, type } of allPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                fields.push({
                    fieldType: type,
                    value: match[1] || match[0],
                    confidence: 0.8, // Simple confidence score
                    boundingBox: this.findBoundingBox(match[0], textBlocks)
                });
            }
        }

        return fields;
    }

    private findBoundingBox(searchText: string, textBlocks: any[]): BoundingBox | undefined {
        // Simple implementation to find bounding box from text blocks
        const block = textBlocks.find(b => b.text && b.text.includes(searchText));
        if (block && block.bbox) {
            return {
                x: block.bbox.x0,
                y: block.bbox.y0,
                width: block.bbox.x1 - block.bbox.x0,
                height: block.bbox.y1 - block.bbox.y0
            };
        }
        return undefined;
    }

    private parseStorageConfig(connectionString: string): FileStorageConfig {
        // Parse file storage configuration from connection string
        // Format: file://path/to/storage?maxSize=10MB&allowedTypes=image/*,application/*

        const url = new URL(connectionString);
        const params = new URLSearchParams(url.search);

        const maxSizeStr = params.get('maxSize') || '10MB';
        const maxFileSize = this.parseFileSize(maxSizeStr);

        const allowedTypesStr = params.get('allowedTypes') || 'image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
        const allowedMimeTypes = allowedTypesStr.split(',').map(t => t.trim());

        // Handle Windows paths properly
        let storagePath = url.pathname;
        if (process.platform === 'win32' && storagePath.startsWith('/')) {
            storagePath = storagePath.slice(1); // Remove leading slash on Windows
        }

        return {
            storagePath,
            maxFileSize,
            allowedMimeTypes,
            ocrLanguage: params.get('ocrLanguage') || 'eng+chi_sim'
        };
    }

    private parseFileSize(sizeStr: string): number {
        const match = sizeStr.match(/^(\d+)\s*(B|KB|MB|GB)?$/i);
        if (!match) {
            throw new Error(`Invalid file size format: ${sizeStr}`);
        }

        const size = parseInt(match[1]);
        const unit = (match[2] || 'B').toUpperCase();

        const multipliers = {
            'B': 1,
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024
        };

        return size * (multipliers[unit as keyof typeof multipliers] || 1);
    }
}
