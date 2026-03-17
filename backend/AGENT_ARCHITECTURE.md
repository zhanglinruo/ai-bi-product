# Agent 架构设计文档

## 概述

本文档描述了 ai-bi-product 项目的 Agent 化改造，将原有的单一 AI 引擎拆分为 **3 层 8 个专业 Agent**，实现更灵活、更高效的 AI 查询处理。

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│              第 1 层：理解层 (Understanding)          │
├─────────────────────────────────────────────────────┤
│  NLU Agent → Semantic Agent → Clarification Agent  │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│              第 2 层：执行层 (Execution)              │
├─────────────────────────────────────────────────────┤
│  SQL Generator → Validator → Executor              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│              第 3 层：输出层 (Output)                 │
├─────────────────────────────────────────────────────┤
│  Insight Agent → Visualization Agent               │
└─────────────────────────────────────────────────────┘
```

## Agent 清单

### 第 1 层：理解层

| Agent | 职责 | 输入 | 输出 | 模型 |
|-------|------|------|------|------|
| **NLU Agent** | 理解用户意图，提取实体 | 用户查询 | 意图 + 实体 | qwen-turbo |
| **Semantic Agent** | 术语映射到数据库字段 | 实体 | 字段映射 | 无需 LLM |
| **Clarification Agent** | 生成澄清问题 | NLU 结果 + 语义结果 | 澄清问题 | qwen-turbo |

### 第 2 层：执行层

| Agent | 职责 | 输入 | 输出 | 模型 |
|-------|------|------|------|------|
| **SQL Generator** | 生成 SQL 查询 | 意图 + 字段映射 | SQL | qwen-plus |
| **Validator** | 校验 SQL 安全性 | SQL | 校验结果 | 无需 LLM |
| **Executor** | 执行查询 | SQL | 数据结果 | 无需 LLM |

### 第 3 层：输出层

| Agent | 职责 | 输入 | 输出 | 模型 |
|-------|------|------|------|------|
| **Insight Agent** | 分析数据，发现洞察 | 数据 + 查询 | 洞察报告 | qwen-plus |
| **Visualization Agent** | 推荐图表类型 | 数据 + 洞察 | ECharts 配置 | 无需 LLM |

## 目录结构

```
backend/src/
├── agents/                      # Agent 实现
│   ├── types.ts                 # 类型定义
│   ├── base.ts                  # 基类
│   ├── index.ts                 # 导出
│   │
│   ├── understanding/           # 理解层
│   │   ├── nlu-agent.ts
│   │   ├── semantic-agent.ts
│   │   └── clarification-agent.ts
│   │
│   ├── execution/               # 执行层
│   │   ├── sql-generator-agent.ts
│   │   ├── validator-agent.ts
│   │   └── executor-agent.ts
│   │
│   └── output/                  # 输出层
│       ├── insight-agent.ts
│       └── visualization-agent.ts
│
├── orchestrator/                # 调度器
│   └── index.ts                 # 主调度器
│
└── modules/
    └── agent/
        └── routes.ts            # API 路由
```

## 使用方式

### 1. 初始化 Orchestrator

```typescript
import { initOrchestrator } from './modules/agent/routes';

// 在应用启动时
initOrchestrator({
  llmClient: yourLLMClient,
  dbPool: yourDBPool,
  semanticConfig: yourSemanticConfig,
});
```

### 2. 调用 API

```bash
# 执行查询
POST /api/agent/query
{
  "query": "华东地区上季度销售额是多少？",
  "datasourceId": "ds_001"
}

# 响应
{
  "success": true,
  "data": {
    "intent": "query",
    "sql": "SELECT SUM(sales_amount) FROM sales WHERE region = '华东' AND quarter = 'Q4'",
    "data": [...],
    "summary": "华东地区上季度销售额为 1250 万元",
    "insights": [...],
    "chartType": "bar",
    "chartConfig": {...}
  }
}
```

### 3. 分步执行（调试用）

```bash
POST /api/agent/query/steps
{
  "query": "华东地区上季度销售额是多少？"
}

# 响应
{
  "success": true,
  "steps": [
    { "agentName": "nlu-agent", "status": "success", "output": {...} },
    { "agentName": "semantic-agent", "status": "success", "output": {...} },
    ...
  ]
}
```

## 核心特性

### 1. 自动重试

每个 Agent 都支持自动重试：
- 默认最多重试 3 次
- 支持指数退避
- 可自定义重试逻辑

### 2. 降级处理

Agent 失败时可以降级：
- NLU Agent 降级 → 关键词匹配
- SQL Generator 降级 → 简化 prompt
- 其他 Agent → 返回默认值

### 3. 缓存支持

结果可缓存，避免重复计算：
- 基于输入 hash 缓存
- 可配置缓存时间

### 4. 模型成本优化

不同 Agent 用不同模型：
- 理解层：qwen-turbo（便宜）
- SQL 生成：qwen-plus（强）
- 校验/执行：无需 LLM（免费）

预估节省 **40-60%** 的 API 成本。

## 扩展方式

### 添加新 Agent

```typescript
// 1. 创建 Agent 文件
// agents/custom/my-agent.ts

import { LLMAgent, LLMClient } from '../base';
import { AgentDefinition } from '../types';

export class MyAgent extends LLMAgent<MyInput, MyOutput> {
  definition: AgentDefinition = {
    name: 'my-agent',
    description: '我的自定义 Agent',
    version: '1.0.0',
    layer: 'execution',
    // ...
  };
  
  protected async run(input: MyInput, context: AgentContext): Promise<MyOutput> {
    // 实现逻辑
  }
}

// 2. 注册到 Orchestrator
orchestrator.register('my-agent', new MyAgent(llmClient));
```

### 自定义工作流

```typescript
// 创建自定义工作流
const state = orchestrator.createWorkflowState(query, context);

// 按需执行步骤
while (state.status !== 'completed' && state.status !== 'failed') {
  await orchestrator.executeStep(state);
  
  // 可以在这里干预流程
  if (state.nodes[state.currentNode - 1].status === 'success') {
    // 检查输出，决定是否跳过下一步
    if (shouldSkipNext) {
      state.nodes[state.currentNode].status = 'skipped';
      state.currentNode++;
    }
  }
}
```

## 与原架构对比

| 维度 | 原架构 | Agent 架构 |
|------|--------|-----------|
| AI 引擎 | 单一引擎 | 8 个专业 Agent |
| 灵活性 | 硬编码流程 | 可插拔 Agent |
| 成本 | 全流程用强模型 | 按需选模型 |
| 可调试性 | 黑盒 | 分步可见 |
| 扩展性 | 改代码 | 添加 Agent |

## 下一步

1. ✅ 基础 Agent 架构已完成
2. 🔲 集成到现有数据库连接
3. 🔲 完善语义层配置
4. 🔲 添加单元测试
5. 🔲 性能优化

---

**版本**: v1.0.0  
**创建时间**: 2026-03-17  
**作者**: OpenClaw Agent Team
