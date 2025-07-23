# EnvKey Lite 安装和部署指南

## 系统要求

- Node.js 18.0.0 或更高版本
- npm 或 yarn 包管理器
- 至少 512MB RAM
- 至少 1GB 可用磁盘空间

## 快速开始

### 1. 下载和安装

```bash
# 克隆仓库
git clone https://github.com/your-org/envkey-lite.git
cd envkey-lite

# 安装依赖
npm install

# 构建应用
npm run build
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```env
# 基本配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT 密钥（必须设置）
JWT_SECRET=your-super-secret-jwt-key-here

# 数据库配置
DATABASE_DIR=./data

# 安全配置
SECURITY_HEADERS_ENABLED=true
CORS_ORIGIN=*
```

### 3. 初始化数据库

```bash
# 初始化数据库
npm run init

# 创建管理员用户
npm run create-admin
```

### 4. 启动应用

```bash
# 生产环境启动
npm run start:prod

# 或开发环境启动
npm run dev
```

应用将在 `http://localhost:3000` 启动。

## Docker 部署

### 使用 Docker Compose（推荐）

1. 创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  envkey-lite:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=your-super-secret-jwt-key-here
      - DATABASE_DIR=/app/data
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

2. 启动服务：

```bash
docker-compose up -d
```

### 使用 Docker

```bash
# 构建镜像
docker build -t envkey-lite .

# 运行容器
docker run -d \
  --name envkey-lite \
  -p 3000:3000 \
  -e JWT_SECRET=your-super-secret-jwt-key-here \
  -v $(pwd)/data:/app/data \
  envkey-lite
```

## 生产环境部署

### 使用 PM2

1. 安装 PM2：

```bash
npm install -g pm2
```

2. 创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'envkey-lite',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      JWT_SECRET: 'your-super-secret-jwt-key-here'
    }
  }]
}
```

3. 启动应用：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 使用 systemd

1. 创建服务文件 `/etc/systemd/system/envkey-lite.service`：

```ini
[Unit]
Description=EnvKey Lite
After=network.target

[Service]
Type=simple
User=envkey
WorkingDirectory=/opt/envkey-lite
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=JWT_SECRET=your-super-secret-jwt-key-here

[Install]
WantedBy=multi-user.target
```

2. 启用和启动服务：

```bash
sudo systemctl enable envkey-lite
sudo systemctl start envkey-lite
sudo systemctl status envkey-lite
```

## 反向代理配置

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Apache

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    ProxyPassReverse / http://localhost:3000/
    ProxyPassReverseMatch ^/(.*) http://localhost:3000/$1
</VirtualHost>
```

## HTTPS 配置

### 使用 Let's Encrypt

1. 安装 Certbot：

```bash
sudo apt install certbot python3-certbot-nginx
```

2. 获取证书：

```bash
sudo certbot --nginx -d your-domain.com
```

3. 配置 EnvKey Lite 使用 HTTPS：

```env
HTTPS_ENABLED=true
HTTPS_PORT=3443
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
FORCE_HTTPS=true
```

## 环境变量配置

### 必需配置

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `JWT_SECRET` | JWT 令牌签名密钥 | 无（必须设置） |
| `NODE_ENV` | 运行环境 | `development` |

### 可选配置

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `PORT` | HTTP 端口 | `3000` |
| `HOST` | 绑定主机 | `localhost` |
| `DATABASE_DIR` | 数据库目录 | `./data` |
| `CORS_ORIGIN` | CORS 允许的源 | `*` |
| `SECURITY_HEADERS_ENABLED` | 启用安全头 | `true` |
| `HTTPS_ENABLED` | 启用 HTTPS | `false` |
| `HTTPS_PORT` | HTTPS 端口 | `3443` |
| `FORCE_HTTPS` | 强制 HTTPS 重定向 | `false` |

## 数据备份

### 自动备份

创建备份脚本 `backup.sh`：

```bash
#!/bin/bash

BACKUP_DIR="/backup/envkey-lite"
DATA_DIR="./data"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
tar -czf "$BACKUP_DIR/envkey-lite-$DATE.tar.gz" $DATA_DIR

# 保留最近 7 天的备份
find $BACKUP_DIR -name "envkey-lite-*.tar.gz" -mtime +7 -delete
```

添加到 crontab：

```bash
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh
```

### 手动备份

```bash
# 停止服务
sudo systemctl stop envkey-lite

# 备份数据
tar -czf envkey-lite-backup-$(date +%Y%m%d).tar.gz data/

# 启动服务
sudo systemctl start envkey-lite
```

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 检查端口使用情况
   sudo netstat -tlnp | grep :3000
   
   # 或使用 lsof
   sudo lsof -i :3000
   ```

2. **权限问题**
   ```bash
   # 确保数据目录权限正确
   sudo chown -R envkey:envkey /opt/envkey-lite/data
   sudo chmod -R 755 /opt/envkey-lite/data
   ```

3. **内存不足**
   ```bash
   # 检查内存使用
   free -h
   
   # 检查应用内存使用
   ps aux | grep node
   ```

### 日志查看

```bash
# PM2 日志
pm2 logs envkey-lite

# systemd 日志
sudo journalctl -u envkey-lite -f

# Docker 日志
docker logs envkey-lite
```

## 性能优化

### 系统级优化

1. **增加文件描述符限制**：
   ```bash
   echo "* soft nofile 65536" >> /etc/security/limits.conf
   echo "* hard nofile 65536" >> /etc/security/limits.conf
   ```

2. **优化内核参数**：
   ```bash
   echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
   echo "net.ipv4.tcp_max_syn_backlog = 65535" >> /etc/sysctl.conf
   sysctl -p
   ```

### 应用级优化

1. **启用集群模式**（PM2）
2. **配置适当的内存限制**
3. **启用 gzip 压缩**（通过反向代理）

## 监控和告警

### 健康检查

应用提供健康检查端点：

```bash
curl http://localhost:3000/health
```

### 监控脚本

创建简单的监控脚本：

```bash
#!/bin/bash

URL="http://localhost:3000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $URL)

if [ $RESPONSE -ne 200 ]; then
    echo "EnvKey Lite is down! HTTP status: $RESPONSE"
    # 发送告警通知
fi
```

## 升级指南

### 备份数据

```bash
# 停止服务
sudo systemctl stop envkey-lite

# 备份数据和配置
tar -czf envkey-lite-backup-$(date +%Y%m%d).tar.gz data/ .env
```

### 更新代码

```bash
# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 构建应用
npm run build
```

### 数据库迁移

```bash
# 运行数据库迁移（如果需要）
npm run db:migrate
```

### 重启服务

```bash
# 启动服务
sudo systemctl start envkey-lite

# 检查状态
sudo systemctl status envkey-lite
```

## 安全建议

1. **定期更新系统和依赖**
2. **使用强密码和密钥**
3. **启用防火墙**
4. **定期备份数据**
5. **监控访问日志**
6. **使用 HTTPS**
7. **限制网络访问**

## 支持

如果遇到问题，请：

1. 查看日志文件
2. 检查配置文件
3. 参考故障排除部分
4. 在 GitHub 上提交 issue