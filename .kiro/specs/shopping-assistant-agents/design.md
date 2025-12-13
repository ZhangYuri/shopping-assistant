# 设计文档

## 概述

购物助手智能体系统采用基于LangChain和LangGraph的统一智能体架构，通过专业化智能体协作处理家庭购物管理的各个方面。系统设计为简化的事件驱动架构，每个智能体都基于统一的 `BaseAgent` 类，通过 DynamicTool 直接集成外部服务。

核心设计原则：
- **统一架构**: 所有智能体继承自 `BaseAgent`，使用 LangChain 的 `createReactAgent` 作为核心
- **直接集成**: 通过 DynamicTool 直接访问外部服务，避免不必要的中间层
- **智能体专业化**: 每个智能体专注于特定领域（库存、采购、财务）
- **简化通信**: 智能体通过 LangGraph 工作流进行协调，减少复杂的消息传递
- **容错性**: 在工具级别实现错误处理和重试机制
- **多模态交互**: 支持文本、图像输入，基于 LLM 的自然语言理解

## 架构

### 系统架构图

```mermaid
graph TB
    subgraph "用户接口层"
        UI[自然语言接口]
        API[REST API]
        Teams[Teams集成]
    end

    subgraph "智能体编排层"
        LG[LangGraph StateGraph]
        Router[条件路由节点]
        Context[MemorySaver状态管理]
    end

    subgraph "智能体层"
        IA[库存智能体]
        PA[采购智能体]
        FA[财务智能体]
        NA[通知智能体]
    end

    subgraph "LangChain内置服务"
        MEMORY[MemorySaver]
        STORE[InMemoryStore]
    end

    subgraph "外部服务层"
        DB[(数据库)]
        Files[文件存储]
        OCR[OCR服务]
        Teams[Teams通知]
    end

    UI --> Router
    API --> Router

    Router --> LG
    LG --> IA
    LG --> PA
    LG --> FA
    LG --> NA

    IA --> DB
    IA --> Files
    IA --> OCR
    PA --> DB
    PA --> Files
    PA --> OCR
    FA --> DB
    FA --> STORE
    NA --> Teams
    NA --> MEMORY

    LG --> MEMORY
    LG --> STORE
```

### 智能体交互流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant R as 路由器
    participant LG as LangGraph
    participant IA as 库存智能体
    participant PA as 采购智能体
    participant DB as 数据库
    participant Teams as Teams通知

    U->>R: "抽纸消耗1包"
    R->>LG: 路由到库存智能体
    LG->>IA: 处理库存更新
    IA->>DB: 查询当前库存 (通过DynamicTool)
    DB-->>IA: 返回库存信息
    IA->>DB: 更新库存数量 (通过DynamicTool)
    DB-->>IA: 确认更新成功
    IA->>LG: 库存更新完成
    LG->>PA: 检查是否需要补货
    PA->>DB: 分析历史消费 (通过DynamicTool)
    DB-->>PA: 返回分析结果
    PA->>Teams: 发送补货建议通知 (通过DynamicTool)
    Teams-->>PA: 通知发送确认
    PA-->>LG: 补货建议
    LG->>U: 确认更新并提供建议
```

## 组件和接口

### 核心智能体组件

#### 1. 库存智能体 (InventoryAgent)

**职责:**
- 自然语言库存命令解析
- 图像识别和OCR处理协调
- 库存数据管理逻辑
- 库存阈值监控和预警

**接口:**
```typescript
interface InventoryAgent {
  processInventoryCommand(command: string, threadId?: string): Promise<AgentResult>
  processPhotoUpload(photoFileId: string, description: string, threadId?: string): Promise<AgentResult>
  checkInventoryLevels(threadId?: string): Promise<AgentResult>
  getInventoryReport(itemName?: string, threadId?: string): Promise<AgentResult>
  updateThresholds(thresholds: Record<string, number>): void
  getThresholds(): Record<string, number>

