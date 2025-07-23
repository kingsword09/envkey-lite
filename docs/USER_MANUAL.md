# EnvKey Lite 用户使用手册

## 概述

EnvKey Lite 是一个轻量级的自托管环境变量管理系统，帮助您安全地管理应用程序的配置和敏感信息。

## 主要功能

- 🔐 安全的环境变量存储和加密
- 👥 多用户和权限管理
- 📁 项目和环境组织
- 🔑 API 密钥管理
- 📊 审计日志
- 🌐 Web 界面和 REST API
- 📤 导入/导出功能

## 快速开始

### 1. 访问系统

在浏览器中打开 EnvKey Lite 地址（例如：`http://localhost:3000`）

### 2. 用户注册/登录

首次使用需要注册账户：

1. 点击"注册"按钮
2. 填写邮箱、姓名和密码
3. 点击"创建账户"

已有账户的用户直接登录：

1. 输入邮箱和密码
2. 点击"登录"

## 项目管理

### 创建项目

1. 登录后点击"新建项目"
2. 输入项目名称和描述
3. 点击"创建"

### 项目设置

在项目页面可以：

- 编辑项目信息
- 管理项目成员
- 设置权限
- 删除项目

### 权限角色

- **所有者（Owner）**：完全控制权限
- **管理员（Admin）**：管理项目和成员
- **编辑者（Editor）**：编辑环境变量
- **查看者（Viewer）**：只读访问

## 环境管理

### 创建环境

1. 在项目页面点击"新建环境"
2. 输入环境名称（如：development, staging, production）
3. 点击"创建"

### 环境变量操作

#### 添加变量

1. 进入环境页面
2. 点击"添加变量"
3. 输入变量名和值
4. 选择是否为敏感信息
5. 添加描述（可选）
6. 点击"保存"

#### 编辑变量

1. 点击变量行的编辑按钮
2. 修改值或设置
3. 点击"保存"

#### 删除变量

1. 点击变量行的删除按钮
2. 确认删除操作

#### 批量操作

1. 选择多个变量
2. 使用批量操作按钮：
   - 批量删除
   - 批量导出
   - 批量编辑

## API 密钥管理

### 创建 API 密钥

1. 进入"设置" > "API 密钥"
2. 点击"新建 API 密钥"
3. 输入密钥名称
4. 点击"创建"
5. **重要**：复制并保存密钥，它只会显示一次

### 使用 API 密钥

在应用程序中使用 API 密钥获取环境变量：

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/client/environment-id
```

### 管理 API 密钥

- 查看密钥列表和使用情况
- 删除不需要的密钥
- 定期轮换密钥

## 导入/导出功能

### 导出环境变量

1. 进入环境页面
2. 点击"导出"按钮
3. 选择格式：
   - `.env` 文件格式
   - JSON 格式
   - YAML 格式
4. 下载文件

### 导入环境变量

1. 进入环境页面
2. 点击"导入"按钮
3. 选择文件格式
4. 上传文件或粘贴内容
5. 预览变量
6. 确认导入

### 支持的格式

#### .env 格式
```
DATABASE_URL=postgresql://localhost:5432/mydb
API_PORT=3000
NODE_ENV=production
```

#### JSON 格式
```json
{
  "DATABASE_URL": "postgresql://localhost:5432/mydb",
  "API_PORT": "3000",
  "NODE_ENV": "production"
}
```

#### YAML 格式
```yaml
DATABASE_URL: postgresql://localhost:5432/mydb
API_PORT: "3000"
NODE_ENV: production
```

## 搜索和过滤

### 搜索变量

1. 使用搜索框输入关键词
2. 支持按变量名搜索
3. 支持按值搜索（非敏感变量）

### 过滤功能

- 按前缀过滤
- 按敏感性过滤
- 按创建时间过滤

## 审计日志

### 查看审计日志

1. 进入"审计日志"页面
2. 查看所有操作记录：
   - 用户登录/登出
   - 变量创建/修改/删除
   - 项目操作
   - API 访问

### 过滤日志

- 按用户过滤
- 按操作类型过滤
- 按时间范围过滤
- 按资源类型过滤

## 客户端集成

### 命令行工具

使用 curl 获取环境变量：

```bash
# 获取所有变量
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/client/env-id

