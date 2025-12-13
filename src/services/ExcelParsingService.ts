/**
 * Excel Parsing Service
 * Handles parsing of Excel files from different e-commerce platforms
 */

import * as XLSX from 'xlsx';
import { Logger } from '@/utils/Logger';
import { FileStorageService } from './FileStorageService';

export interface ParsedOrder {
    id: string;
    store_name: string;
    total_price?: number;
    delivery_cost?: number;
    pay_fee?: number;
    purchase_date?: Date;
    purchase_channel: string;
    items: ParsedOrderItem[];
}

export interface ParsedOrderItem {
    item_name: string;
    purchase_quantity: number;
    model?: string;
    unit_price?: number;
    category?: string;
}

export interface ExcelParsingResult {
    success: boolean;
    orders?: ParsedOrder[];
    platform?: string;
    totalRows?: number;
    parsedRows?: number;
    skippedRows?: number;
    errors?: string[];
    error?: string;
}

export interface PlatformConfig {
    name: string;
    columnMappings: Record<string, string>;
    dateFormat?: string;
    headerRow?: number;
    dataStartRow?: number;
    idGenerator?: (row: any, index: number) => string;
    validator?: (row: any) => boolean;
    transformer?: (row: any) => any;
}

export class ExcelParsingService {
    private static instance: ExcelParsingService;
    private logger: Logger;
    private fileStorageService: FileStorageService;
    private platformConfigs: Map<string, PlatformConfig>;

    private constructor() {
        this.logger = new Logger({
            component: 'ExcelParsingService',
            level: 'info'
        });
        this.fileStorageService = FileStorageService.getInstance();
        this.platformConfigs = new Map();
        this.initializePlatformConfigs();
    }

    public static getInstance(): ExcelParsingService {
        if (!ExcelParsingService.instance) {
            ExcelParsingService.instance = new ExcelParsingService();
        }
        return ExcelParsingService.instance;
    }

