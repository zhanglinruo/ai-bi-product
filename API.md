# 数答 API 文档

> 版本: 1.0.0  
> 基础 URL: http://localhost:3000/api

---

## 目录

1. [认证](#认证)
2. [用户](#用户)
3. [数据源](#数据源)
4. [查询](#查询)
5. [历史](#历史)
6. [导出](#导出)
7. [审计](#审计)

---

## 认证

所有需要认证的接口都需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

---

## 用户

### 注册

```
POST /api/users/register
```

**请求体**:
```json
{
  "username": "string",
  "password": "string",
  "email": "string (可选)"
}
```

**响应**:
```json
{
  "success": true,
  "message": "用户注册成功",
  "data": {
    "id": "uuid",
    "username": "string",
    "role": "user"
  }
}
```

### 登录

```
POST /api/users/login
```

**请求体**:
```json
{
  "username": "string",
  "password": "string"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "role": "user|analyst|admin"
    }
  }
}
```

### 获取用户信息

```
GET /api/users/profile
```

**需要认证**: ✅

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "string",
    "status": "active|disabled|locked",
    "created_at": "timestamp"
  }
}
```

---

## 数据源

### 获取数据源列表

```
GET /api/datasources
```

**需要认证**: ✅

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "type": "mysql|postgresql|clickhouse",
      "host": "string",
      "port": 3306,
      "database_name": "string",
      "status": "active|inactive"
    }
  ]
}
```

### 创建数据源

```
POST /api/datasources
```

**需要认证**: ✅  
**需要权限**: admin 或 datasource:create

**请求体**:
```json
{
  "name": "string",
  "type": "mysql",
  "host": "string",
  "port": 3306,
  "database_name": "string",
  "username": "string",
  "password": "string"
}
```

### 测试连接

```
POST /api/datasources/test
```

**需要认证**: ✅

**请求体**:
```json
{
  "type": "mysql",
  "host": "string",
  "port": 3306,
  "database_name": "string",
  "username": "string",
  "password": "string"
}
```

---

## 查询

### Agent 架构查询

```
POST /api/agent/query
```

**需要认证**: ✅

**请求体**:
```json
{
  "query": "string (自然语言问题)",
  "datasourceId": "string (可选)"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "intent": "query|comparison|trend|analysis",
    "sql": "SELECT ...",
    "sqlExplanation": "string",
    "data": [...],
    "rowCount": 10,
    "chartType": "bar|line|pie|table",
    "chartConfig": {...},
    "insights": [
      {
        "type": "comparison|trend",
        "title": "string",
        "description": "string",
        "importance": "high|medium|low"
      }
    ]
  },
  "executionTime": 500
}
```

---

## 历史

### 获取查询历史

```
GET /api/history?limit=20&offset=0
```

**需要认证**: ✅

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "query_text": "string",
      "sql": "string",
      "result_summary": "string",
      "row_count": 10,
      "execution_time": 500,
      "is_favorite": false,
      "created_at": "timestamp"
    }
  ],
  "total": 100
}
```

### 保存查询历史

```
POST /api/history
```

**需要认证**: ✅

**请求体**:
```json
{
  "query_text": "string",
  "sql": "string",
  "result_summary": "string",
  "row_count": 10,
  "execution_time": 500
}
```

---

## 导出

### 导出 CSV

```
POST /api/export/csv
```

**需要认证**: ✅

**请求体**:
```json
{
  "data": [...],
  "filename": "export"
}
```

**响应**: CSV 文件下载

### 导出 Excel

```
POST /api/export/excel
```

**需要认证**: ✅

**请求体**:
```json
{
  "data": [...],
  "filename": "export",
  "sheetName": "Sheet1"
}
```

**响应**: Excel 文件下载

---

## 审计

### 获取审计日志

```
GET /api/audit?userId=&action=&startTime=&endTime=&limit=100
```

**需要认证**: ✅  
**需要权限**: admin

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "username": "string",
      "action": "login.success",
      "resource_type": "user",
      "resource_id": "uuid",
      "details": {...},
      "ip_address": "string",
      "created_at": "timestamp"
    }
  ]
}
```

### 获取用户活动统计

```
GET /api/audit/my-stats?days=7
```

**需要认证**: ✅

### 获取系统活动概览

```
GET /api/audit/overview?days=7
```

**需要认证**: ✅  
**需要权限**: admin

---

## 错误响应

所有错误响应格式：

```json
{
  "success": false,
  "message": "错误描述"
}
```

**HTTP 状态码**:
- 400: 请求参数错误
- 401: 未认证
- 403: 权限不足
- 404: 资源不存在
- 500: 服务器内部错误

---

## 角色权限矩阵

| 权限 | user | analyst | admin |
|------|------|---------|-------|
| query:execute | ✅ | ✅ | ✅ |
| query:advanced | ❌ | ✅ | ✅ |
| history:* | 自己 | 自己 | 全部 |
| export:csv | ✅ | ✅ | ✅ |
| export:excel | ❌ | ✅ | ✅ |
| datasource:create | ❌ | ❌ | ✅ |
| user:manage | ❌ | ❌ | ✅ |
| audit:view | ❌ | ❌ | ✅ |
