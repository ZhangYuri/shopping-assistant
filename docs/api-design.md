# Shopping Assistant API 设计文档

## 设计理念

本API采用**统一对话接口**设计，所有用户交互都通过LangGraph智能路由系统自动分发到合适的智能体，而不是直接暴露各个智能体的接口。

## 核心原则

1. **统一入口**: 用户只需要通过一个对话接口与系统交互
2. **智能路由**: LangGraph根据用户输入自动路由到合适的智能体（库存、采购、财务、通知）
3. **自然交互**: 用户使用自然语言描述需求，无需了解内部智能体结构
4. **多模态支持**: 支持文本、图片、Excel文件等多种输入方式

## API 端点

### 1. 统一对话接口

**POST /api/chat**

所有用户请求的统一入口，支持：
- 库存查询和管理："查询抽纸库存"、"消耗牛奶2瓶"
- 采购建议："帮我分析需要采购什么"、"生成购物清单"
- 财务分析："本月花费情况"、"生成财务报告"
- 通知管理："发送库存提醒到Teams"

```json
{
  "message": "抽纸消耗了1包",
  "conversationId": "optional-conversation-id",
  "userId": "user-123",
  "language": "zh-CN"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "response": "已更新抽纸库存，当前剩余3包",
    "conversationId": "conv-123",
    "targetAgent": "inventory",  // LangGraph自动路由的结果
    "confidence": 0.95,
    "requiresClarification": false,
    "suggestedActions": ["查看库存报告", "设置库存提醒"],
    "metadata": {
      "processingTime": 150,
      "detectedLanguage": "zh-CN",
      "responseLanguage": "zh-CN",
      "routedBy": "LangGraph"
    }
  }
}
```

### 2. 图片上传接口

**POST /api/upload/image**

上传产品图片，系统自动进行OCR识别并更新库存：

```bash
curl -X POST /api/upload/image \
  -F "image=@product.jpg" \
  -F "description=新买的抽纸" \
  -F "conversationId=conv-123" \
  -F "userId=user-123"
```

**响应:**
```json
{
  "success": true,
  "data": {
    "fileId": "img-123.jpg",
    "originalName": "product.jpg",
    "processingResult": {
      "targetAgent": "inventory",  // 自动路由到库存智能体
      "confidence": 0.88,
      "reasoning": "检测到产品图片，已进行OCR识别并更新库存"
    }
  }
}
```

### 3. Excel上传接口

**POST /api/upload/excel**

上传订单Excel文件，系统自动解析并导入：

```bash
curl -X POST /api/upload/excel \
  -F "excel=@orders.xlsx" \
  -F "platform=淘宝" \
  -F "conversationId=conv-123" \
  -F "userId=user-123"
```

**响应:**
```json
{
  "success": true,
  "data": {
    "fileId": "excel-123.xlsx",
    "platform": "淘宝",
    "processingResult": {
      "targetAgent": "procurement",  // 自动路由到采购智能体
      "confidence": 0.92,
      "reasoning": "已解析淘宝订单文件，导入15个订单"
    }
  }
}
```

### 4. 对话管理

**GET /api/chat/:conversationId** - 获取对话信息
**DELETE /api/chat/:conversationId** - 删除对话

### 5. 系统监控

**GET /health** - 基础健康检查
**GET /health/detailed** - 详细健康状态
**GET /api/status** - 系统状态
**GET /api/metrics** - 系统指标

## 智能体路由示例

用户输入会被LangGraph自动路由到合适的智能体：

| 用户输入 | 路由到智能体 | 说明 |
|---------|-------------|------|
| "抽纸消耗1包" | inventory | 库存管理 |
| "帮我分析需要买什么" | procurement | 采购建议 |
| "本月花了多少钱" | finance | 财务分析 |
| "发送提醒到Teams" | notification | 通知管理 |
| 上传产品图片 | inventory | OCR识别 |
| 上传订单Excel | procurement | 订单导入 |

## 错误处理

所有API都返回统一的错误格式：

```json
{
  "success": false,
  "error": "错误描述",
  "requestId": "req-123",
  "timestamp": "2024-12-14T10:30:00Z"
}
```

## 认证

支持Bearer Token认证（可选）：

```bash
curl -H "Authorization: Bearer your-token" /api/chat
```

## 总结

这种设计的优势：

1. **用户友好**: 用户无需了解内部智能体结构
2. **灵活扩展**: 新增智能体不影响API接口
3. **智能路由**: LangGraph自动处理复杂的路由逻辑
4. **统一体验**: 所有功能通过一致的对话接口访问
5. **多模态**: 支持文本、图片、文件等多种输入方式

用户只需要通过自然语言描述需求，系统会自动理解并路由到合适的智能体进行处理。