  // 继承自BaseAgent的统一接口
  invoke(input: string, config?: any): Promise<AgentResult>
  stream(input: string, config?: any): Promise<AsyncIterable<any>>
  addTool(tool: DynamicTool): void
  removeTool(toolName: string): boolean
}
```

#### 2. 采购智能体 (ProcurementAgent)

**职责:**
- 订单导入和解析逻辑
- 采购建议算法
- 购物清单管理逻辑
- 多平台数据标准化

**接口:**
```typescript
interface ProcurementAgent {
  importOrders(fileId: string, platform: string, threadId?: string): Promise<AgentResult>
  generatePurchaseRecommendations(analysisDepthDays?: number, categories?: string[], threadId?: string): Promise<AgentResult>
  manageShoppingList(action: string, itemData?: any, itemId?: string, threadId?: string): Promise<AgentResult>
  getOrderHistory(filters?: any, threadId?: string): Promise<AgentResult>
  analyzePurchasePatterns(timeRange?: string, categories?: string[], threadId?: string): Promise<AgentResult>
  updateDefaultPlatforms(platforms: string[]): void
  getDefaultPlatforms(): string[]

  // 继承自BaseAgent的统一接口
  invoke(input: string, config?: any): Promise<AgentResult>
  stream(input: string, config?: any): Promise<AsyncIterable<any>>
  addTool(tool: DynamicTool): void
  removeTool(toolName: string): boolean
}
```

#### 3. 财务智能体 (FinanceAgent)

**职责:**
- 支出分析算法和分类逻辑
- 财务报告生成逻辑
- 异常消费检测算法
- 预算管理和监控

**接口:**
```typescript
interface FinanceAgent {
  generateMonthlyReport(month: string, threadId?: string): Promise<AgentResult>
  detectAnomalousSpending(threadId?: string): Promise<AgentResult>
  categorizeExpenses(orderIds: string[], threadId?: string): Promise<AgentResult>
  trackBudgetStatus(threadId?: string): Promise<AgentResult>
  generateQuarterlyAnalysis(threadId?: string): Promise<AgentResult>

  // 继承自BaseAgent的统一接口
  invoke(input: string, config?: any): Promise<AgentResult>
  stream(input: string, config?: any): Promise<AsyncIterable<any>>
  addTool(tool: DynamicTool): void
  removeTool(toolName: string): boolean

  // LangChain内置缓存使用
  // 通过InMemoryStore进行结果缓存
}
```

#### 4. 通知智能体 (NotificationAgent)

**职责:**
- 通知内容智能生成和优化
- 通知时机和频率控制
- 用户偏好学习和适应
- 通知效果分析和改进

**接口:**
```typescript
interface NotificationAgent {
  sendSmartNotification(content: NotificationContent, context: NotificationContext, threadId?: string): Promise<AgentResult>
  scheduleIntelligentNotification(notification: IntelligentNotification, threadId?: string): Promise<AgentResult>
  sendContextualAlert(alert: ContextualAlert, threadId?: string): Promise<AgentResult>
  optimizeNotificationTiming(userId: string, notificationType: string, threadId?: string): Promise<AgentResult>
  analyzeNotificationEffectiveness(threadId?: string): Promise<AgentResult>

  // 继承自BaseAgent的统一接口
  invoke(input: string, config?: any): Promise<AgentResult>
  stream(input: string, config?: any): Promise<AsyncIterable<any>>
  addTool(tool: DynamicTool): void
  removeTool(toolName: string): boolean

  // LangChain内置状态管理
  // 通过MemorySaver进行对话状态管理
}

// 智能通知相关模型
interface NotificationContent {
  type: 'inventory_alert' | 'purchase_recommendation' | 'financial_report' | 'system_update'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  data: any
  userId: string
}

interface NotificationContext {
  userActivity: UserActivity
  currentTime: Date
  recentNotifications: RecentNotification[]
  userPreferences: NotificationPreferences
}

interface IntelligentNotification {
  content: NotificationContent
  optimalTiming: OptimalTiming
  personalization: PersonalizationSettings
  fallbackChannels: string[]
}

interface OptimalTiming {
  recommendedTime: Date
  confidence: number
  reasoning: string
  alternativeTimes: Date[]
}

