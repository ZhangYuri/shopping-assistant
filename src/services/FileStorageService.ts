/**
 * File Storage Service
 * Handles file upload, storage, and processing operations
 */

import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import sharp from 'sharp';
import { Logger } from '../utils/Logger';
import { RetryPolicy } from '../types/common.types';

export interface FileMetadata {
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    uploadedBy?: string;
    uploadedAt: Date;
    tags: string[];
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
    storagePath: string;
}

export interface FileUploadResult {
    success: boolean;
    fileId?: string;
    metadata?: FileMetadata;
    error?: string;
}

export interface FileProcessingResult {
    success: boolean;
    processedPath?: string;
    metadata?: any;
    error?: string;
}

export class FileStorageService {
    private static instance: FileStorageService;
    private logger: Logger;
    private storageBasePath: string;
    private retryPolicy: RetryPolicy;
    private allowedMimeTypes: Set<string>;
    private maxFileSize: number;

    private constructor() {
        this.logger = new Logger({
            component: 'FileStorageService',
            level: 'info'
        });

        this.storageBasePath = process.env.FILE_STORAGE_PATH || './files';
        this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default

        this.allowedMimeTypes = new Set([
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv',
            'application/pdf'
        ]);

        this.retryPolicy = {
            maxRetries: 3,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 10000
        };
    }

    public static getInstance(): FileStorageService {
        if (!FileStorageService.instance) {
            FileStorageService.instance = new FileStorageService();
        }
        return FileStorageService.instance;
    }

