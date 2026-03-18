# 数答 (ShuDa) - AI+BI 产品

> 极简数据分析工具，一句话搞定企业数据查询与分析

---

## 一、项目概述

**数答** 是一款基于 AI 的极简数据分析工具，核心定位是：用户用自然语言提问，AI 自动理解需求、生成 SQL、执行查询、生成分析结论，最终交付可落地的业务答案。

### 核心特性

| 特性 | 说明 |
|------|------|
| 🗣️ 自然语言查询 | 用自然语言提问，无需写 SQL |
| 🤖 AI 智能理解 | AI 自动理解业务需求，生成查询语句 |
| 🔗 跨表 JOIN | 自动识别关联关系，生成跨表查询 |
| ⏰ 时间智能 | 支持"最近7天"、"本季度"等时间表达式 |
| 📊 自动可视化 | 自动识别图表类型，动态渲染 |
| 📤 数据导出 | CSV / Excel 导出 |
| 🌙 深色模式 | 支持深色/浅色主题切换 |
| 📱 移动端适配 | 响应式设计，支持移动端访问 |
| 🔐 权限体系 | 三级角色权限控制 |
| 📝 审计日志 | 完整的操作审计追踪 |
| 🔒 登录安全 | 失败锁定，防止暴力破解 |

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| 后端 | Node.js + Express + TypeScript |
| 前端 | Vue 3 + Vite + Element Plus + ECharts |
| 数据库 | MySQL 8.0 |
| 缓存 | Redis (可选) |
| 大模型 | 百度千帆 / OpenAI 兼容 API |
| 部署 | Docker + Nginx |

---

## 二、快速开始

### Docker 部署 (推荐)

```bash
# 克隆项目
git clone https://github.com/zhanglinruo/ai-bi-product.git
cd ai-bi-product

# 配置环境变量
cp .env.example .env

# 启动服务
docker-compose up -d

# 访问
# 前端: http://localhost
# 后端: http://localhost:3000
```

### 本地开发

```bash
# 1. 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 2. 初始化数据库
cd backend
npx ts-node scripts/init-db.ts

# 3. 启动服务
# 后端 (终端 1)
cd backend && npm run dev

# 前端 (终端 2)
cd frontend && npm run dev
```

### 默认账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 管理员 |

---

## 三、功能概览

### ✅ 已完成功能

#### 用户系统
- [x] 用户注册/登录
- [x] JWT 认证
- [x] 角色权限 (user/analyst/admin)
- [x] 登录失败锁定

#### 数据源管理
- [x] 数据源 CRUD
- [x] 连接测试
- [x] 多数据库支持 (MySQL/PostgreSQL/ClickHouse)

#### 查询功能
- [x] 自然语言查询
- [x] 跨表 JOIN 自动识别
- [x] 时间智能 (最近N天/月/年)
- [x] 查询历史
- [x] 收藏查询

#### 导出功能
- [x] CSV 导出
- [x] Excel 导出

#### 可视化
- [x] 自动图表类型识别
- [x] 柱状图/折线图/饼图
- [x] 数据洞察生成

#### 前端体验
- [x] 深色模式
- [x] 响应式布局
- [x] 移动端适配
- [x] 查询建议
- [x] 快捷指令

#### 企业功能
- [x] 权限控制
- [x] 审计日志
- [x] 字段权限表

#### 部署
- [x] Docker 支持
- [x] Nginx 配置

---

## 四、API 文档

详见 [API.md](./API.md)

### 主要接口

| 模块 | 接口 | 说明 |
|------|------|------|
| 认证 | POST /api/users/login | 用户登录 |
| 认证 | POST /api/users/register | 用户注册 |
| 数据源 | GET /api/datasources | 获取数据源列表 |
| 数据源 | POST /api/datasources/test | 测试连接 |
| 查询 | POST /api/agent/query | 自然语言查询 |
| 历史 | GET /api/history | 查询历史 |
| 导出 | POST /api/export/excel | 导出 Excel |
| 审计 | GET /api/audit | 审计日志 (admin) |

---

## 五、权限体系

### 角色

| 角色 | 权限范围 |
|------|----------|
| user | 基础查询、历史、CSV 导出 |
| analyst | + 高级查询、Excel 导出、查看数据源 |
| admin | 全部权限 + 用户管理 + 审计 |

### 权限矩阵

| 权限 | user | analyst | admin |
|------|:----:|:-------:|:-----:|
| query:execute | ✅ | ✅ | ✅ |
| query:advanced | ❌ | ✅ | ✅ |
| export:csv | ✅ | ✅ | ✅ |
| export:excel | ❌ | ✅ | ✅ |
| datasource:create | ❌ | ❌ | ✅ |
| user:manage | ❌ | ❌ | ✅ |
| audit:view | ❌ | ❌ | ✅ |

---

## 六、架构说明

### Agent 架构 (3 层 8 个 Agent)

```
┌─────────────────────────────────────┐
│  第 1 层：理解层                     │
├─────────────────────────────────────┤
│  NLU Agent → 语义理解，提取实体      │
│  Semantic Agent → 术语映射          │
│  Clarification Agent → 澄清问题     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  第 2 层：执行层                     │
├─────────────────────────────────────┤
│  SQL Generator → 生成 SQL           │
│  Validator → 安全校验               │
│  Executor → 执行查询                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  第 3 层：输出层                     │
├─────────────────────────────────────┤
│  Insight Agent → 生成洞察           │
│  Visualization Agent → 图表推荐     │
└─────────────────────────────────────┘
```

### 目录结构

```
backend/
├── src/
│   ├── agents/           # Agent 系统
│   │   ├── understanding/ # 理解层
│   │   ├── execution/     # 执行层
│   │   └── output/        # 输出层
│   ├── middleware/        # 中间件
│   │   ├── auth.ts        # 认证
│   │   └── permission.ts  # 权限
│   ├── modules/           # API 模块
│   └── services/          # 服务
├── scripts/               # 脚本
└── Dockerfile

frontend/
├── src/
│   ├── views/            # 页面
│   ├── components/       # 组件
│   ├── stores/           # 状态管理
│   └── api/              # API 调用
└── Dockerfile
```

---

## 七、环境变量

```bash
# 服务
PORT=3000
NODE_ENV=production

# 数据库
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ai_bi_test

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# 大模型
QIANFAN_API_KEY=your_api_key
QIANFAN_SECRET_KEY=your_secret_key
```

---

## 八、测试示例

登录后在查询页面输入：

```
销售额是多少
按客户类型统计销售额
最近一个月的销售额
零售客户的销售额
销售排行前10
```

---

## 九、相关文档

- [API 文档](./API.md)
- [开发计划](./DEVELOPMENT_PLAN.md)
- [Agent 架构](./backend/AGENT_ARCHITECTURE.md)

---

**版本**: v1.0.0  
**最后更新**: 2026-03-18
