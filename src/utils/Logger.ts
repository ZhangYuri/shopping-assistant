/**
 * Centralized logging utility for the shopping assistant system
 */

import * as winston from 'winston';
import { LogLevel, LogContext } from '../types/common.types';

export interface LoggerConfig {
    component: string;
    level?: LogLevel;
    correlationId?: string;
}

export class Logger {
    private winston: winston.Logger;
    private component: string;
    private correlationId?: string;

    constructor(config: LoggerConfig) {
        this.component = config.component;
        this.correlationId = config.correlationId;

        this.winston = winston.createLogger({
            level: config.level || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const logEntry = {
                        timestamp,
                        level,
                        component: this.component,
                        correlationId: this.correlationId,
                        message,
                        ...meta,
                    };
                    return JSON.stringify(logEntry);
                })
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple(),
                        winston.format.printf(
                            ({ timestamp, level, message, component, correlationId, ...meta }) => {
                                const metaStr =
                                    Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
                                const corrId = correlationId ? ` [${correlationId}]` : '';
                                return `${timestamp} ${level} [${component}]${corrId}: ${message}${metaStr}`;
                            }
                        )
                    ),
                }),
                new winston.transports.File({
                    filename: 'logs/error.log',
                    level: 'error',
                    format: winston.format.json(),
                }),
                new winston.transports.File({
                    filename: 'logs/combined.log',
                    format: winston.format.json(),
                }),
            ],
        });
    }

    error(message: string, context?: LogContext | Record<string, any>): void {
        this.winston.error(message, this.formatContext(context));
    }

    warn(message: string, context?: LogContext | Record<string, any>): void {
        this.winston.warn(message, this.formatContext(context));
    }

    info(message: string, context?: LogContext | Record<string, any>): void {
        this.winston.info(message, this.formatContext(context));
    }

    debug(message: string, context?: LogContext | Record<string, any>): void {
        this.winston.debug(message, this.formatContext(context));
    }

    setCorrelationId(correlationId: string): void {
        this.correlationId = correlationId;
    }

    clearCorrelationId(): void {
        this.correlationId = undefined;
    }

    createChildLogger(childComponent: string, correlationId?: string): Logger {
        return new Logger({
            component: `${this.component}:${childComponent}`,
            level: this.winston.level as LogLevel,
            correlationId: correlationId || this.correlationId,
        });
    }

    private formatContext(context?: LogContext | Record<string, any>): Record<string, any> {
        if (!context) {
            return {};
        }

        return {
            ...context,
            correlationId: this.correlationId || (context as LogContext).correlationId,
        };
    }
}
