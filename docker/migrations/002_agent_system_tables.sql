-- Migration: 002_agent_system_tables.sql
-- Description: Add tables for agent system functionality
-- Date: 2024-12-15

-- User feedback table (for learning mechanisms)
CREATE TABLE IF NOT EXISTS `user_feedback` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `feedback_type` varchar(50) NOT NULL,
    `context_data` json DEFAULT NULL,
    `user_action` varchar(100) NOT NULL,
    `feedback_value` varchar(255) DEFAULT NULL,
    `agent_suggestion` text DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_feedback_type` (`feedback_type`),
    INDEX `idx_user_action` (`user_action`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈学习表';

-- Agent state table (for workflow management)
CREATE TABLE IF NOT EXISTS `agent_state` (
    `id` varchar(100) NOT NULL,
    `agent_type` varchar(50) NOT NULL,
    `state_data` json DEFAULT NULL,
    `last_activity` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_agent_type` (`agent_type`),
    INDEX `idx_last_activity` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能体状态表';

-- Conversation history table
CREATE TABLE IF NOT EXISTS `conversation_history` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `conversation_id` varchar(100) NOT NULL,
    `user_id` varchar(100) DEFAULT NULL,
    `message_type` varchar(20) NOT NULL,
    `content` text NOT NULL,
    `agent_type` varchar(50) DEFAULT NULL,
    `metadata` json DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_conversation_id` (`conversation_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_message_type` (`message_type`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话历史表';

-- File metadata table
CREATE TABLE IF NOT EXISTS `file_metadata` (
    `id` varchar(100) NOT NULL,
    `original_name` varchar(255) NOT NULL,
    `file_path` varchar(500) NOT NULL,
    `mime_type` varchar(100) DEFAULT NULL,
    `file_size` bigint DEFAULT NULL,
    `upload_user` varchar(100) DEFAULT NULL,
    `processing_status` varchar(50) DEFAULT 'pending',
    `ocr_result` json DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_original_name` (`original_name`),
    INDEX `idx_processing_status` (`processing_status`),
    INDEX `idx_upload_user` (`upload_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件元数据表';
