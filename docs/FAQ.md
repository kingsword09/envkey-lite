# EnvKey Lite 常见问题解答 (FAQ)

## 一般问题

### Q: EnvKey Lite 是什么？

A: EnvKey Lite 是一个轻量级的自托管环境变量管理系统，帮助开发团队安全地管理应用程序的配置信息和敏感数据。它提供了 Web 界面和 REST API，支持多用户、权限管理、审计日志等功能。

### Q: EnvKey Lite 与其他环境变量管理工具有什么区别？

A: EnvKey Lite 的主要特点：
- **自托管**：完全控制您的数据，无需依赖第三方服务
- **轻量级**：最小化的依赖和资源占用
- **简单易用**：直观的 Web 界面和简洁的 API
- **开源免费**：MIT 许可证，完全免费使用
- **安全可靠**：内置加密和安全最佳实践

### Q: 支持哪些操作系统？

A: EnvKey Lite 支持所有主流操作系统：
- Linux（推荐用于生产环境）
- macOS
- Windows
- Docker 容器

## 安装和部署

### Q: 最低系统要求是什么？

A: 
- Node.js 18.0.0 或更高版本
- 至少 512MB RAM
- 至少 1GB 可用磁盘空间
- 网络连接（用于安装依赖）

### Q: 如何在生产环境中部署？

A: 推荐的生产部署方式：
1. **Docker Compose**（最简单）
2. **PM2 + Nginx**（传统方式）
3. **Kubernetes**（大规模部署）
4. **systemd 服务**（Linux 系统服务）

详细步骤请参考 [安装指南](INSTALLATION.md)。

### Q: 支持集群部署吗？

A: 是的，EnvKey Lite 支持多实例部署：
- 使用 PM2 的集群模式
- 通过负载均衡器分发请求
- 共享数据库存储

### Q: 如何配置 HTTPS？

A: 有两种方式配置 HTTPS：
1. **应用层 HTTPS**：配置 SSL 证书路径
2. **反向代理 HTTPS**：通过 Nginx/Apache 配置（推荐）

```env
# 应用层 HTTPS
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

## 功能和使用

### Q: 如何创建第一个管理员用户？

A: 使用命令行工具创建管理员：

```bash
npm run create-admin
```

或者在首次启动时，第一个注册的用户会自动成为管理员。

### Q: 支持哪些环境变量格式？

A: 支持多种格式的导入/导出：
- **.env 格式**：`KEY=value`
- **JSON 格式**：`{"KEY": "value"}`
- **YAML 格式**：`KEY: value`

### Q: 如何在应用程序中使用环境变量？

A: 有多种方式集成：

**使用 API 密钥**：
```bash
curl -H "X-API-Key: your-key" http://localhost:3000/api/client/env-id
```

**Node.js 示例**：
```javascript
const response = await fetch(`${baseUrl}/api/client/${envId}`, {
  headers: { 'X-API-Key': apiKey }
});
const { variables } = await response.json();
Object.assign(process.env, variables);
```

### Q: 敏感信息是如何加密的？

A: EnvKey Lite 使用多层加密保护敏感信息：
- **传输加密**：HTTPS/TLS
- **存储加密**：AES-256 加密敏感变量
- **密钥管理**：安全的密钥派生和存储

### Q: 支持变量引用吗？

A: 目前不支持变量引用（如 `${OTHER_VAR}`），但这个功能在开发计划中。

## 权限和安全

### Q: 有哪些用户角色？

A: 系统支持以下角色：
- **系统管理员**：全局管理权限
- **项目所有者**：项目完全控制权
- **项目管理员**：项目管理权限
- **编辑者**：编辑环境变量
- **查看者**：只读访问

### Q: 如何管理 API 密钥？

A: API 密钥管理最佳实践：
- 为每个应用/环境创建独立的密钥
- 定期轮换密钥
- 监控密钥使用情况
- 及时删除不需要的密钥

### Q: 审计日志记录哪些操作？

A: 审计日志记录所有重要操作：
- 用户登录/登出
- 环境变量的增删改
- 项目和环境管理
- API 密钥操作
- 权限变更

## 故障排除

### Q: 忘记管理员密码怎么办？

A: 可以通过命令行重置：

```bash
# 重置特定用户密码
npm run manage reset-password user@example.com