interface NotificationAnalytics {
  deliveryRate: number
  readRate: number
  actionRate: number
  channelEffectiveness: Record<string, number>
  timeEffectiveness: Record<string, number>
  recommendations: string[]
}
```

### DynamicTool 工具组件

#### 数据库工具集

**职责:**
- 直接提供数据库访问功能
- 处理SQL查询和事务管理
- 实现错误处理和重试机制
- 提供数据验证和转换

**工具接口示例:**
```typescript
// 库存相关工具
const getInventoryItemTool = new DynamicTool({
  name: 'getInventoryItem',
  description: '根据物品名称查询库存信息',
  func: async (input: string) => {
    const { itemName } = JSON.parse(input);
    // 直接调用数据库服务
    const result = await databaseService.getInventoryItem(itemName);
    return JSON.stringify(result);
  }
});

// 订单相关工具
const importOrdersTool = new DynamicTool({
  name: 'import_orders',
  description: '导入订单数据到数据库',
  func: async (input: string) => {
    const { orders, platform } = JSON.parse(input);
    // 直接调用数据库服务，包含重复检测逻辑
    const result = await databaseService.importOrders(orders, platform);
    return JSON.stringify(result);
  }
});
```

#### 文件存储工具集

**职责:**
- 直接管理图片和文档存储
- 提供OCR和图像处理服务
- 处理Excel文件解析
- 实现文件操作的错误处理

**工具接口示例:**
```typescript
const processImageTool = new DynamicTool({
  name: 'processImage',
  description: '处理图片并进行OCR识别',
  func: async (input: string) => {
    const { fileId } = JSON.parse(input);
    // 直接调用OCR服务
    const result = await ocrService.processImage(fileId);
    return JSON.stringify(result);
  }
});

const parseExcelTool = new DynamicTool({
  name: 'parse_excel_file',
  description: '解析Excel文件中的订单数据',
  func: async (input: string) => {
    const { fileId, platform } = JSON.parse(input);
    // 直接调用Excel解析服务
    const result = await excelService.parseFile(fileId, platform);
    return JSON.stringify(result);
  }
});
```

#### 缓存和状态管理

**设计决策：使用 LangChain 内置缓存功能**

基于架构简化和避免重复造轮子的原则，我们将使用 LangChain 的内置缓存和状态管理功能，而不是实现独立的 CacheMCPServer：

**LangChain 内置功能使用：**
```typescript
// 对话状态管理 - 使用 LangGraph 的内置状态管理
import { MemorySaver } from "@langchain/langgraph";
import { InMemoryStore } from "@langchain/core/stores";

// 对话记忆管理
const memorySaver = new MemorySaver();

// 通用缓存存储
const cacheStore = new InMemoryStore();

// 智能体状态持久化
interface AgentStateManager {
  saveConversationState(conversationId: string, state: any): Promise<void>;
  loadConversationState(conversationId: string): Promise<any>;
  cacheAnalysisResult(key: string, result: any, ttl?: number): Promise<void>;
  getCachedResult(key: string): Promise<any | null>;
}
```

#### 通知工具集

**职责:**
- 直接发送多渠道通知
- 支持多种通知渠道（Teams、钉钉、企业微信、Slack等）
- 通知模板管理和个性化
- 通知发送状态跟踪和重试

**工具接口示例:**
```typescript
const sendNotificationTool = new DynamicTool({
  name: 'send_notification',
  description: '发送通知消息',
  func: async (input: string) => {
    const { message, channels, priority } = JSON.parse(input);
    // 直接调用通知服务
    const result = await notificationService.sendNotification({
      message,
      channels,
      priority
    });
    return JSON.stringify(result);
  }
});

