/**
 * Validation utilities for the shopping assistant system
 */

import * as Joi from 'joi';
import { ValidationResult } from '@/types/common.types';

export class ValidationUtils {
    /**
     * Validate data against a Joi schema
     */
    static validate<T>(data: any, schema: Joi.Schema): ValidationResult & { data?: T } {
        const result = schema.validate(data, {
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: true,
        });

        if (result.error) {
            return {
                isValid: false,
                errors: result.error.details.map(detail => detail.message),
            };
        }

        return {
            isValid: true,
            errors: [],
            data: result.value as T,
        };
    }

    /**
     * Validate agent ID format
     */
    static validateAgentId(agentId: string): ValidationResult {
        const schema = Joi.string()
            .pattern(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
            .min(3)
            .max(50)
            .required();

        return this.validate(agentId, schema);
    }

    /**
     * Validate UUID format
     */
    static validateUUID(uuid: string): ValidationResult {
        const schema = Joi.string().uuid({ version: 'uuidv4' }).required();

        return this.validate(uuid, schema);
    }

    /**
     * Validate email format
     */
    static validateEmail(email: string): ValidationResult {
        const schema = Joi.string().email().required();

        return this.validate(email, schema);
    }

    /**
     * Validate URL format
     */
    static validateUrl(url: string): ValidationResult {
        const schema = Joi.string().uri().required();

        return this.validate(url, schema);
    }

    /**
     * Validate date range
     */
    static validateDateRange(startDate: Date, endDate: Date): ValidationResult {
        if (startDate >= endDate) {
            return {
                isValid: false,
                errors: ['Start date must be before end date'],
            };
        }

        return {
            isValid: true,
            errors: [],
        };
    }

    /**
     * Validate pagination parameters
     */
    static validatePagination(page: number, limit: number): ValidationResult {
        const schema = Joi.object({
            page: Joi.number().integer().min(1).required(),
            limit: Joi.number().integer().min(1).max(1000).required(),
        });

        return this.validate({ page, limit }, schema);
    }

    /**
     * Sanitize string input
     */
    static sanitizeString(input: string): string {
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/[\u0000-\u001F\u007F]/g, ''); // Remove control characters
    }

    /**
     * Validate natural language command format
     */
    static validateNaturalLanguageCommand(command: string): ValidationResult {
        const sanitized = this.sanitizeString(command);

        if (sanitized.length === 0) {
            return {
                isValid: false,
                errors: ['Command cannot be empty'],
            };
        }

        if (sanitized.length > 500) {
            return {
                isValid: false,
                errors: ['Command is too long (max 500 characters)'],
            };
        }

        return {
            isValid: true,
            errors: [],
        };
    }

    /**
     * Validate inventory item name
     */
    static validateInventoryItemName(itemName: string): ValidationResult {
        const sanitized = this.sanitizeString(itemName);

        const schema = Joi.string()
            .min(1)
            .max(100)
            .pattern(/^[\u4e00-\u9fa5a-zA-Z0-9\s\-_()（）]+$/) // Chinese, English, numbers, spaces, and common punctuation
            .required();

        const result = this.validate(sanitized, schema);

        if (!result.isValid) {
            return {
                isValid: false,
                errors: ['Item name contains invalid characters or is too long/short'],
            };
        }

        return result;
    }

    /**
     * Validate quantity value
     */
    static validateQuantity(quantity: number): ValidationResult {
        const schema = Joi.number().integer().min(0).max(999999).required();

        return this.validate(quantity, schema);
    }
}
