# 向量嵌入语义检索方案

> 创建时间: 2026-03-18  
> 状态: 实现中

---

## 一、方案概述

### 最终方案

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| **Embedding 模型** | bge-small-zh-v1.5 (本地) | 133MB，中文优化 |
| **向量库** | 内存 VectorStore | 纯 JS，启动加载 |
| **语义存储** | MySQL + VectorStore 双写 | CRUD + 检索两不误 |

### 优势

| 优势 | 说明 |
|------|------|
| 🚫 **无外部依赖** | 不需要 API Key |
| 💰 **零费用** | 无 API 调用成本 |
| 🔒 **数据隐私** | 数据不出服务器 |
| ⚡ **低延迟** | 本地推理，毫秒级 |
| 📦 **一键部署** | Docker 自带模型 |

---

## 二、存储策略（双写）

### 架构

```
┌─────────────────────────────────────────────────────┐
│                     MySQL                            │
│  semantic_metrics / semantic_dimensions             │
│  - 完整的语义配置（CRUD 操作）                        │
│  - 支持复杂查询                                      │
└─────────────────────────────────────────────────────┘
                        ↓ 实时同步
┌─────────────────────────────────────────────────────┐
│                  Vector Store                        │
│  - id: "metric_123"                                  │
│  - vector: [0.1, 0.2, ...]                          │
│  - metadata: { type, dbField, dbTable }             │
└─────────────────────────────────────────────────────┘
```

### 同步流程

```typescript
// 新增语义配置时自动双写
async function addMetric(metric: SemanticMetric) {
  // 1. 写 MySQL
  await db.insert('semantic_metrics', metric);
  
  // 2. 生成向量
  const text = metric.name + ' ' + metric.aliases.join(' ');
  const vector = await localEmbedder(text);
  
  // 3. 写向量库
  await vectorStore.add({
    id: `metric_${metric.id}`,
    vector,
    metadata: { type: 'metric', ...metric }
  });
}
```

---

## 三、本地模型实现

### 依赖安装

```bash
npm install @xenova/transformers
```

### Embedding 服务

```typescript
import { pipeline } from '@xenova/transformers';

class LocalEmbeddingService {
  private embedder: any = null;
  
  async initialize() {
    // 首次运行自动下载模型（133MB）
    this.embedder = await pipeline(
      'feature-extraction',
      'Xenova/bge-small-zh-v1.5',
      { cache_dir: './models' }
    );
  }
  
  async embed(text: string): Promise<number[]> {
    const output = await this.embedder(text);
    return Array.from(output.data);
  }
}
```

---

## 四、完整架构

### 混合检索策略

```
用户查询
    ↓
┌─────────────────────────────────────┐
│  1. 精确匹配（毫秒级）               │
│     - 销售额、订单数等高频词         │
│     - 直接命中，无需向量             │
└─────────────────────────────────────┘
    ↓ 未命中
┌─────────────────────────────────────┐
│  2. 向量检索（~50ms）                │
│     - 本地模型生成向量               │
│     - 余弦相似度搜索                 │
│     - 返回 Top-K 候选               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  3. 阈值过滤                         │
│     - 指标: > 0.75                   │
│     - 维度: > 0.70                   │
│     - 术语: > 0.65                   │
└─────────────────────────────────────┘
    ↓
返回结果
```

---

## 五、实施步骤

### Phase 1: 本地模型集成
- [ ] 安装 @xenova/transformers
- [ ] 实现 LocalEmbeddingService
- [ ] 测试本地向量化

### Phase 2: 双写同步
- [ ] 更新语义配置 API
- [ ] 自动同步向量索引
- [ ] 删除/更新时同步

### Phase 3: 测试验证
- [ ] 准确率测试
- [ ] 性能测试
- [ ] 边界情况

---

## 六、依赖安装

```bash
# 本地 Embedding
npm install @xenova/transformers

# 首次运行会自动下载模型（133MB）
```

---

## 七、预期效果

| 指标 | 当前（规则） | 升级后（本地向量） |
|------|-------------|-------------------|
| 准确率 | 85% | 95%+ |
| 覆盖率 | 60% | 90%+ |
| 响应时间 | <10ms | <100ms |
| 外部依赖 | 无 | 无 |
| 费用 | 0 | 0 |

---

**文档状态**: 实现中  
**预计完成**: 2026-03-19
