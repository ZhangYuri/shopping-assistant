-- User feedback learning table for procurement recommendations
CREATE TABLE IF NOT EXISTS `user_feedback` (
    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
    `recommendation_id` varchar(100) NOT NULL COMMENT '推荐ID，用于关联具体的推荐',
    `item_name` varchar(255) NOT NULL COMMENT '物品名称',
    `category` varchar(100) DEFAULT NULL COMMENT '物品分类',
    `recommended_quantity` int DEFAULT NULL COMMENT '推荐数量',
    `recommended_priority` int DEFAULT NULL COMMENT '推荐优先级',
    `recommendation_reason` text COMMENT '推荐原因',
    `user_action` enum('accepted', 'rejected', 'modified', 'ignored') NOT NULL COMMENT '用户行为',
    `user_feedback` text COMMENT '用户反馈内容',
    `actual_quantity` int DEFAULT NULL COMMENT '用户实际购买数量（如果修改）',
    `actual_priority` int DEFAULT NULL COMMENT '用户实际设置优先级（如果修改）',
    `feedback_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '反馈时间',
    `recommendation_date` timestamp NULL DEFAULT NULL COMMENT '推荐生成时间',
    `context_data` json DEFAULT NULL COMMENT '推荐时的上下文数据（库存水平、消费模式等）',
    `learning_weight` decimal(3,2) DEFAULT '1.00' COMMENT '学习权重，用于算法优化',
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id` (`id`),
    KEY `idx_item_name` (`item_name`),
    KEY `idx_category` (`category`),
    KEY `idx_user_action` (`user_action`),
    KEY `idx_feedback_date` (`feedback_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户反馈学习表';

-- User preference learning table for personalized recommendations
CREATE TABLE IF NOT EXISTS `user_preferences` (
    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
    `preference_type` varchar(50) NOT NULL COMMENT '偏好类型：category_priority, seasonal_adjustment, quantity_preference等',
    `preference_key` varchar(100) NOT NULL COMMENT '偏好键（如分类名称、季节等）',
    `preference_value` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT '偏好值（权重或调整系数）',
    `confidence_score` decimal(3,2) DEFAULT '0.50' COMMENT '置信度分数',
    `sample_count` int DEFAULT '1' COMMENT '样本数量',
    `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_preference` (`preference_type`, `preference_key`),
    KEY `idx_preference_type` (`preference_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户偏好学习表';

-- Recommendation performance tracking
CREATE TABLE IF NOT EXISTS `recommendation_metrics` (
    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
    `metric_date` date NOT NULL COMMENT '统计日期',
    `total_recommendations` int DEFAULT '0' COMMENT '总推荐数',
    `accepted_recommendations` int DEFAULT '0' COMMENT '接受的推荐数',
    `rejected_recommendations` int DEFAULT '0' COMMENT '拒绝的推荐数',
    `modified_recommendations` int DEFAULT '0' COMMENT '修改的推荐数',
    `acceptance_rate` decimal(5,2) DEFAULT '0.00' COMMENT '接受率',
    `avg_priority_accuracy` decimal(5,2) DEFAULT '0.00' COMMENT '优先级准确度',
    `avg_quantity_accuracy` decimal(5,2) DEFAULT '0.00' COMMENT '数量准确度',
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_date` (`metric_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推荐性能指标表';
