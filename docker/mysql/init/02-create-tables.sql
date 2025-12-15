-- Create tables for Shopping Assistant System
-- This script creates all necessary tables

USE shopping_assistant;

-- Inventory table
CREATE TABLE IF NOT EXISTS `inventory` (
    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
    `item_name` varchar(255) NOT NULL,
    `category` varchar(100) DEFAULT NULL,
    `current_quantity` int DEFAULT '0',
    `unit` varchar(50) DEFAULT NULL,
    `storage_location` varchar(255) DEFAULT NULL,
    `production_date` date DEFAULT NULL,
    `expiry_date` date DEFAULT NULL,
    `warranty_period_days` int DEFAULT '0',
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id` (`id`),
    INDEX `idx_item_name` (`item_name`),
    INDEX `idx_category` (`category`),
    INDEX `idx_expiry_date` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存表';

-- Purchase history table
CREATE TABLE IF NOT EXISTS `purchase_history` (
    `id` varchar(45) NOT NULL,
    `store_name` varchar(255) NOT NULL,
    `total_price` decimal(10,2) DEFAULT NULL,
    `delivery_cost` decimal(10,2) DEFAULT NULL,
    `pay_fee` decimal(10,2) DEFAULT NULL,
    `purchase_date` timestamp NULL DEFAULT NULL,
    `purchase_channel` varchar(100) DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id` (`id`),
    INDEX `idx_store_name` (`store_name`),
    INDEX `idx_purchase_date` (`purchase_date`),
    INDEX `idx_purchase_channel` (`purchase_channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='历史购物订单表';

-- Purchase sub list table
CREATE TABLE IF NOT EXISTS `purchase_sub_list` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `parent_id` varchar(45) NOT NULL,
    `item_name` varchar(225) NOT NULL,
    `purchase_quantity` int unsigned DEFAULT '1',
    `model` varchar(100) DEFAULT NULL,
    `unit_price` decimal(10,2) DEFAULT NULL,
    `category` varchar(100) DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id_UNIQUE` (`id`),
    INDEX `idx_parent_id` (`parent_id`),
    INDEX `idx_item_name` (`item_name`),
    INDEX `idx_category` (`category`),
    FOREIGN KEY (`parent_id`) REFERENCES `purchase_history`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='购物清单子表';

-- Shopping list table
CREATE TABLE IF NOT EXISTS `shopping_list` (
    `id` int NOT NULL AUTO_INCREMENT,
    `item_name` varchar(255) NOT NULL,
    `suggested_quantity` int DEFAULT NULL,
    `priority` int DEFAULT '1',
    `status` varchar(20) DEFAULT 'pending',
    `reason` text,
    `added_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `completed_date` timestamp NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_item_name` (`item_name`),
    INDEX `idx_status` (`status`),
    INDEX `idx_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='购物清单';

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
