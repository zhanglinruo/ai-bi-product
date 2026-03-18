# 数答 - 产品开发计划

> **目标**: 4 周内完成 MVP 上线，8 周内达到生产可用状态

---

## 📅 总体时间线

```
Week 1-2: MVP 核心功能
Week 3-4: 体验优化 + 部署
Week 5-6: 企业级功能
Week 7-8: 测试 + 优化 + 上线
```

---

## 第 1 周：用户系统 + 数据源管理

### Day 1-2: 用户认证系统

**后端任务**:
- [ ] 用户注册接口 `POST /api/auth/register`
- [ ] 用户登录接口 `POST /api/auth/login`
- [ ] JWT Token 验证中间件
- [ ] 用户信息接口 `GET /api/auth/me`
- [ ] 密码加密存储（bcrypt）

**前端任务**:
- [ ] 登录页面
- [ ] 注册页面
- [ ] 路由守卫（未登录跳转）
- [ ] Token 存储和管理

**数据库**:
```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  role ENUM('user', 'admin') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Day 3-4: 数据源管理

**后端任务**:
- [ ] 数据源 CRUD 接口
- [ ] 数据库连接测试接口
- [ ] 连接池管理
- [ ] Schema 自动发现

**前端任务**:
- [ ] 数据源列表页面
- [ ] 添加数据源表单
- [ ] 编辑/删除数据源
- [ ] 连接测试按钮

**数据库**:
```sql
CREATE TABLE datasources (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('mysql', 'postgresql', 'clickhouse'),
  host VARCHAR(255) NOT NULL,
  port INT,
  database_name VARCHAR(100),
  username VARCHAR(100),
  password_encrypted TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

### Day 5: 查询页面完善

**前端任务**:
- [ ] 查询输入框（支持 Enter 发送）
- [ ] 7 步进度展示
- [ ] SQL 展示卡片
- [ ] 数据表格组件
- [ ] 图表渲染组件
- [ ] 洞察卡片展示
- [ ] 错误提示优化

---

### Day 6-7: Bug 修复 + 测试

- [ ] 端到端测试：注册 → 登录 → 添加数据源 → 查询
- [ ] 修复发现的问题
- [ ] 代码审查

---

## 第 2 周：查询能力增强

### Day 1-2: SQL 生成优化

**核心任务**:
- [ ] 跨表 JOIN 自动识别
- [ ] 时间智能（最近7天、本季度等）
- [ ] 多条件组合查询
- [ ] 子查询支持

**示例优化**:
```
输入: "零售客户最近一个月的销售额"
当前: WHERE customer_type = 'RETAIL' (报错，customer_type 不在 orders 表)
优化: JOIN customers + 时间条件
```

---

### Day 3-4: 查询历史

**后端任务**:
- [ ] 保存查询历史接口
- [ ] 获取历史列表接口
- [ ] 收藏查询功能

**前端任务**:
- [ ] 历史记录侧边栏
- [ ] 点击历史重新执行
- [ ] 收藏标记

**数据库**:
```sql
CREATE TABLE query_history (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  datasource_id VARCHAR(36),
  query_text TEXT NOT NULL,
  sql TEXT,
  result_summary TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Day 5: 数据导出

**任务**:
- [ ] Excel 导出（xlsx 库）
- [ ] CSV 导出
- [ ] 导出按钮 + 进度提示

---

### Day 6-7: 集成测试

- [ ] 各种查询场景测试
- [ ] 边界情况处理
- [ ] 性能测试

---

## 第 3 周：前端体验优化

### Day 1-2: 界面美化

- [ ] 整体 UI 设计优化
- [ ] 深色模式支持
- [ ] 响应式布局
- [ ] 加载动画
- [ ] 空状态设计

---

### Day 3-4: 交互优化

- [ ] 查询建议（历史、热门）
- [ ] 快捷指令面板
- [ ] 键盘快捷键
- [ ] 查询取消功能

---

### Day 5: 移动端适配

- [ ] 响应式查询页
- [ ] 移动端导航
- [ ] 触摸交互优化

---

### Day 6-7: 多轮对话优化

- [ ] 追问上下文优化
- [ ] 对话气泡 UI
- [ ] 上下文清除按钮

---

## 第 4 周：部署 + 监控

### Day 1-2: Docker 部署

**任务**:
- [ ] 编写 Dockerfile（后端）
- [ ] 编写 Dockerfile（前端）
- [ ] docker-compose.yml
- [ ] Nginx 配置
- [ ] HTTPS 配置

---

### Day 3: 云服务器部署

- [ ] 购买云服务器
- [ ] 安装 Docker
- [ ] 部署应用
- [ ] 配置域名
- [ ] SSL 证书

---

### Day 4-5: 监控告警

- [ ] 日志收集（可选 ELK）
- [ ] 接口监控
- [ ] LLM 调用统计
- [ ] 错误告警（邮件/钉钉）

---

### Day 6-7: 压力测试 + 优化

- [ ] 并发测试
- [ ] 慢查询优化
- [ ] 缓存策略
- [ ] 限流配置

---

## 第 5-6 周：企业级功能

### Week 5: 权限体系

- [ ] 角色定义（管理员/分析师/查看者）
- [ ] 数据源权限
- [ ] 字段级权限
- [ ] 行级权限（数据过滤）

---

### Week 6: 审计 + 安全

- [ ] 操作日志记录
- [ ] 敏感字段脱敏
- [ ] SQL 审计
- [ ] 登录安全（失败锁定）

---

## 第 7-8 周：测试 + 上线

### Week 7: 全面测试

- [ ] 单元测试
- [ ] 集成测试
- [ ] 用户测试
- [ ] 性能测试
- [ ] 安全测试

---

### Week 8: 上线准备

- [ ] 文档编写
- [ ] 用户手册
- [ ] API 文档
- [ ] 灰度发布
- [ ] 正式上线

---

## 📊 每周检查点

| 周次 | 里程碑 | 验收标准 |
|------|--------|----------|
| 1 | 用户系统可用 | 注册→登录→添加数据源 |
| 2 | 查询功能完整 | 90% 查询成功率 |
| 3 | 前端体验达标 | 用户满意度 > 80% |
| 4 | 可访问 | 公网可访问、HTTPS |
| 5 | 权限可控 | 不同角色看到不同数据 |
| 6 | 安全合规 | 审计日志完整 |
| 7 | 质量达标 | Bug < 5 个 |
| 8 | 正式上线 | 生产环境运行稳定 |

---

## 🎯 每日工作流程

```
09:00 - 09:30  每日站会，同步进度
09:30 - 12:00  核心开发
14:00 - 17:00  核心开发
17:00 - 18:00  代码审查、测试
18:00 - 18:30  每日总结、更新文档
```

---

## 📝 任务追踪

使用 GitHub Projects 或 Notion 追踪：
- 每个任务一个 Issue
- 看板视图（待办/进行中/完成）
- 每周生成进度报告

---

## ⚠️ 风险提示

| 风险 | 应对策略 |
|------|----------|
| LLM API 不稳定 | 多模型备用、本地缓存 |
| 查询准确率不足 | 持续优化 prompt、增加规则 |
| 性能瓶颈 | 查询缓存、异步处理 |
| 安全漏洞 | 定期审计、渗透测试 |

---

## 💰 预算估算

### 开发阶段（2个月）

| 项目 | 费用 |
|------|------|
| 云服务器（按量） | ¥200 |
| 域名 | ¥100 |
| LLM API 测试 | ¥500 |
| **小计** | **¥800** |

### 运营阶段（每月）

| 项目 | 费用 |
|------|------|
| 云服务器 | ¥200 |
| 数据库 | ¥100 |
| LLM API | ¥500-2000 |
| **小计** | **¥800-2300/月** |

---

**创建时间**: 2026-03-18  
**更新时间**: 2026-03-18
