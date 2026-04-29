# MySQL 错误 1129 修复指南

## 问题描述
```
error 1129: Host '10.000.78.0' is blocked because of many connection errors; 
unlock with 'mysqladmin flush-hosts'
```

## 修复步骤

### 步骤 1：解锁被阻塞的主机（立即执行）

**在 MySQL 服务器上执行以下命令：**

#### 方法 A：使用 MySQL 客户端
```sql
-- 登录 MySQL
mysql -u root -p

-- 执行解锁命令
FLUSH HOSTS;

-- 验证
SELECT * FROM performance_schema.host_cache;
```

#### 方法 B：使用命令行（无需登录 MySQL）
```bash
mysqladmin -u root -p flush-hosts
```

---

### 步骤 2：增加 max_connect_errors（防止再次被阻塞）

#### 临时生效（立即执行，重启后失效）
```sql
-- 登录 MySQL 后执行
SET GLOBAL max_connect_errors = 100000;

-- 验证
SELECT @@GLOBAL.max_connect_errors;
```

#### 永久生效（修改配置文件）
1. 找到 MySQL 配置文件：
   - **Linux**: `/etc/my.cnf` 或 `/etc/mysql/my.cnf`
   - **Windows**: `my.ini`（通常在 MySQL 安装目录或 `C:\ProgramData\MySQL\MySQL Server 8.0\`）

2. 在 `[mysqld]` 部分添加：
   ```ini
   [mysqld]
   max_connect_errors = 100000
   ```

3. 重启 MySQL 服务：
   ```bash
   # Linux
   sudo systemctl restart mysql
   
   # Windows PowerShell（以管理员身份运行）
   net stop mysql
   net start mysql
   ```

---

### 步骤 3：应用新的连接池配置

#### 如果使用 `.env` 文件（已创建）
项目根目录已创建 `.env` 文件，包含优化后的连接池参数：
```
SQL_MAX_LIFETIME=300
SQL_MAX_IDLE_CONNS=50
SQL_MAX_OPEN_CONNS=200
```

**重启 new-api 应用使配置生效。**

#### 如果使用 Docker Compose
修改 `docker-compose.yml`，在 `environment` 部分添加：
```yaml
environment:
  - SQL_MAX_LIFETIME=300
  - SQL_MAX_IDLE_CONNS=50
  - SQL_MAX_OPEN_CONNS=200
```

然后重启容器：
```bash
docker-compose restart new-api
```

#### 如果直接运行（非 Docker）
设置环境变量后重启应用：
```bash
# Linux/Mac
export SQL_MAX_LIFETIME=300
export SQL_MAX_IDLE_CONNS=50
export SQL_MAX_OPEN_CONNS=200

# Windows PowerShell
$env:SQL_MAX_LIFETIME=300
$env:SQL_MAX_IDLE_CONNS=50
$env:SQL_MAX_OPEN_CONNS=200
```

---

### 步骤 4：验证修复效果

#### 1. 检查 MySQL 主机缓存
```sql
SELECT * FROM performance_schema.host_cache 
WHERE IP LIKE '10.000.78%';
```

#### 2. 检查应用日志
确保没有数据库连接错误。

#### 3. 监控数据库连接数
```sql
SHOW PROCESSLIST;
SHOW STATUS LIKE 'Threads_connected';
```

---

## 参数说明

| 参数 | 原默认值 | 建议值 | 说明 |
|------|----------|--------|------|
| `max_connect_errors` | 100 | **100000** | MySQL 侧：允许的最大连接错误次数 |
| `SQL_MAX_LIFETIME` | 60秒 | **300秒** | 应用侧：连接最大生命周期 |
| `SQL_MAX_IDLE_CONNS` | 100 | **50** | 应用侧：空闲连接数 |
| `SQL_MAX_OPEN_CONNS` | 1000 | **200** | 应用侧：最大打开连接数 |

---

## 故障排查

### 如果问题仍然存在

1. **检查网络连接稳定性**
   ```bash
   ping <mysql-host>
   ```

2. **检查 DSN 配置是否正确**
   - 密码中的特殊字符需要 URL 编码
   - 确保 MySQL 用户有权限从应用服务器 IP 连接

3. **查看 MySQL 错误日志**
   - Linux: `/var/log/mysql/error.log`
   - Windows: MySQL 数据目录下的 `hostname.err`

4. **考虑启用连接重试机制**
   在应用层添加数据库连接重试逻辑。

---

## 快速执行脚本

已为您创建 `fix_mysql_1129.sql` 脚本，执行方式：

```bash
# 方法1：在 MySQL 客户端中执行
mysql -u root -p
source fix_mysql_1129.sql

# 方法2：命令行直接执行
mysql -u root -p < fix_mysql_1129.sql
```

---

## 联系方式
如问题仍未解决，请提供：
1. MySQL 版本号
2. 应用日志中的具体错误信息
3. `SHOW VARIABLES LIKE 'max_connect_errors';` 的输出