# 或创建新的管理员用户
npm run create-admin
```

### Q: API 请求返回 401 错误？

A: 检查以下几点：
1. JWT token 是否有效且未过期
2. API 密钥格式是否正确
3. 请求头是否正确设置
4. 用户是否有相应权限

### Q: 导入环境变量失败？

A: 常见原因和解决方法：
1. **文件格式错误**：确保使用支持的格式
2. **编码问题**：使用 UTF-8 编码
3. **变量名不规范**：避免特殊字符和空格
4. **权限不足**：确保有编辑权限

### Q: 应用启动失败？

A: 检查以下配置：
1. **端口冲突**：确保端口未被占用
2. **环境变量**：检查必需的环境变量
3. **数据库**：确保数据目录可写
4. **依赖**：运行 `npm install` 安装依赖

### Q: 性能问题如何优化？

A: 性能优化建议：
1. **启用集群模式**：使用 PM2 集群
2. **配置缓存**：客户端缓存环境变量
3. **数据库优化**：定期清理审计日志
4. **网络优化**：使用 CDN 和压缩

## 数据管理

### Q: 如何备份数据？

A: 数据备份方法：

```bash
# 备份数据目录
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# 导出所有环境变量
curl -H "Authorization: Bearer token" \
  http://localhost:3000/api/environments/export-all
```

### Q: 如何迁移到新服务器？

A: 迁移步骤：
1. 备份原服务器数据
2. 在新服务器安装 EnvKey Lite
3. 复制数据目录
4. 更新配置文件
5. 启动服务并验证

### Q: 数据存储在哪里？

A: 数据存储位置：
- **默认位置**：`./data` 目录
- **自定义位置**：通过 `DATABASE_DIR` 环境变量配置
- **存储内容**：用户数据、项目信息、环境变量、审计日志

## 集成和开发

### Q: 有官方的 SDK 吗？

A: 目前提供 REST API，官方 SDK 正在开发中。您可以使用任何 HTTP 客户端库集成。

### Q: 支持 Webhook 吗？

A: Webhook 功能在开发计划中，将支持：
- 环境变量变更通知
- 用户操作通知
- 系统事件通知

### Q: 如何扩展功能？

A: EnvKey Lite 是开源项目，您可以：
- Fork 项目并添加功能
- 提交 Pull Request
- 创建插件（计划中）
- 使用 API 构建自定义工具

### Q: 支持单点登录 (SSO) 吗？

A: SSO 功能在开发计划中，将支持：
- SAML 2.0
- OAuth 2.0
- LDAP/Active Directory

## 许可和支持

### Q: EnvKey Lite 的许可证是什么？

A: EnvKey Lite 使用 MIT 许可证，这意味着：
- 完全免费使用
- 可以商业使用
- 可以修改和分发
- 无使用限制

### Q: 如何获得技术支持？

A: 获得支持的方式：
1. **文档**：查看用户手册和 API 文档
2. **GitHub Issues**：报告 bug 和功能请求
3. **社区论坛**：与其他用户交流
4. **邮件支持**：联系开发团队

### Q: 如何贡献代码？

A: 欢迎贡献：
1. Fork GitHub 仓库
2. 创建功能分支
3. 提交代码和测试
4. 创建 Pull Request
5. 参与代码审查

### Q: 有商业支持吗？

A: 目前主要提供社区支持，商业支持服务正在规划中。

## 版本和更新

### Q: 如何检查当前版本？

A: 检查版本的方法：
```bash
# 命令行
npm run --version

# API 接口
curl http://localhost:3000/api

# Web 界面
查看页面底部的版本信息
```

### Q: 如何更新到最新版本？

A: 更新步骤：
1. 备份数据
2. 拉取最新代码：`git pull`
3. 安装依赖：`npm install`
4. 构建应用：`npm run build`
5. 重启服务

### Q: 更新会影响现有数据吗？

A: 通常不会，但建议：
- 更新前备份数据
- 查看更新日志
- 在测试环境先验证
- 必要时运行数据迁移

## 其他问题

### Q: 可以在内网环境使用吗？

A: 是的，EnvKey Lite 完全支持内网部署：
- 无需外网连接运行
- 支持私有网络
- 可配置内网域名

### Q: 支持多语言吗？

A: 目前主要支持中文和英文，多语言支持在开发计划中。

### Q: 有移动端应用吗？

A: 目前没有专门的移动应用，但 Web 界面支持响应式设计，可以在移动设备上使用。

### Q: 如何报告安全问题？

A: 如果发现安全漏洞，请：
1. 不要公开披露
2. 发送邮件到安全团队
3. 提供详细的漏洞信息
4. 等待安全修复发布

---

如果您的问题没有在这里找到答案，请：
- 查看 [用户手册](USER_MANUAL.md)
- 查看 [安装指南](INSTALLATION.md)
- 在 GitHub 上创建 Issue
- 联系技术支持团队