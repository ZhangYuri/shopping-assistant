/**
 * Tests for FileStorageMCPServer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStorageMCPServer } from '../mcp/servers/FileStorageMCPServer';
import { MCPServerConfig } from '../types/mcp.types';

describe('FileStorageMCPServer', () => {
    let server: FileStorageMCPServer;
    let tempDir: string;

    beforeAll(async () => {
        // Create temporary directory for testing
        tempDir = path.join(__dirname, '../../temp-test-storage');

        // Create proper file URL for Windows
        const fileUrl = process.platform === 'win32'
            ? `file:///${tempDir.replace(/\\/g, '/')}`
            : `file://${tempDir}`;

        const config: MCPServerConfig = {
            serverName: 'test-file-storage',
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

    describe('Basic Operations', () => {
        test('should initialize and connect successfully', async () => {
            expect(server.status).toBe('connected');
        });

        test('should perform health check successfully', async () => {
            const isHealthy = await server.healthCheck();
            expect(isHealthy).toBe(true);
        });

        test('should return available tools', async () => {
            const tools = await server.getAvailableTools();
            expect(tools).toHaveLength(6);

            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('uploadFile');
            expect(toolNames).toContain('downloadFile');
            expect(toolNames).toContain('processImage');
            expect(toolNames).toContain('parseExcelFile');
            expect(toolNames).toContain('deleteFile');
            expect(toolNames).toContain('getFileMetadata');
        });
    });

    describe('File Upload and Download', () => {
        test('should upload and download a text file', async () => {
            const testContent = 'Hello, World!';
            const fileBase64 = Buffer.from(testContent).toString('base64');

            // Upload file
            const uploadResult = await server.callTool('uploadFile', {
                file: fileBase64,
                metadata: {
                    originalName: 'test.txt',
                    mimeType: 'text/plain',
                    uploadedBy: 'test-user',
                    tags: ['test']
                }
            });

            expect(uploadResult.success).toBe(true);
            const fileId = uploadResult.data;
            expect(typeof fileId).toBe('string');

            // Download file
            const downloadResult = await server.callTool('downloadFile', {
                fileId
            });

            expect(downloadResult.success).toBe(true);
            const downloadedContent = Buffer.from(downloadResult.data, 'base64').toString();
            expect(downloadedContent).toBe(testContent);

            // Get metadata
            const metadataResult = await server.callTool('getFileMetadata', {
                fileId
            });

            expect(metadataResult.success).toBe(true);
            expect(metadataResult.data.originalName).toBe('test.txt');
            expect(metadataResult.data.mimeType).toBe('text/plain');
            expect(metadataResult.data.uploadedBy).toBe('test-user');

            // Delete file
            const deleteResult = await server.callTool('deleteFile', {
                fileId
            });

            expect(deleteResult.success).toBe(true);
            expect(deleteResult.data).toBe(true);
        });

        test('should reject files that are too large', async () => {
            // Create a file larger than the 10MB limit
            const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
            const fileBase64 = Buffer.from(largeContent).toString('base64');

            const uploadResult = await server.callTool('uploadFile', {
                file: fileBase64,
                metadata: {
                    originalName: 'large.txt',
                    mimeType: 'text/plain',
                    uploadedBy: 'test-user'
                }
            });

            expect(uploadResult.success).toBe(false);
            expect(uploadResult.error?.message).toContain('exceeds maximum allowed size');
        });

        test('should reject unsupported MIME types', async () => {
            const testContent = 'test';
            const fileBase64 = Buffer.from(testContent).toString('base64');

            const uploadResult = await server.callTool('uploadFile', {
                file: fileBase64,
                metadata: {
                    originalName: 'test.exe',
                    mimeType: 'application/x-executable',
                    uploadedBy: 'test-user'
                }
            });

            expect(uploadResult.success).toBe(false);
            expect(uploadResult.error?.message).toContain('is not allowed');
        });
    });

    describe('Error Handling', () => {
        test('should handle non-existent file download', async () => {
            const downloadResult = await server.callTool('downloadFile', {
                fileId: 'non-existent-id'
            });

            expect(downloadResult.success).toBe(false);
            expect(downloadResult.error?.message).toContain('File not found');
        });

        test('should handle unknown tool calls', async () => {
            const result = await server.callTool('unknownTool', {});

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Unknown tool');
        });
    });
});
