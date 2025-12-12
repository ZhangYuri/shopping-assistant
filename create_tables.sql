CREATE TABLE `inventory` (
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
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='库存表'

CREATE TABLE `purchase_history` (
    `id` varchar(45) NOT NULL,
    `store_name` varchar(255) NOT NULL,
    `total_price` decimal(10,2) DEFAULT NULL,
    `delivery_cost` decimal(10,2) DEFAULT NULL,
    `pay_fee` decimal(10,2) DEFAULT NULL,
    `purchase_date` timestamp NULL DEFAULT NULL,
    `purchase_channel` varchar(100) DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='历史购物订单表'

CREATE TABLE `purchase_sub_list` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `parent_id` varchar(45) NOT NULL,
    `item_name` varchar(225) NOT NULL,
    `purchase_quantity` int unsigned DEFAULT '1',
    `model` varchar(100) DEFAULT NULL,
    `unit_price` decimal(10,2) DEFAULT NULL,
    `category` varchar(100) DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=262 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='购物清单子表'

CREATE TABLE `shopping_list` (
    `id` int NOT NULL AUTO_INCREMENT,
    `item_name` varchar(255) NOT NULL,
    `suggested_quantity` int DEFAULT NULL,
    `priority` int DEFAULT '1',
    `status` varchar(20) DEFAULT 'pending',
    `reason` text,
    `added_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `completed_date` timestamp NULL DEFAULT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='购物清单'