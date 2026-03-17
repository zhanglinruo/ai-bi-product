# 数答 - 前端功能需求文档 (PRD)

## 1. 产品概述

**产品名称**：数答  
**定位**：AI+BI 智能数据分析助手  
**核心价值**：一句话得到数据答案

---

## 2. 功能需求

### P0 - 核心功能

#### 2.1 智能查询页面（QueryView）

**功能描述**：用户输入自然语言问题，系统自动执行查询并返回结果

**核心流程**：
1. 用户输入问题
2. 显示 7 步执行进度
3. 展示 SQL + 数据 + 洞察 + 图表

**组件需求**：
- 查询输入框（支持示例问题）
- 执行进度组件（7 步 Agent 流程）
- SQL 展示区域（可折叠）
- 数据洞察卡片
- ECharts 图表
- 数据表格

**交互细节**：
- 支持 Ctrl+Enter 快捷查询
- 支持示例问题点击
- 进度实时更新
- SQL 可复制

#### 2.2 数据源管理（DataSourceView）

**功能描述**：管理数据源连接

**功能点**：
- 数据源列表
- 新增/编辑/删除数据源
- 连接测试
- 数据源详情（表结构预览）

#### 2.3 查询历史

**功能描述**：查看和管理查询历史

**功能点**：
- 历史列表（时间倒序）
- 搜索/筛选
- 重新执行
- 分享/导出

### P1 - 重要功能

#### 2.4 语义层配置

**功能描述**：配置业务术语映射

**功能点**：
- 指标管理
- 维度管理
- 业务术语管理
- 规则配置

#### 2.5 用户中心

**功能描述**：用户信息和设置

**功能点**：
- 个人信息
- 权限管理
- 偏好设置
- 主题切换

### P2 - 增强功能

#### 2.6 报表中心

**功能描述**：保存和分享报表

**功能点**：
- 报表收藏
- 报表分享
- 定时报表

#### 2.7 数据看板

**功能描述**：数据概览和监控

**功能点**：
- KPI 卡片
- 趋势图表
- 异常预警

---

## 3. 界面布局

### 3.1 导航结构

```
├── 首页（HomeView）
│   └── 快捷查询 + 历史记录
│
├── 查询（QueryView）
│   └── 智能查询页面
│
├── 数据源（DataSourceView）
│   └── 数据源管理
│
├── 语义层（SemanticView）- 新增
│   └── 语义配置
│
├── 历史（HistoryView）- 新增
│   └── 查询历史
│
└── 设置（SettingsView）- 新增
    └── 用户设置
```

### 3.2 页面布局

**查询页面布局**：
```
┌─────────────────────────────────────┐
│ Header: 数答 | 用户信息 | 设置      │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 查询输入框                       │ │
│ │ [示例: 销售额是多少？]          │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ┌─ 执行进度 ─────────────────────┐  │
│ │ 1.✓ NLU分析  2.✓ 语义匹配...   │  │
│ └───────────────────────────────┘  │
├─────────────────────────────────────┤
│ ┌─ SQL ─────────────────────────┐  │
│ │ SELECT SUM(total_amount)...   │  │
│ └───────────────────────────────┘  │
├─────────────────────────────────────┤
│ ┌─ 数据洞察 ───────────────────┐   │
│ │ 📈 销售总额为 7.15 亿元      │   │
│ └───────────────────────────────┘  │
├─────────────────────────────────────┤
│ ┌─ 图表 ───────────────────────┐   │
│ │ [ECharts 图表区域]            │   │
│ └───────────────────────────────┘  │
├─────────────────────────────────────┤
│ ┌─ 数据表格 ───────────────────┐   │
│ │ 表格数据                       │   │
│ └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## 4. 新增组件

### 4.1 SQL 展示组件

```vue
<!-- SqlDisplay.vue -->
<template>
  <div class="sql-display">
    <div class="sql-header">
      <span>生成的 SQL</span>
      <el-button size="small" @click="copySQL">复制</el-button>
    </div>
    <pre class="sql-code">{{ sql }}</pre>
  </div>
</template>
```

### 4.2 洞察卡片组件

```vue
<!-- InsightCard.vue -->
<template>
  <div class="insight-card">
    <div class="insight-icon">{{ icon }}</div>
    <div class="insight-content">
      <h4>{{ insight.title }}</h4>
      <p>{{ insight.description }}</p>
    </div>
  </div>
</template>
```

### 4.3 进度步骤组件

```vue
<!-- ProgressSteps.vue -->
<template>
  <div class="progress-steps">
    <div v-for="step in steps" class="step-item">
      <div class="step-dot" :class="step.status">
        <span v-if="step.status === 'finish'">✓</span>
      </div>
      <div class="step-content">
        <div class="step-title">{{ step.title }}</div>
        <div class="step-desc">{{ step.description }}</div>
      </div>
    </div>
  </div>
</template>
```

---

## 5. API 对接

### 5.1 已有接口

```typescript
// 查询接口
POST /api/agent/query
{
  query: string,
  datasourceId?: string
}

// 返回
{
  success: boolean,
  data: {
    intent: string,
    sql: string,
    data: [],
    summary: string,
    insights: [],
    chartType: string,
    chartConfig: {}
  }
}
```

### 5.2 需要新增

```typescript
// 数据源列表
GET /api/datasources

// 查询历史
GET /api/query/history

// 语义层配置
GET /api/semantic/config
POST /api/semantic/metrics
POST /api/semantic/dimensions
```

---

## 6. 技术要求

### 6.1 技术栈
- Vue 3 + TypeScript
- Element Plus
- ECharts
- Pinia
- Vue Router

### 6.2 性能要求
- 首屏加载 < 2s
- 查询响应 < 5s
- 图表渲染 < 1s

### 6.3 兼容性
- Chrome 90+
- Safari 14+
- Firefox 88+
- Edge 90+

---

## 7. 开发优先级

| 优先级 | 功能 | 工作量 |
|--------|------|--------|
| P0 | 查询页面优化 | 2 天 |
| P0 | API 对接完善 | 1 天 |
| P1 | 数据源管理 | 1 天 |
| P1 | 查询历史 | 1 天 |
| P2 | 语义层配置 | 2 天 |
| P2 | 用户中心 | 1 天 |

---

**版本**：v1.0  
**更新时间**：2026-03-17
