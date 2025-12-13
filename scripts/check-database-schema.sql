-- 数据库表结构检查和创建脚本
-- Database Schema Check and Creation Script

-- 使用shopping_assistant数据库
USE shopping_assistant;

-- 检查并创建inventory表（库存表）
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),
    current_quantity INT NOT NULL DEFAULT 0,
    unit VARCHAR(20),
    storage_location VARCHAR(100),
    production_date DATE,
    expiry_date DATE,
    warranty_period_days INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_item_name (item_name),
    INDEX idx_category (category),
    INDEX idx_quantity (current_quantity),
    INDEX idx_expiry (expiry_date)
);

-- 检查并创建purchase_history表（采购历史主表）
CREATE TABLE IF NOT EXISTS purchase_history (
    id VARCHAR(50) PRIMARY KEY,
    store_name VARCHAR(255) NOT NULL,
    total_price DECIMAL(10,2),
    delivery_cost DECIMAL(10,2),
    pay_fee DECIMAL(10,2),
    purchase_date DATE,
    purchase_channel VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_store_name (store_name),
    INDEX idx_purchase_date (purchase_date),
    INDEX idx_channel (purchase_channel)
);

-- 检查并创建purchase_sub_list表（采购商品明细表）
CREATE TABLE IF NOT EXISTS purchase_sub_list (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    purchase_quantity INT NOT NULL,
    model VARCHAR(100),
    unit_price DECIMAL(10,2),
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES purchase_history(id) ON DELETE CASCADE,
    INDEX idx_parent_id (parent_id),
    INDEX idx_item_name (item_name),
    INDEX idx_category (category)
);

-- 检查并创建shopping_list表（购物清单表）
CREATE TABLE IF NOT EXISTS shopping_list (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    suggested_quantity INT,
    priority INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    reason TEXT,
    added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_date TIMESTAMP NULL,
    INDEX idx_item_name (item_name),
    INDEX idx_status (status),
    INDEX idx_priority (priority)
);

-- 显示表结构信息
SHOW TABLES;

-- 显示inventory表结构
DESCRIBE inventory;

-- 显示当前inventory表中的数据
SELECT COUNT(*) as total_items FROM inventory;
SELECT * FROM inventory ORDER BY created_at DESC LIMIT 10;