    /**
     * Initialize file storage service
     */
    async initialize(): Promise<void> {
        try {
            // Ensure storage directories exist
            await this.ensureDirectoryExists(this.storageBasePath);
            await this.ensureDirectoryExists(path.join(this.storageBasePath, 'images'));
            await this.ensureDirectoryExists(path.join(this.storageBasePath, 'documents'));
            await this.ensureDirectoryExists(path.join(this.storageBasePath, 'processed'));
            await this.ensureDirectoryExists(path.join(this.storageBasePath, 'temp'));

            this.logger.info('File storage service initialized', {
                basePath: this.storageBasePath,
                maxFileSize: this.maxFileSize
            });

        } catch (error) {
            this.logger.error('Failed to initialize file storage service', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Upload and store a file
     */
    async uploadFile(
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
        uploadedBy?: string,
        tags: string[] = []
    ): Promise<FileUploadResult> {
        try {
            // Validate file
            const validation = this.validateFile(fileBuffer, mimeType);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error
                };
            }

            // Generate file ID and determine storage path
            const fileId = this.generateFileId();
            const fileExtension = path.extname(originalName);
            const storageDir = this.getStorageDirectory(mimeType);
            const fileName = `${fileId}${fileExtension}`;
            const storagePath = path.join(storageDir, fileName);

            // Ensure directory exists
            await this.ensureDirectoryExists(storageDir);

            // Write file to storage
            await fs.writeFile(storagePath, fileBuffer);

            // Create metadata
            const metadata: FileMetadata = {
                fileId,
                originalName,
                mimeType,
                size: fileBuffer.length,
                uploadedBy,
                uploadedAt: new Date(),
                tags,
                processingStatus: 'pending',
                storagePath
            };

            this.logger.info('File uploaded successfully', {
                fileId,
                originalName,
                size: fileBuffer.length,
                mimeType
            });

            return {
                success: true,
                fileId,
                metadata
            };

        } catch (error) {
            this.logger.error('Failed to upload file', {
                originalName,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get file by ID
     */
    async getFile(fileId: string): Promise<{ success: boolean; buffer?: Buffer; metadata?: FileMetadata; error?: string }> {
        try {
            // In a real implementation, metadata would be stored in database
            // For now, we'll try to find the file in storage directories
            const possiblePaths = [
                path.join(this.storageBasePath, 'images', `${fileId}.jpg`),
                path.join(this.storageBasePath, 'images', `${fileId}.png`),
                path.join(this.storageBasePath, 'images', `${fileId}.gif`),
                path.join(this.storageBasePath, 'documents', `${fileId}.xlsx`),
                path.join(this.storageBasePath, 'documents', `${fileId}.xls`),
                path.join(this.storageBasePath, 'documents', `${fileId}.csv`),
                path.join(this.storageBasePath, 'documents', `${fileId}.pdf`)
            ];

            for (const filePath of possiblePaths) {
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isFile()) {
                        const buffer = await fs.readFile(filePath);
                        const metadata: FileMetadata = {
                            fileId,
                            originalName: path.basename(filePath),
                            mimeType: this.getMimeTypeFromExtension(path.extname(filePath)),
                            size: stats.size,
                            uploadedAt: stats.birthtime,
                            tags: [],
                            processingStatus: 'completed',
                            storagePath: filePath
                        };

                        return {
                            success: true,
                            buffer,
                            metadata
                        };
                    }
                } catch {
                    // Continue to next path
                }
            }

            return {
                success: false,
                error: `File with ID ${fileId} not found`
            };

        } catch (error) {
            this.logger.error('Failed to get file', {
                fileId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Process image file (resize, optimize)
     */
    async processImage(
        fileId: string,
        options: {
            resize?: { width?: number; height?: number };
            quality?: number;
            format?: 'jpeg' | 'png' | 'webp';
        } = {}
    ): Promise<FileProcessingResult> {
        try {
            const fileResult = await this.getFile(fileId);
            if (!fileResult.success || !fileResult.buffer) {
                return {
                    success: false,
                    error: fileResult.error || 'File not found'
                };
            }

            const { resize, quality = 85, format = 'jpeg' } = options;

            let sharpInstance = sharp(fileResult.buffer);

            // Apply resize if specified
            if (resize) {
                sharpInstance = sharpInstance.resize(resize.width, resize.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Apply format and quality
            switch (format) {
                case 'jpeg':
                    sharpInstance = sharpInstance.jpeg({ quality });
                    break;
                case 'png':
                    sharpInstance = sharpInstance.png({ quality });
                    break;
                case 'webp':
                    sharpInstance = sharpInstance.webp({ quality });
                    break;
            }

            const processedBuffer = await sharpInstance.toBuffer();

            // Save processed image
            const processedDir = path.join(this.storageBasePath, 'processed');
            const processedFileName = `${fileId}_processed.${format}`;
            const processedPath = path.join(processedDir, processedFileName);

            await fs.writeFile(processedPath, processedBuffer);

            this.logger.info('Image processed successfully', {
                fileId,
                originalSize: fileResult.buffer.length,
                processedSize: processedBuffer.length,
                format,
                quality
            });

            return {
                success: true,
                processedPath,
                metadata: {
                    originalSize: fileResult.buffer.length,
                    processedSize: processedBuffer.length,
                    format,
                    quality,
                    resize
                }
            };

        } catch (error) {
            this.logger.error('Failed to process image', {
                fileId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Delete file
     */
    async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const fileResult = await this.getFile(fileId);
            if (!fileResult.success || !fileResult.metadata) {
                return {
                    success: false,
                    error: 'File not found'
                };
            }

            await fs.unlink(fileResult.metadata.storagePath);

            // Also try to delete processed version
            const processedPath = path.join(this.storageBasePath, 'processed', `${fileId}_processed.jpeg`);
            try {
                await fs.unlink(processedPath);
            } catch {
                // Ignore if processed file doesn't exist
            }

            this.logger.info('File deleted successfully', { fileId });

            return { success: true };

        } catch (error) {
            this.logger.error('Failed to delete file', {
                fileId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Clean up temporary files
     */
    async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
        try {
            const tempDir = path.join(this.storageBasePath, 'temp');
            const files = await fs.readdir(tempDir);
            const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);

            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);

                if (stats.mtime.getTime() < cutoffTime) {
                    await fs.unlink(filePath);
                    this.logger.debug('Cleaned up temp file', { file });
                }
            }

        } catch (error) {
            this.logger.error('Failed to cleanup temp files', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    // Private helper methods

    private validateFile(buffer: Buffer, mimeType: string): { isValid: boolean; error?: string } {
        if (buffer.length > this.maxFileSize) {
            return {
                isValid: false,
                error: `File size ${buffer.length} exceeds maximum allowed size ${this.maxFileSize}`
            };
        }

        if (!this.allowedMimeTypes.has(mimeType)) {
            return {
                isValid: false,
                error: `MIME type ${mimeType} is not allowed`
            };
        }

        return { isValid: true };
    }

    private generateFileId(): string {
        return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getStorageDirectory(mimeType: string): string {
        if (mimeType.startsWith('image/')) {
            return path.join(this.storageBasePath, 'images');
        } else {
            return path.join(this.storageBasePath, 'documents');
        }
    }

    private getMimeTypeFromExtension(extension: string): string {
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.csv': 'text/csv',
            '.pdf': 'application/pdf'
        };

        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }
}
