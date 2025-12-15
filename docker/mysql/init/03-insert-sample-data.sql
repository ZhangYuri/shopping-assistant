-- Insert sample data for development and testing
-- This script populates the database with initial test data

USE shopping_assistant;

-- Sample inventory data
INSERT IGNORE INTO `inventory` (`item_name`, `category`, `current_quantity`, `unit`, `storage_location`, `production_date`, `expiry_date`, `warranty_period_days`) VALUES
('抽纸', '日用品', 5, '包', '客厅储物柜', '2024-01-01', '2026-01-01', 0),
('牛奶', '食品', 3, '瓶', '冰箱', '2024-12-01', '2024-12-20', 0),
('洗发水', '个护用品', 2, '瓶', '浴室', '2024-11-01', '2026-11-01', 0),
('大米', '食品', 1, '袋', '厨房储物柜', '2024-10-01', '2025-10-01', 0),
('牙膏', '个护用品', 4, '支', '浴室', '2024-09-01', '2025-09-01', 0);

-- Sample purchase history
INSERT IGNORE INTO `purchase_history` (`id`, `store_name`, `total_price`, `delivery_cost`, `pay_fee`, `purchase_date`, `purchase_channel`) VALUES
('ORDER_001', '淘宝超市', 156.80, 0.00, 0.00, '2024-12-01 10:30:00', '淘宝'),
('ORDER_002', '京东自营', 89.90, 6.00, 0.00, '2024-11-28 14:20:00', '京东'),
('ORDER_003', '1688批发', 299.50, 15.00, 0.00, '2024-11-25 09:15:00', '1688');

-- Sample purchase sub list
INSERT IGNORE INTO `purchase_sub_list` (`parent_id`, `item_name`, `purchase_quantity`, `model`, `unit_price`, `category`) VALUES
('ORDER_001', '抽纸', 10, '3层120抽', 12.80, '日用品'),
('ORDER_001', '牛奶', 6, '250ml纯牛奶', 3.50, '食品'),
('ORDER_002', '洗发水', 2, '500ml去屑型', 39.90, '个护用品'),
('ORDER_002', '牙膏', 3, '120g美白型', 16.60, '个护用品'),
('ORDER_003', '大米', 5, '5kg东北大米', 45.90, '食品');

-- Sample shopping list
INSERT IGNORE INTO `shopping_list` (`item_name`, `suggested_quantity`, `priority`, `status`, `reason`) VALUES
('抽纸', 5, 2, 'pending', '库存不足，建议补货'),
('洗衣液', 2, 1, 'pending', '新增需求'),
('苹果', 3, 3, 'completed', '季节性水果推荐');

-- Sample user feedback
INSERT IGNORE INTO `user_feedback` (`feedback_type`, `context_data`, `user_action`, `feedback_value`, `agent_suggestion`) VALUES
('procurement_suggestion', '{"item": "抽纸", "suggested_quantity": 10}', 'accepted', 'good', '根据消费历史建议购买10包抽纸'),
('inventory_threshold', '{"item": "牛奶", "threshold": 2}', 'modified', '3', '建议牛奶库存阈值设为2瓶'),
('purchase_timing', '{"item": "洗发水", "timing": "monthly"}', 'accepted', 'good', '建议每月补充洗发水');

-- Sample conversation history
INSERT IGNORE INTO `conversation_history` (`conversation_id`, `user_id`, `message_type`, `content`, `agent_type`, `metadata`) VALUES
('CONV_001', 'user_001', 'user', '抽纸消耗1包', 'inventory', '{"intent": "inventory_update", "action": "consume"}'),
('CONV_001', 'user_001', 'agent', '已更新抽纸库存，当前剩余4包。检测到库存不足，建议补货。', 'inventory', '{"updated_quantity": 4, "threshold_alert": true}'),
('CONV_002', 'user_001', 'user', '查看购物清单', 'procurement', '{"intent": "view_shopping_list"}'),
('CONV_002', 'user_001', 'agent', '当前购物清单包含3项：抽纸(优先级2)、洗衣液(优先级1)、苹果(已完成)', 'procurement', '{"list_count": 3, "pending_count": 2}');