const sendTeamsNotificationTool = new DynamicTool({
  name: 'send_teams_notification',
  description: '发送Teams通知',
  func: async (input: string) => {
    const { message, webhookUrl } = JSON.parse(input);
    // 直接调用Teams API
    const result = await teamsService.sendMessage(message, webhookUrl);
    return JSON.stringify(result);
  }
});
```

// 通知相关数据模型
interface NotificationRequest {
  recipientId: string
  channels: string[] // ['teams', 'dingtalk', 'wechat-work']
  priority: 'low' | 'normal' | 'high' | 'urgent'
  templateId?: string
  customMessage?: CustomMessage
  data?: Record<string, any>
  scheduledTime?: Date
  expiryTime?: Date
}

interface CustomMessage {
  title: string
  content: string
  attachments?: NotificationAttachment[]
  actions?: NotificationAction[]
}

interface NotificationAttachment {
  type: 'image' | 'file' | 'link'
  url: string
  title?: string
  description?: string
}

interface NotificationAction {
  actionId: string
  label: string
  actionType: 'button' | 'link' | 'quick-reply'
  actionData: any
}

interface NotificationChannelConfig {
  channelName: string
  channelType: 'teams' | 'dingtalk' | 'wechat-work' | 'slack' | 'email' | 'sms'
  config: {
    webhookUrl?: string
    apiKey?: string
    appId?: string
    appSecret?: string
    [key: string]: any
  }
  enabled: boolean
  rateLimits?: RateLimitConfig
}

interface RateLimitConfig {
  maxRequestsPerMinute: number
  maxRequestsPerHour: number
  maxRequestsPerDay: number
}

interface NotificationPreferences {
  userId: string
  enabledChannels: string[]
  quietHours?: {
    start: string // "22:00"
    end: string   // "08:00"
    timezone: string
  }
  categoryPreferences: Record<string, boolean> // { 'inventory_alert': true, 'financial_report': false }
  language: 'zh-CN' | 'en-US'
}

interface NotificationResult {
  notificationId: string
  success: boolean
  channelResults: ChannelResult[]
  error?: string
}

interface ChannelResult {
  channelName: string
  success: boolean
  messageId?: string
  error?: string
  deliveredAt?: Date
}
```

### LangGraph 原生工作流

**使用 LangGraph 内置功能:**
- 直接使用 `StateGraph` 进行智能体编排
- 使用 `MemorySaver` 进行状态持久化
- 利用 LangGraph 的内置错误处理和重试机制
- 使用 LangGraph 的并行执行和条件路由

**实现方式:**
```typescript
import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { BaseAgent } from "./agents/base/BaseAgent";

// 定义工作流状态
interface WorkflowState {
  userInput: string;
  currentAgent: string;
  agentResults: Record<string, any>;
  finalResponse: string;
}

// 创建状态图
const workflow = new StateGraph<WorkflowState>({
  channels: {
    userInput: null,
    currentAgent: null,
    agentResults: {},
    finalResponse: null,
  }
});

// 添加智能体节点
workflow.addNode("inventory", async (state) => {
  const agent = inventoryAgent;
  const result = await agent.invoke(state.userInput);
  return { ...state, agentResults: { ...state.agentResults, inventory: result } };
});

workflow.addNode("procurement", async (state) => {
  const agent = procurementAgent;
  const result = await agent.invoke(state.userInput);
  return { ...state, agentResults: { ...state.agentResults, procurement: result } };
});

// 添加路由逻辑
workflow.addConditionalEdges(
  "router",
  (state) => {
    // 基于用户输入决定路由到哪个智能体
    if (state.userInput.includes("库存") || state.userInput.includes("消耗")) {
      return "inventory";
    } else if (state.userInput.includes("订单") || state.userInput.includes("采购")) {
      return "procurement";
    }
    return "inventory"; // 默认路由
  },
  {
    inventory: "inventory",
    procurement: "procurement",
  }
);

// 编译工作流
const app = workflow.compile({
  checkpointer: new MemorySaver(),
});
```

## 数据模型

### 智能体状态模型

```typescript
interface AgentState {
  agentId: string
  status: 'idle' | 'processing' | 'waiting' | 'error'
  currentTask?: Task
  context: Record<string, any>
  lastActivity: Date
  errorCount: number
}
```

### LangGraph 工作流状态模型

```typescript
// 使用 LangGraph 的内置状态管理
interface WorkflowState {
  userInput: string
  currentAgent: string
  agentResults: Record<string, any>
  finalResponse: string
  metadata?: {
    threadId: string
    timestamp: Date
    userId?: string
  }
}

// LangGraph 自动管理的状态
interface LangGraphInternalState {
  // LangGraph 内部维护的状态，包括：
  // - 节点执行历史
  // - 检查点数据
  // - 错误状态
  // - 重试计数等
}
```