    /**
     * Parse Excel file by file ID
     */
    async parseFile(fileId: string, platform: string): Promise<ExcelParsingResult> {
        try {
            // Get file from storage
            const fileResult = await this.fileStorageService.getFile(fileId);
            if (!fileResult.success || !fileResult.buffer) {
                return {
                    success: false,
                    error: fileResult.error || 'File not found'
                };
            }

            return this.parseBuffer(fileResult.buffer, platform);

        } catch (error) {
            this.logger.error('Failed to parse Excel file', {
                fileId,
                platform,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Parse Excel buffer directly
     */
    async parseBuffer(buffer: Buffer, platform: string): Promise<ExcelParsingResult> {
        try {
            const platformConfig = this.platformConfigs.get(platform.toLowerCase());
            if (!platformConfig) {
                return {
                    success: false,
                    error: `Unsupported platform: ${platform}. Supported platforms: ${Array.from(this.platformConfigs.keys()).join(', ')}`
                };
            }

            this.logger.info('Starting Excel parsing', {
                platform,
                bufferSize: buffer.length
            });

            // Read Excel file
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: '',
                blankrows: false
            }) as any[][];

            if (jsonData.length === 0) {
                return {
                    success: false,
                    error: 'Excel file is empty'
                };
            }

            // Parse data according to platform configuration
            const result = this.parseDataWithConfig(jsonData, platformConfig);

            this.logger.info('Excel parsing completed', {
                platform,
                totalRows: result.totalRows,
                parsedRows: result.parsedRows,
                skippedRows: result.skippedRows,
                ordersCount: result.orders?.length || 0
            });

            return {
                ...result,
                platform
            };

        } catch (error) {
            this.logger.error('Failed to parse Excel buffer', {
                platform,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Parse data using platform configuration
     */
    private parseDataWithConfig(data: any[][], config: PlatformConfig): ExcelParsingResult {
        const orders: ParsedOrder[] = [];
        const errors: string[] = [];
        let parsedRows = 0;
        let skippedRows = 0;

        // Get header row
        const headerRowIndex = config.headerRow || 0;
        const dataStartIndex = config.dataStartRow || headerRowIndex + 1;

        if (data.length <= dataStartIndex) {
            return {
                success: false,
                error: 'Not enough data rows in Excel file'
            };
        }

        const headers = data[headerRowIndex];

        // Create column index mapping
        const columnIndexes: Record<string, number> = {};
        for (const [field, columnName] of Object.entries(config.columnMappings)) {
            const index = headers.findIndex(header =>
                header && header.toString().toLowerCase().includes(columnName.toLowerCase())
            );
            if (index !== -1) {
                columnIndexes[field] = index;
            }
        }

        // Parse data rows
        for (let i = dataStartIndex; i < data.length; i++) {
            const row = data[i];

            try {
                // Skip empty rows
                if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
                    skippedRows++;
                    continue;
                }

                // Validate row if validator is provided
                if (config.validator && !config.validator(row)) {
                    skippedRows++;
                    continue;
                }

                // Extract data using column mappings
                const orderData: any = {};
                for (const [field, columnIndex] of Object.entries(columnIndexes)) {
                    if (columnIndex !== undefined && row[columnIndex] !== undefined) {
                        orderData[field] = row[columnIndex];
                    }
                }

                // Transform data if transformer is provided
                if (config.transformer) {
                    Object.assign(orderData, config.transformer(orderData));
                }

                // Generate order ID
                const orderId = config.idGenerator ?
                    config.idGenerator(orderData, i) :
                    this.generateOrderId(orderData, i);

                // Create order object
                const order: ParsedOrder = {
                    id: orderId,
                    store_name: orderData.store_name || 'Unknown Store',
                    total_price: this.parseNumber(orderData.total_price),
                    delivery_cost: this.parseNumber(orderData.delivery_cost),
                    pay_fee: this.parseNumber(orderData.pay_fee),
                    purchase_date: this.parseDate(orderData.purchase_date),
                    purchase_channel: config.name,
                    items: []
                };

                // Create order item
                if (orderData.item_name) {
                    const item: ParsedOrderItem = {
                        item_name: orderData.item_name.toString().trim(),
                        purchase_quantity: this.parseNumber(orderData.purchase_quantity) || 1,
                        model: orderData.model?.toString().trim(),
                        unit_price: this.parseNumber(orderData.unit_price),
                        category: orderData.category?.toString().trim()
                    };
                    order.items.push(item);
                }

                orders.push(order);
                parsedRows++;

            } catch (error) {
                const errorMessage = `Row ${i + 1}: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMessage);
                skippedRows++;
            }
        }

        return {
            success: true,
            orders,
            totalRows: data.length - dataStartIndex,
            parsedRows,
            skippedRows,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    /**
     * Initialize platform configurations
     */
    private initializePlatformConfigs(): void {
        // Taobao configuration
        this.platformConfigs.set('taobao', {
            name: 'Taobao',
            columnMappings: {
                'store_name': '店铺',
                'item_name': '宝贝',
                'purchase_quantity': '数量',
                'unit_price': '单价',
                'total_price': '实付款',
                'purchase_date': '交易时间',
                'model': '规格',
                'category': '分类'
            },
            headerRow: 0,
            dataStartRow: 1,
            idGenerator: (row: any, index: number) => `taobao_${Date.now()}_${index}`,
            validator: (row: any) => row.length > 3 && row[0] && row[1]
        });

        // 1688 configuration
        this.platformConfigs.set('1688', {
            name: '1688',
            columnMappings: {
                'store_name': '供应商',
                'item_name': '产品名称',
                'purchase_quantity': '采购数量',
                'unit_price': '单价',
                'total_price': '总金额',
                'purchase_date': '下单时间',
                'model': '规格型号',
                'category': '类目'
            },
            headerRow: 0,
            dataStartRow: 1,
            idGenerator: (row: any, index: number) => `1688_${Date.now()}_${index}`
        });

        // JD configuration
        this.platformConfigs.set('jd', {
            name: 'JD',
            columnMappings: {
                'store_name': '商家',
                'item_name': '商品名称',
                'purchase_quantity': '数量',
                'unit_price': '单价',
                'total_price': '实付金额',
                'purchase_date': '下单时间',
                'model': '商品规格',
                'category': '分类'
            },
            headerRow: 0,
            dataStartRow: 1,
            idGenerator: (row: any, index: number) => `jd_${Date.now()}_${index}`
        });

        // PDD configuration
        this.platformConfigs.set('pdd', {
            name: 'PDD',
            columnMappings: {
                'store_name': '店铺名称',
                'item_name': '商品标题',
                'purchase_quantity': '商品数量',
                'unit_price': '商品单价',
                'total_price': '实付金额',
                'purchase_date': '支付时间',
                'model': '商品规格',
                'category': '商品分类'
            },
            headerRow: 0,
            dataStartRow: 1,
            idGenerator: (row: any, index: number) => `pdd_${Date.now()}_${index}`
        });

        // Generic configuration for unknown platforms
        this.platformConfigs.set('generic', {
            name: 'Generic',
            columnMappings: {
                'store_name': '店铺',
                'item_name': '商品',
                'purchase_quantity': '数量',
                'unit_price': '单价',
                'total_price': '总价',
                'purchase_date': '日期',
                'model': '规格',
                'category': '分类'
            },
            headerRow: 0,
            dataStartRow: 1,
            idGenerator: (row: any, index: number) => `generic_${Date.now()}_${index}`
        });
    }

    /**
     * Parse number from various formats
     */
    private parseNumber(value: any): number | undefined {
        if (value === null || value === undefined || value === '') {
            return undefined;
        }

        if (typeof value === 'number') {
            return value;
        }

        const str = value.toString().replace(/[￥¥$,，]/g, '').trim();
        const num = parseFloat(str);
        return isNaN(num) ? undefined : num;
    }

    /**
     * Parse date from various formats
     */
    private parseDate(value: any): Date | undefined {
        if (!value) {
            return undefined;
        }

        if (value instanceof Date) {
            return value;
        }

        // Try to parse as Excel date number
        if (typeof value === 'number') {
            const excelDate = XLSX.SSF.parse_date_code(value);
            if (excelDate) {
                return new Date(excelDate.y, excelDate.m - 1, excelDate.d);
            }
        }

        // Try to parse as string
        const str = value.toString().trim();
        const date = new Date(str);
        return isNaN(date.getTime()) ? undefined : date;
    }

    /**
     * Generate order ID from order data
     */
    private generateOrderId(orderData: any, index: number): string {
        const timestamp = Date.now();
        const hash = this.simpleHash(JSON.stringify(orderData));
        return `order_${timestamp}_${hash}_${index}`;
    }

    /**
     * Simple hash function for generating IDs
     */
    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Get supported platforms
     */
    getSupportedPlatforms(): string[] {
        return Array.from(this.platformConfigs.keys());
    }

    /**
     * Add or update platform configuration
     */
    addPlatformConfig(platform: string, config: PlatformConfig): void {
        this.platformConfigs.set(platform.toLowerCase(), config);
        this.logger.info('Platform configuration added/updated', { platform });
    }
}
