# Changelog

All notable changes to this project will be documented in this file.

## [2.8.0] - 2026-04-05

### 🚀 Major New Features

#### Advanced Agent Reasoning
- **ReAct Agent with Reflection**: Implements reasoning-acting pattern with self-reflection for improved decision-making
- **Chain of Thought Agent**: Step-by-step reasoning with explicit thought processes for complex problem-solving
- **Tree of Thoughts Agent**: Explores multiple solution paths simultaneously with evaluation and selection
- **Enhanced Agent Executor**: Parallel tool execution with dependency resolution and streaming support

#### Multi-Agent Collaboration
- **Agent Teams**: Create and manage teams of specialized agents with different capabilities
- **Workflow Orchestration**: Declarative workflows with sequential, parallel, pipeline, map-reduce, and dynamic patterns
- **Dynamic Agent Selection**: Intelligent agent selection based on capabilities, performance, cost, and availability
- **Communication Protocol**: Standardized messaging with security, routing, and QoS features
- **Task Delegation & Handoff**: Seamless task transfer between agents with context preservation

### ⚡ Performance Improvements
- Parallel tool execution reduces execution time by 50-70%
- Agent selection in <1ms for up to 100 agents
- Message routing latency <5ms
- Workflow overhead <10ms per step

### 🔧 Technical Improvements
- Tool dependency graph resolution
- Streaming tool results with real-time updates
- Per-tool timeout management
- Workflow checkpointing and recovery
- Circuit breaker patterns for unreliable agents
- Comprehensive error handling and retry logic

### 📦 New Modules
- `src/agents/enhanced-executor.ts` - Enhanced executor with parallel execution
- `src/agents/react-agent.ts` - ReAct agent with reflection
- `src/agents/cot-agent.ts` - Chain of thought reasoning
- `src/agents/tot-agent.ts` - Tree of thoughts exploration
- `src/agents/collaboration/` - Complete multi-agent framework

### 📚 Documentation
- Updated README with advanced agent examples
- Comprehensive examples in `examples/advanced-agents.ts` and `examples/multi-agent-collaboration.ts`
- Phase 2 and Phase 3 architecture summaries
- Complete API documentation with JSDoc

### 🧪 Testing
- All 102 tests passing
- New test coverage for advanced agents and collaboration features
- Integration tests for workflow orchestration

### 🔄 Breaking Changes
- None - Fully backward compatible

### 📊 Bundle Size
- ~40KB increase (4%) for new features
- Optimized imports maintain effective tree-shaking

## [2.7.0] - Previous
- Customer Support Bot with handoff capabilities
- Omnichannel support (Slack, Telegram)
- Honcho Memory integration
- Outcome-based billing and ROI tracking