### 消息模型

```typescript
interface AgentMessage {
  messageId: string
  fromAgent: string
  toAgent: string
  messageType: 'request' | 'response' | 'notification' | 'error'
  payload: any
  timestamp: Date
  correlationId?: string
}
```

### 扩展的数据模型

基于现有数据库设计，添加智能体系统和MCP集成所需的模型：

#### 订单数据模型 (主表+子表结构)

```typescript
// 订单主表 (purchase_history)
interface Order {
  id: string
  store_name: string
  total_price?: number
  delivery_cost?: number
  pay_fee?: number
  purchase_date?: Date
  purchase_channel?: string
  created_at: Date
}

// 订单商品明细 (purchase_sub_list)
interface OrderItem {
  id: number
  parent_id: string
  item_name: string
  purchase_quantity: number
  model?: string
  unit_price?: number
  category?: string
  created_at: Date
}

// 创建订单时的数据结构
interface CreateOrder {
  id: string
  store_name: string
  total_price?: number
  delivery_cost?: number
  pay_fee?: number
  purchase_date?: Date
  purchase_channel?: string
  items?: CreateOrderItem[] // 支持一个订单多个商品
}

interface CreateOrderItem {
  item_name: string
  purchase_quantity: number
  model?: string
  unit_price?: number
  category?: string
}
```

```typescript
interface AgentTask {
  taskId: string
  agentId: string
  taskType: string
  priority: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  input: any
  output?: any
  createdAt: Date
  completedAt?: Date
  retryCount: number
}

interface ConversationContext {
  conversationId: string
  userId: string
  currentIntent: string
  entities: Record<string, any>
  history: ConversationTurn[]
  lastActivity: Date
}

interface ConversationTurn {
  turnId: string
  userInput: string
  agentResponse: string
  intent: string
  entities: Record<string, any>
  timestamp: Date
}

// 工具相关模型
interface ToolConfig {
  name: string
  description: string
  category: 'database' | 'file-storage' | 'notification'
  retryPolicy: RetryPolicy
  timeout: number
}

interface ToolCall {
  callId: string
  toolName: string
  parameters: any
  timestamp: Date
  duration?: number
  success: boolean
  result?: any
  error?: string
}

interface RetryPolicy {
  maxRetries: number
  backoffStrategy: 'exponential' | 'linear' | 'fixed'
  baseDelay: number
  maxDelay: number
}

// 文件处理相关模型
interface FileMetadata {
  fileId: string
  originalName: string
  mimeType: string
  size: number
  uploadedBy: string
  uploadedAt: Date
  tags: string[]
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
}

interface OCRResult {
  fileId: string
  extractedText: string
  confidence: number
  detectedFields: DetectedField[]
  processingTime: number
}

interface DetectedField {
  fieldType: 'expiry_date' | 'production_date' | 'warranty_info' | 'product_name' | 'price' | 'other'
  value: string
  confidence: number
  boundingBox?: BoundingBox
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}
```

## 正确性属性

*属性是应该在系统的所有有效执行中保持为真的特征或行为——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性反思

在分析所有可测试的验收标准后，我识别出以下可以合并或简化的冗余属性：

**冗余分析:**
- 属性1.1和1.2都涉及自然语言命令处理，可以合并为一个综合的命令处理属性
- 属性3.4和8.1都涉及Teams通知发送，可以合并为通用通知属性
- 属性2.4和1.3都涉及库存数据库更新，可以合并为库存持久化属性
- 多个错误处理属性(1.4, 2.5, 4.5, 8.5)可以合并为通用错误处理属性

**合并后的核心属性:**

**属性 1: 自然语言命令处理一致性**
*对于任何*有效的自然语言库存命令，系统应正确解析意图、提取物品详情，并按指定数量更新库存
**验证需求: 需求 1.1, 1.2**

**属性 2: 库存数据持久化**
*对于任何*库存更新操作（增加或减少），数据库中的库存数量应立即反映变化
**验证需求: 需求 1.3, 2.4**

**属性 3: 阈值触发通知**
*对于任何*库存物品，当数量达到预定义阈值时，系统应自动触发相应的通知或建议
**验证需求: 需求 1.5, 8.2**

