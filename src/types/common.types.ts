/**
 * Common types used across the shopping assistant system
 */

export interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ErrorInfo {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: Date;
}

export interface RetryPolicy {
    maxRetries: number;
    backoffStrategy: 'exponential' | 'linear' | 'fixed';
    baseDelay: number;
    maxDelay: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface PaginationOptions {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
    component: string;
    operation: string;
    correlationId?: string;
    metadata?: Record<string, any>;
}
