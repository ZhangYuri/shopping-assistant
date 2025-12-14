/**
 * OCR Service
 * Handles Optical Character Recognition using Tesseract.js
 */

import Tesseract from 'tesseract.js';
import { Logger } from '../utils/Logger';
import { FileStorageService } from './FileStorageService';

export interface OCRResult {
    success: boolean;
    extractedText?: string;
    confidence?: number;
    detectedFields?: DetectedField[];
    processingTime?: number;
    error?: string;
}

export interface DetectedField {
    fieldType: 'expiry_date' | 'production_date' | 'warranty_info' | 'product_name' | 'price' | 'quantity' | 'other';
    value: string;
    confidence: number;
    position?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface OCROptions {
    language?: string;
    psm?: number; // Page segmentation mode
    oem?: number; // OCR Engine mode
    whitelist?: string; // Character whitelist
    blacklist?: string; // Character blacklist
}

export class OCRService {
    private static instance: OCRService;
    private logger: Logger;
    private fileStorageService: FileStorageService;
    private isInitialized = false;

    private constructor() {
        this.logger = new Logger({
            component: 'OCRService',
            level: 'info'
        });
        this.fileStorageService = FileStorageService.getInstance();
    }

    public static getInstance(): OCRService {
        if (!OCRService.instance) {
            OCRService.instance = new OCRService();
        }
        return OCRService.instance;
    }

    /**
     * Initialize OCR service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize file storage service
            await this.fileStorageService.initialize();

            this.logger.info('OCR service initialized');
            this.isInitialized = true;

        } catch (error) {
            this.logger.error('Failed to initialize OCR service', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Process image and extract text using OCR
     */
    async processImage(
        fileId: string,
        options: OCROptions = {}
    ): Promise<OCRResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const startTime = Date.now();