**属性 4: 图像信息提取完整性**
*对于任何*包含产品信息的图像，OCR系统应提取所有可识别的文本信息，并与用户输入正确整合
**验证需求: 需求 2.1, 2.2, 2.3**

**属性 5: 采购建议生成逻辑**
*对于任何*历史采购数据集，采购智能体应基于消费模式、季节性和库存水平生成合理的补货建议
**验证需求: 需求 3.1, 3.2, 3.3**

**属性 6: 多平台数据标准化**
*对于任何*来自支持平台的订单数据，系统应将其转换为统一的内部格式，并正确更新相关记录
**验证需求: 需求 4.1, 4.2, 4.3**

**属性 7: 重复数据检测**
*对于任何*导入的订单数据，系统应检测并防止重复条目的创建
**验证需求: 需求 4.4**

**属性 8: 财务分析准确性**
*对于任何*给定时间段的支出数据，财务智能体应生成准确的分类报告和异常检测结果
**验证需求: 需求 5.1, 5.2, 5.4, 5.5**

**属性 9: 工作流状态一致性**
*对于任何*多智能体协作工作流，系统应在智能体交接过程中保持上下文和状态的一致性
**验证需求: 需求 6.1, 6.2, 6.5**

**属性 10: 对话上下文连续性**
*对于任何*多轮对话，自然语言接口应维护上下文信息，并将请求正确路由到适当的智能体
**验证需求: 需求 7.1, 7.2, 7.4**

**属性 11: 多语言处理一致性**
*对于任何*中文或英文输入，自然语言接口应提供一致的处理质量和响应准确性
**验证需求: 需求 7.5**

**属性 12: 通知发送可靠性**
*对于任何*需要发送通知的事件（分析完成、异常检测、季节建议），系统应通过Teams集成可靠地发送通知
**验证需求: 需求 3.4, 5.3, 8.1, 8.3, 8.4**

**属性 13: 错误处理和恢复**
*对于任何*系统错误或异常情况，相关智能体应提供适当的错误消息、实施恢复机制，并记录事件
**验证需求: 需求 1.4, 2.5, 4.5, 6.3, 8.5**

**属性 14: 安全访问控制**
*对于任何*智能体对外部资源的访问请求，系统应验证权限并提供安全的访问机制
**验证需求: 需求 6.4**

**属性 15: 澄清机制有效性**
*对于任何*模糊或不完整的用户输入，自然语言接口应询问具体问题以获得必要的澄清
**验证需求: 需求 7.3**

## 错误处理

### 智能体级别错误处理

**错误分类:**
1. **输入验证错误**: 无效的用户输入或数据格式
2. **处理逻辑错误**: 智能体内部处理失败
3. **MCP服务错误**: MCP服务器连接或工具调用失败
4. **外部服务错误**: 第三方API或服务不可用
5. **工作流协调错误**: 智能体间通信或状态同步失败

**错误处理策略:**

```typescript
interface ErrorHandlingStrategy {
  errorType: ErrorType
  retryPolicy: RetryPolicy
  fallbackAction: FallbackAction
  notificationLevel: NotificationLevel
}

enum ErrorType {
  INPUT_VALIDATION = 'input_validation',
  PROCESSING_LOGIC = 'processing_logic',
  MCP_SERVICE = 'mcp_service',
  EXTERNAL_SERVICE = 'external_service',
  WORKFLOW_COORDINATION = 'workflow_coordination'
}

interface RetryPolicy {
  maxRetries: number
  backoffStrategy: 'exponential' | 'linear' | 'fixed'
  baseDelay: number
  maxDelay: number
}
```

**具体错误处理机制:**

1. **库存智能体错误处理**
   - OCR失败: 请求用户手动输入
   - 数据库服务不可用: 使用LangChain InMemoryStore临时存储
   - 无效命令: 提供建议和示例
   - 工具调用超时: 自动重试和降级处理

2. **采购智能体错误处理**
   - 文件解析失败: 提供格式要求和示例
   - 文件存储服务异常: 降级到本地临时存储
   - 数据重复: 智能去重和用户确认
   - 订单导入失败: 部分导入和错误报告

