/**
 * Database Configuration
 * 数据库配置管理 - 从环境变量读取配置
 */

import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

export interface DatabaseConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
    timeout: number;
    ssl?: boolean;
}

/**
 * 从环境变量构建数据库配置
 */
export function getDatabaseConfig(): DatabaseConfig {
    // 方式1: 使用单独的环境变量
    if (process.env.DATABASE_HOST) {
        return {
            host: process.env.DATABASE_HOST || '127.0.0.1',
            port: parseInt(process.env.DATABASE_PORT || '3306'),
            user: process.env.DATABASE_USER || 'root',
            password: process.env.DATABASE_PASSWORD || '',
            database: process.env.DATABASE_NAME || 'shopping_assistant',
            connectionLimit: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
            timeout: parseInt(process.env.DATABASE_TIMEOUT || '30000'),
            ssl: process.env.DATABASE_SSL === 'true'
        };
    }

    // 方式2: 使用连接字符串
    if (process.env.DATABASE_URL) {
        return parseDatabaseUrl(process.env.DATABASE_URL);
    }

    // 默认配置（开发环境）
    console.warn('⚠️  No database configuration found in environment variables, using defaults');
    return {
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'shopping_assistant',
        connectionLimit: 10,
        timeout: 30000
    };
}

/**
 * 解析数据库连接字符串
 * 支持格式: mysql://user:password@host:port/database
 */
function parseDatabaseUrl(url: string): DatabaseConfig {
    try {
        const parsed = new URL(url);

        return {
            host: parsed.hostname,
            port: parseInt(parsed.port) || 3306,
            user: parsed.username,
            password: parsed.password,
            database: parsed.pathname.slice(1), // 移除开头的 /
            connectionLimit: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
            timeout: parseInt(process.env.DATABASE_TIMEOUT || '30000'),
            ssl: parsed.searchParams.get('ssl') === 'true'
        };
    } catch (error) {
        throw new Error(`Invalid DATABASE_URL format: ${url}. Expected: mysql://user:password@host:port/database`);
    }
}

/**
 * 构建连接字符串（用于日志和调试，不包含密码）
 */
export function getDatabaseConnectionString(config: DatabaseConfig, hidePassword = true): string {
    const password = hidePassword ? '***' : config.password;
    return `mysql://${config.user}:${password}@${config.host}:${config.port}/${config.database}`;
}

/**
 * 验证数据库配置
 */
export function validateDatabaseConfig(config: DatabaseConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.host) {
        errors.push('Database host is required');
    }

    if (!config.user) {
        errors.push('Database user is required');
    }

    if (!config.database) {
        errors.push('Database name is required');
    }

    if (config.port < 1 || config.port > 65535) {
        errors.push('Database port must be between 1 and 65535');
    }

    if (config.connectionLimit < 1) {
        errors.push('Connection pool size must be at least 1');
    }

    if (config.timeout < 1000) {
        errors.push('Database timeout must be at least 1000ms');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * 获取测试数据库配置
 */
export function getTestDatabaseConfig(): DatabaseConfig {
    const config = getDatabaseConfig();

    // 测试环境使用不同的数据库名
    return {
        ...config,
        database: `${config.database}_test`,
        connectionLimit: 5 // 测试环境使用较小的连接池
    };
}