        try {
            // Get file from storage
            const fileResult = await this.fileStorageService.getFile(fileId);
            if (!fileResult.success || !fileResult.buffer) {
                return {
                    success: false,
                    error: fileResult.error || 'File not found'
                };
            }

            // Validate that it's an image
            if (!fileResult.metadata?.mimeType.startsWith('image/')) {
                return {
                    success: false,
                    error: 'File is not an image'
                };
            }

            this.logger.info('Starting OCR processing', {
                fileId,
                fileSize: fileResult.buffer.length,
                mimeType: fileResult.metadata.mimeType
            });

            // Configure Tesseract options
            const tesseractOptions = this.buildTesseractOptions(options);

            // Process image with Tesseract
            const { data } = await Tesseract.recognize(
                fileResult.buffer,
                options.language || 'chi_sim+eng', // Support both Chinese and English
                tesseractOptions
            );

            const processingTime = Date.now() - startTime;

            // Extract and classify detected fields
            const detectedFields = this.extractFields(data.text);

            this.logger.info('OCR processing completed', {
                fileId,
                confidence: data.confidence,
                textLength: data.text.length,
                fieldsDetected: detectedFields.length,
                processingTime
            });

            return {
                success: true,
                extractedText: data.text,
                confidence: data.confidence,
                detectedFields,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;

            this.logger.error('OCR processing failed', {
                fileId,
                error: error instanceof Error ? error.message : String(error),
                processingTime
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processingTime
            };
        }
    }

    /**
     * Process image buffer directly
     */
    async processImageBuffer(
        imageBuffer: Buffer,
        options: OCROptions = {}
    ): Promise<OCRResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const startTime = Date.now();

        try {
            this.logger.info('Starting OCR processing from buffer', {
                bufferSize: imageBuffer.length
            });

            const tesseractOptions = this.buildTesseractOptions(options);

            const { data } = await Tesseract.recognize(
                imageBuffer,
                options.language || 'chi_sim+eng',
                tesseractOptions
            );

            const processingTime = Date.now() - startTime;
            const detectedFields = this.extractFields(data.text);

            this.logger.info('OCR processing from buffer completed', {
                confidence: data.confidence,
                textLength: data.text.length,
                fieldsDetected: detectedFields.length,
                processingTime
            });

            return {
                success: true,
                extractedText: data.text,
                confidence: data.confidence,
                detectedFields,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;

            this.logger.error('OCR processing from buffer failed', {
                error: error instanceof Error ? error.message : String(error),
                processingTime
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processingTime
            };
        }
    }

    /**
     * Extract structured fields from OCR text
     */
    private extractFields(text: string): DetectedField[] {
        const fields: DetectedField[] = [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        for (const line of lines) {
            // Extract dates (production date, expiry date)
            const datePatterns = [
                /生产日期[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/i,
                /保质期[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/i,
                /有效期[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/i,
                /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/
            ];

            for (const pattern of datePatterns) {
                const match = line.match(pattern);
                if (match) {
                    const fieldType = line.includes('生产') ? 'production_date' :
                        line.includes('保质') || line.includes('有效') ? 'expiry_date' : 'other';

                    fields.push({
                        fieldType,
                        value: match[1],
                        confidence: 0.8
                    });
                }
            }

            // Extract prices
            const pricePatterns = [
                /[￥¥$]\s*(\d+\.?\d*)/,
                /价格[：:]\s*[￥¥$]?\s*(\d+\.?\d*)/i,
                /(\d+\.?\d*)\s*[元块]/
            ];

            for (const pattern of pricePatterns) {
                const match = line.match(pattern);
                if (match) {
                    fields.push({
                        fieldType: 'price',
                        value: match[1],
                        confidence: 0.7
                    });
                }
            }

            // Extract quantities
            const quantityPatterns = [
                /数量[：:]\s*(\d+)\s*([个件包盒瓶袋])/i,
                /(\d+)\s*([个件包盒瓶袋])/,
                /x\s*(\d+)/i
            ];

            for (const pattern of quantityPatterns) {
                const match = line.match(pattern);
                if (match) {
                    fields.push({
                        fieldType: 'quantity',
                        value: `${match[1]}${match[2] || ''}`,
                        confidence: 0.7
                    });
                }
            }

            // Extract product names (heuristic: longer lines that don't match other patterns)
            if (line.length > 5 && line.length < 50 &&
                !line.match(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/) &&
                !line.match(/[￥¥$]\s*\d/) &&
                !line.match(/数量[：:]/)) {

                // Check if it looks like a product name
                if (line.match(/[\u4e00-\u9fff]/) || line.match(/[a-zA-Z]/)) {
                    fields.push({
                        fieldType: 'product_name',
                        value: line,
                        confidence: 0.6
                    });
                }
            }
        }

        // Remove duplicates and sort by confidence
        const uniqueFields = fields.filter((field, index, self) =>
            index === self.findIndex(f => f.fieldType === field.fieldType && f.value === field.value)
        );

        return uniqueFields.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Build Tesseract options from OCR options
     */
    private buildTesseractOptions(options: OCROptions): any {
        const tesseractOptions: any = {
            logger: (m: any) => {
                if (m.status === 'recognizing text') {
                    this.logger.debug('OCR progress', { progress: m.progress });
                }
            }
        };

        // Page Segmentation Mode
        if (options.psm !== undefined) {
            tesseractOptions.tessedit_pageseg_mode = options.psm;
        } else {
            tesseractOptions.tessedit_pageseg_mode = 6; // Uniform block of text
        }

        // OCR Engine Mode
        if (options.oem !== undefined) {
            tesseractOptions.tessedit_ocr_engine_mode = options.oem;
        } else {
            tesseractOptions.tessedit_ocr_engine_mode = 3; // Default, based on what is available
        }

        // Character whitelist/blacklist
        if (options.whitelist) {
            tesseractOptions.tessedit_char_whitelist = options.whitelist;
        }

        if (options.blacklist) {
            tesseractOptions.tessedit_char_blacklist = options.blacklist;
        }

        return tesseractOptions;
    }
}