3. **财务智能体错误处理**
   - 计算异常: 回退到简化算法
   - 数据库查询超时: 使用缓存数据生成部分报告
   - 异常检测误报: 用户反馈学习机制
   - 报告生成失败: 提供简化版本报告

4. **通知智能体错误处理**
   - 通知发送失败: 切换到备用通知渠道
   - 通知服务异常: 降级到简单邮件通知
   - 用户偏好获取失败: 使用默认通知设置
   - 渠道不可用: 自动切换到可用渠道

5. **工具级别错误处理**
   - 连接超时: 自动重试和断路器模式
   - 工具调用失败: 降级到备用实现
   - 服务不可用: 使用缓存数据或简化功能
   - 参数验证失败: 提供详细的错误信息和建议

### 系统级别错误恢复

**断路器模式:**
```typescript
interface CircuitBreaker {
  serviceName: string
  failureThreshold: number
  recoveryTimeout: number
  state: 'closed' | 'open' | 'half-open'

  call<T>(operation: () => Promise<T>): Promise<T>
  onFailure(error: Error): void
  onSuccess(): void
}
```

**状态恢复机制:**
- 工作流检查点: 定期保存工作流状态
- 智能体状态快照: 关键操作前保存状态
- 事务性操作: 确保数据一致性
- 补偿操作: 失败时的回滚机制

## 测试策略

### 双重测试方法

系统将采用单元测试和基于属性的测试相结合的方法：

**单元测试覆盖:**
- 智能体核心功能的具体示例
- 边界条件和错误情况
- 集成点验证
- API接口契约测试

**基于属性的测试覆盖:**
- 使用fast-check库进行TypeScript属性测试
- 每个属性测试运行最少100次迭代
- 智能生成器约束到合理的输入空间
- 验证系统在各种输入下的通用正确性属性

**测试框架配置:**
- **单元测试**: Jest + TypeScript
- **属性测试**: fast-check
- **MCP集成测试**: 模拟MCP服务器 + 契约测试
- **集成测试**: Supertest + 测试数据库
- **端到端测试**: Playwright

**测试数据生成策略:**
```typescript
// 智能体消息生成器
const agentMessageGenerator = fc.record({
  messageId: fc.uuid(),
  fromAgent: fc.constantFrom('inventory', 'procurement', 'finance', 'notification'),
  toAgent: fc.constantFrom('inventory', 'procurement', 'finance', 'notification'),
  messageType: fc.constantFrom('request', 'response', 'notification', 'error'),
  payload: fc.anything(),
  timestamp: fc.date()
})

// 库存命令生成器
const inventoryCommandGenerator = fc.record({
  action: fc.constantFrom('消耗', '添加', '查询', '更新'),
  itemName: fc.stringOf(fc.char(), { minLength: 1, maxLength: 50 }),
  quantity: fc.integer({ min: 1, max: 100 }),
  unit: fc.constantFrom('包', '个', '瓶', '盒', '袋')
})
```

**属性测试标记格式:**
每个基于属性的测试必须使用以下格式标记：
`**Feature: shopping-assistant-agents, Property {number}: {property_text}**`

**测试执行要求:**
- 所有属性测试配置为运行最少100次迭代
- 测试失败时提供详细的反例信息
- 集成测试使用隔离的测试数据库
- 性能测试验证响应时间在可接受范围内

**测试覆盖率目标:**
- 代码覆盖率: 最少85%
- 属性覆盖率: 所有15个正确性属性
- MCP工具覆盖率: 所有MCP工具调用路径
- 错误路径覆盖率: 所有定义的错误处理场景
- 集成覆盖率: 所有智能体间交互路径

**工具集成测试策略:**
- **工具模拟**: 为每个工具类别（数据库、文件存储、通知）创建测试替身
- **契约测试**: 验证智能体与工具的接口契约
- **故障注入测试**: 模拟外部服务故障场景和降级处理
- **通知集成测试**: 验证多渠道通知发送和回退机制
- **性能测试**: 验证工具调用的响应时间和吞吐量
- **错误恢复测试**: 验证工具级别的重试和降级机制
