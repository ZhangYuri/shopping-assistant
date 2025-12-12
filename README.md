# Shopping Assistant Agents System

A multi-agent shopping assistant system built with LangChain and LangGraph for intelligent home inventory management, procurement planning, and financial tracking.

## Overview

This system transforms traditional shopping management into an intelligent, automated workflow using specialized agents that collaborate through natural language interfaces and automated processes.

### Key Features

- **Multi-Agent Architecture**: Specialized agents for inventory, procurement, finance, and notifications
- **Natural Language Interface**: Interact with the system using conversational commands
- **MCP Integration**: Modular Context Protocol servers for database, file storage, cache, and notifications
- **LangGraph Workflows**: Orchestrated agent collaboration and task management
- **Multi-Platform Support**: Import orders from various e-commerce platforms
- **Intelligent Notifications**: Smart notifications via Teams, DingTalk, WeChat Work
- **Property-Based Testing**: Comprehensive correctness validation using formal properties

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                     │
│  Natural Language Interface │ REST API │ Teams Integration  │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                Agent Orchestration Layer                    │
│    LangGraph Workflow Engine │ Agent Router │ Context Mgr   │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                      Agent Layer                            │
│  Inventory │ Procurement │ Finance │ Notification Agents    │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    MCP Service Layer                        │
│  Database │ File Storage │ Cache │ Notification MCP Servers │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                             │
│      Database │ Cache │ File Storage │ External APIs        │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── agents/                 # Agent implementations
│   └── base/              # Base agent classes
├── mcp/                   # MCP server implementations
│   └── base/              # Base MCP server classes
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions and classes
├── test/                  # Test configuration and utilities
└── __tests__/             # Test files
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- TypeScript 5+
- PostgreSQL (for database MCP server)
- Redis (for cache MCP server)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd shopping-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build the project:
```bash
npm run build
```

5. Run tests:
```bash
npm test
```

### Development

Start the development server:
```bash
npm run dev
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run property-based tests:
```bash
npm run test:pbt
```

## Configuration

### Environment Variables

Key configuration options in `.env`:

- `DEEPSEEK_API_KEY`: DeepSeek API key for LangChain
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `TEAMS_WEBHOOK_URL`: Microsoft Teams webhook for notifications
- `LOG_LEVEL`: Logging level (error, warn, info, debug)

### Agent Configuration

Agents are configured with:
- Maximum concurrent tasks
- Retry policies
- Timeout settings
- Capability definitions

### MCP Server Configuration

MCP servers support:
- Connection pooling
- Health check monitoring
- Automatic retry with backoff
- Circuit breaker patterns

## Core Components

### Agents

1. **Inventory Agent**: Manages home inventory through natural language commands and photo processing
2. **Procurement Agent**: Handles purchase planning, order import, and shopping recommendations
3. **Finance Agent**: Tracks expenses, generates reports, and detects spending anomalies
4. **Notification Agent**: Sends intelligent notifications across multiple channels

### MCP Servers

1. **Database MCP Server**: Unified database access with query optimization
2. **File Storage MCP Server**: File management with OCR and image processing
3. **Cache MCP Server**: High-performance caching and session management
4. **Notification MCP Server**: Multi-channel notification delivery

### LangGraph Workflows

- Agent orchestration and coordination
- State management and persistence
- Error handling and recovery
- Parallel and sequential task execution

## Testing

The system uses a comprehensive testing strategy:

### Unit Tests
- Agent functionality validation
- Utility function testing
- Integration point verification

### Property-Based Tests
- 15 formal correctness properties
- 100+ iterations per property test
- Smart input generation and validation

### Key Properties Tested
1. Natural language command processing consistency
2. Inventory data persistence
3. Threshold-triggered notifications
4. Image information extraction completeness
5. Multi-platform data standardization
6. Financial analysis accuracy
7. Workflow state consistency
8. Multi-language processing consistency

Run specific test types:
```bash
npm run test              # All tests
npm run test:pbt          # Property-based tests only
npm run test:coverage     # With coverage report
```

## API Reference

### Agent Interface

```typescript
interface IAgent {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  processTask(task: Task): Promise<any>;
  handleMessage(message: AgentMessage): Promise<AgentMessage | null>;
  getCapabilities(): AgentCapability[];
}
```

### MCP Server Interface

```typescript
interface IMCPServer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  callTool<T>(toolName: string, parameters: any): Promise<MCPCallResult<T>>;
  getAvailableTools(): Promise<MCPToolDefinition[]>;
}
```

## Contributing

1. Follow the established code structure and patterns
2. Write comprehensive tests for new functionality
3. Update documentation for API changes
4. Ensure all property-based tests pass
5. Follow TypeScript best practices

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Write descriptive commit messages
- Include JSDoc comments for public APIs

## License

ISC License - see LICENSE file for details.

## Support

For questions and support:
1. Check the documentation
2. Review existing tests for usage examples
3. Create an issue for bugs or feature requests

## Roadmap

- [ ] Complete MCP server implementations
- [ ] Implement all specialized agents
- [ ] Add LangGraph workflow engine
- [ ] Integrate natural language processing
- [ ] Add multi-platform order import
- [ ] Implement intelligent notification system
- [ ] Add comprehensive monitoring and analytics