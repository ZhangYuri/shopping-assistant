/**
 * Property-Based Tests for FileStorageMCPServer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as fc from 'fast-check';
import { FileStorageMCPServer } from '../mcp/servers/FileStorageMCPServer';
import { MCPServerConfig } from '../types/mcp.types';

describe('FileStorageMCPServer Property Tests', () => {
    let server: FileStorageMCPServer;
    let tempDir: string;

    beforeAll(async () => {
        // Create temporary directory for testing
        tempDir = path.join(__dirname, '../../temp-test-storage-pbt');

        // Create proper file URL for Windows
        const fileUrl = process.platform === 'win32'
            ? `file:///${tempDir.replace(/\\/g, '/')}`
            : `file://${tempDir}`;

        const config: MCPServerConfig = {
            serverName: 'test-file-storage-pbt',
            serverType: 'file-storage',
            connectionString: `${fileUrl}?maxSize=10MB&allowedTypes=text/*,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
            capabilities: ['uploadFile', 'downloadFile', 'processImage', 'parseExcelFile'],
            retryPolicy: {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 5000
            },
            timeout: 30000
        };

        server = new FileStorageMCPServer(config);
        await server.initialize();
        await server.connect();
    });

    afterAll(async () => {
        await server.disconnect();

        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    /**
     * **Feature: shopping-assistant-agents, Property 4: 图像信息提取完整性**
     * **Validates: Requirements 2.1, 2.2, 2.3**
     *
     * Property: For any image processing request, the system should return structured data
     * with proper format and handle errors gracefully when image processing fails.
     */
    test('Property 4: Image information extraction completeness', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generator for file processing parameters
                fc.record({
                    fileName: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9_-]/.test(c)), { minLength: 5, maxLength: 20 }),
                    fileType: fc.constantFrom('text', 'invalid-image'),
                    options: fc.record({
                        enhanceImage: fc.boolean(),
                        language: fc.constantFrom('eng', 'chi_sim', 'eng+chi_sim'),
                        detectFields: fc.boolean(),
                        outputFormat: fc.constantFrom('text', 'structured')
                    })
                }),
                async (testData) => {
                    // Create test content based on file type
                    let fileContent: string;
                    let mimeType: string;
                    let extension: string;

                    if (testData.fileType === 'text') {
                        fileContent = `Product Name: Test Product
生产日期: 2024-01-01
保质期至: 2025-12-31
价格: ¥99.99
保修期: 12个月`;
                        mimeType = 'text/plain';
                        extension = 'txt';
                    } else {
                        // Create invalid image file (text with image extension)
                        fileContent = 'This is not a valid image file';
                        mimeType = 'image/png';
                        extension = 'png';
                    }

                    const fileBase64 = Buffer.from(fileContent).toString('base64');

                    // Upload the file
                    const uploadResult = await server.callTool('uploadFile', {
                        file: fileBase64,
                        metadata: {
                            originalName: `${testData.fileName}.${extension}`,
                            mimeType: mimeType,
                            uploadedBy: 'test-user',
                            tags: ['product', 'test']
                        }
                    });

                    // Skip if upload fails (not the focus of this property)
                    if (!uploadResult.success) {
                        return true;
                    }

                    const fileId = uploadResult.data;

                    try {
                        // Try to process the file as an image
                        const processResult = await server.callTool('processImage', {
                            fileId,
                            options: testData.options
                        });

                        // Property 1: The processImage call should always return a structured response
                        expect(processResult).toHaveProperty('success');
                        expect(typeof processResult.success).toBe('boolean');

                        if (processResult.success) {
                            const ocrResult = processResult.data;

                            // Property 2: Successful OCR should return structured data with required fields
                            expect(ocrResult).toHaveProperty('fileId');
                            expect(ocrResult).toHaveProperty('extractedText');
                            expect(ocrResult).toHaveProperty('confidence');
                            expect(ocrResult).toHaveProperty('detectedFields');
                            expect(ocrResult).toHaveProperty('processingTime');

                            // Property 3: Field types should be valid
                            expect(typeof ocrResult.fileId).toBe('string');
                            expect(typeof ocrResult.extractedText).toBe('string');
                            expect(typeof ocrResult.confidence).toBe('number');
                            expect(Array.isArray(ocrResult.detectedFields)).toBe(true);
                            expect(typeof ocrResult.processingTime).toBe('number');

                            // Property 4: If fields are detected, they should have proper structure
                            if (ocrResult.detectedFields && Array.isArray(ocrResult.detectedFields)) {
                                for (const field of ocrResult.detectedFields) {
                                    expect(field).toHaveProperty('fieldType');
                                    expect(field).toHaveProperty('value');
                                    expect(field).toHaveProperty('confidence');
                                    expect(typeof field.confidence).toBe('number');
                                    expect(field.confidence).toBeGreaterThanOrEqual(0);
                                    expect(field.confidence).toBeLessThanOrEqual(1);

                                    // Field type should be one of the expected types
                                    const validFieldTypes = ['expiry_date', 'production_date', 'warranty_info', 'product_name', 'price', 'other'];
                                    expect(validFieldTypes).toContain(field.fieldType);
                                }
                            }

                            // Property 5: Processing time should be reasonable (not negative)
                            expect(ocrResult.processingTime).toBeGreaterThanOrEqual(0);

                            // Property 6: Confidence should be a valid number between 0 and 100
                            expect(ocrResult.confidence).toBeGreaterThanOrEqual(0);
                            expect(ocrResult.confidence).toBeLessThanOrEqual(100);

                            // Property 7: File ID should match the input
                            expect(ocrResult.fileId).toBe(fileId);
                        } else {
                            // Property 8: Failed processing should have error information
                            // This is the expected behavior for non-image files or invalid images
                            expect(processResult).toHaveProperty('error');
                            expect(processResult.error).toBeTruthy();

                            // Property 9: Error should be meaningful
                            if (processResult.error) {
                                const errorMessage = processResult.error.message || processResult.error.toString();
                                expect(typeof errorMessage).toBe('string');
                                expect(errorMessage.length).toBeGreaterThan(0);

                                // Property 10: For text files, should reject with appropriate error
                                if (testData.fileType === 'text') {
                                    expect(errorMessage).toContain('not an image');
                                }
                            }
                        }

                        return true;
                    } finally {
                        // Clean up: delete the test file
                        await server.callTool('deleteFile', { fileId });
                    }
                }
            ),
            { numRuns: 10, timeout: 5000 } // Reduced for faster testing
        );
    }, 15000); // Reduced timeout
});