# 在脚本中使用
eval $(curl -s -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/client/env-id | \
  jq -r '.variables | to_entries[] | "export \(.key)=\(.value)"')
```

### Node.js 集成

```javascript
const fetch = require('node-fetch');

async function loadEnvVars(apiKey, envId) {
  const response = await fetch(`http://localhost:3000/api/client/${envId}`, {
    headers: {
      'X-API-Key': apiKey
    }
  });
  
  const data = await response.json();
  
  // 设置环境变量
  Object.assign(process.env, data.variables);
}

// 使用
loadEnvVars('your-api-key', 'env-id');
```

### Python 集成

```python
import requests
import os

def load_env_vars(api_key, env_id):
    response = requests.get(
        f'http://localhost:3000/api/client/{env_id}',
        headers={'X-API-Key': api_key}
    )
    
    data = response.json()
    
    # 设置环境变量
    for key, value in data['variables'].items():
        os.environ[key] = value

# 使用
load_env_vars('your-api-key', 'env-id')
```

## 安全最佳实践

### 密码安全

- 使用强密码（至少 8 位，包含大小写字母、数字和特殊字符）
- 定期更换密码
- 不要共享账户

### API 密钥安全

- 定期轮换 API 密钥
- 为不同环境使用不同的密钥
- 不要在代码中硬编码密钥
- 限制密钥的访问权限

### 敏感信息管理

- 将敏感信息标记为"敏感"
- 定期审查敏感变量的访问
- 使用最小权限原则

### 访问控制

- 定期审查用户权限
- 及时移除不需要的用户
- 使用适当的角色分配

## 故障排除

### 常见问题

#### 无法登录

1. 检查邮箱和密码是否正确
2. 确认账户是否已激活
3. 检查网络连接

#### API 密钥不工作

1. 确认密钥格式正确
2. 检查密钥是否已过期或被删除
3. 验证请求头格式

#### 环境变量未更新

1. 检查是否有编辑权限
2. 确认保存操作是否成功
3. 刷新页面重试

#### 导入失败

1. 检查文件格式是否正确
2. 确认文件编码为 UTF-8
3. 检查变量名是否符合规范

### 获取帮助

1. 查看错误消息和日志
2. 检查网络连接
3. 联系系统管理员
4. 查看 GitHub 文档

## 高级功能

### 变量模板

使用变量引用其他变量：

```
BASE_URL=https://api.example.com
API_ENDPOINT=${BASE_URL}/v1
DATABASE_URL=${BASE_URL}/db
```

### 环境继承

设置环境变量的继承关系，子环境可以继承父环境的变量。

### 批量操作

- 批量导入多个环境
- 批量复制变量到其他环境
- 批量更新变量值

### 版本控制

- 查看变量的修改历史
- 回滚到之前的版本
- 比较不同版本的差异

## 性能优化

### 缓存策略

- 客户端缓存环境变量
- 设置合适的缓存过期时间
- 使用条件请求减少网络传输

### 批量请求

- 一次请求获取多个环境的变量
- 使用批量 API 减少请求次数

## 监控和告警

### 使用监控

- 监控 API 响应时间
- 跟踪错误率
- 监控存储使用情况

### 设置告警

- API 密钥异常使用告警
- 敏感变量访问告警
- 系统错误告警

## 备份和恢复

### 定期备份

- 导出所有项目和环境变量
- 备份用户和权限设置
- 保存审计日志

### 恢复数据

- 从备份文件恢复数据
- 验证数据完整性
- 测试系统功能

## 更新和维护

### 系统更新

- 定期检查更新
- 阅读更新日志
- 测试新功能

### 数据清理

- 清理过期的审计日志
- 删除未使用的项目和环境
- 整理变量和描述

这个用户手册涵盖了 EnvKey Lite 的主要功能和使用方法。如果您需要更多帮助，请参考 API 文档或联系技术支持。