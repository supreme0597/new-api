# LDAP 工号令牌认证

## 概述

支持通过 LDAP 验证员工身份，自动创建用户和令牌。令牌值为员工工号。

**参考实现**: Yearning LDAP 认证模块

## 配置

在管理后台配置 LDAP 设置：

```json
{
  "ldap": {
    "enabled": true,
    "url": "ldap.example.com:389",
    "user": "cn=admin,dc=example,dc=com",
    "password": "admin_password",
    "type": "(employeeID=%s)",
    "sc": "dc=example,dc=com",
    "ldaps": false,
    "skip_tls": false,
    "map": "{\"real_name\":\"cn\",\"email\":\"mail\",\"department\":\"department\"}",
    "test_user": "test",
    "test_pass": "test123"
  }
}
```

### 配置说明（兼容 Yearning 格式）

| 字段 | 说明 | 示例 |
|------|------|------|
| `enabled` | 是否启用 LDAP 认证 | `true` / `false` |
| `url` | LDAP 服务器地址（含端口） | `ldap.example.com:389` |
| `user` | 管理员绑定 DN | `cn=admin,dc=example,dc=com` |
| `password` | 管理员密码 | `admin_password` |
| `type` | 用户搜索过滤器模板 | `(employeeID=%s)` 或 `(sAMAccountName=%s)` |
| `sc` | 搜索基准 DN (Base DN) | `dc=example,dc=com` |
| `ldaps` | 是否使用 LDAPS | `true` / `false` |
| `skip_tls` | 跳过 TLS 证书验证 | `true` / `false` |
| `map` | 属性映射 JSON | `{"real_name":"cn","email":"mail","department":"department"}` |
| `test_user` | 测试用户（用于连接测试） | `test` |
| `test_pass` | 测试用户密码 | `test123` |

### 常用过滤器模板

| LDAP 类型 | 过滤器模板 |
|----------|-----------|
| OpenLDAP / 通用 | `(employeeID=%s)` |
| Active Directory | `(sAMAccountName=%s)` |
| 按邮箱查找 | `(mail=%s)` |
| 按 UID 查找 | `(uid=%s)` |

### 属性映射说明

`map` 字段定义 LDAP 属性到系统字段的映射：

```json
{
  "real_name": "cn",        // 姓名 → cn 属性
  "email": "mail",          // 邮箱 → mail 属性
  "department": "department" // 部门 → department 属性
}
```

常见 LDAP 属性：
- `cn` - 通用名称
- `sn` - 姓氏
- `givenName` - 名字
- `mail` - 邮箱
- `department` - 部门
- `displayName` - 显示名称
- `employeeID` - 员工号
- `sAMAccountName` - AD 登录名

## 使用方法

### API 请求

在请求头中提供以下信息：

```
Authorization: Bearer <employee_id>
LDAP-Password: <password>
```

### 示例

```bash
# 访问聊天 API
curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Authorization: Bearer 12345" \
  -H "LDAP-Password: mypassword" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 访问模型列表
curl -X GET "http://localhost:3000/v1/models" \
  -H "Authorization: Bearer 12345" \
  -H "LDAP-Password: mypassword"

# 访问 Gemini API
curl -X POST "http://localhost:3000/v1beta/models/gemini-pro:generateContent" \
  -H "Authorization: Bearer 12345" \
  -H "LDAP-Password: mypassword" \
  -H "Content-Type: application/json"
```

### 工作流程

1. 客户端发送请求，携带工号和密码
2. 系统连接 LDAP 服务器验证密码
3. 验证通过后，从 LDAP 获取员工信息（姓名、邮箱、部门）
4. 自动创建用户（如果不存在）：
   - 用户名 = 工号
   - 角色 = 普通用户
   - 状态 = 启用
   - 邮箱 = LDAP 返回的邮箱
5. 自动创建令牌（如果不存在）：
   - 令牌 Key = 工号
   - 名称 = "LDAP 工号令牌"
   - 额度 = 无限
   - 永不过期
6. 返回 API 响应

## 中间件集成

LDAP 认证已集成到 `TokenAuth()` 中间件作为备选方案：

```go
// middleware/auth.go
func TokenAuth() func(c *gin.Context) {
    return func(c *gin.Context) {
        // 1. 尝试普通 token 认证
        token, err := model.ValidateUserToken(key)
        
        // 2. 失败时尝试 LDAP 认证
        if err != nil {
            ldapPassword := c.Request.Header.Get("LDAP-Password")
            if ldapPassword != "" && key != "" {
                // LDAP 认证成功则设置上下文
                // ...
            }
        }
    }
}
```

所有使用 `TokenAuth()` 的路由自动支持 LDAP 认证：

| 路由 | 用途 |
|------|------|
| `/v1/models` | 模型列表 |
| `/v1/chat/completions` | 聊天补全 |
| `/v1/completions` | 文本补全 |
| `/v1/images/generations` | 图像生成 |
| `/v1/embeddings` | 嵌入向量 |
| `/v1/audio/*` | 音频处理 |
| `/v1/messages` | Claude API |
| `/v1beta/models/*` | Gemini API |
| `/mj/*` | Midjourney |
| `/suno/*` | Suno 音乐生成 |

## 代码结构

```
ldap/
  auth.go          # LDAP 连接和认证（参考 Yearning 实现）
                    - ALdap 结构体
                    - LdapConnect() 方法
                    - Authenticate() 函数

middleware/
  ldap_auth.go     # LDAP 认证中间件
                    - LDAPTokenAuth()
                    - LDAPTokenOrUserAuth()

service/
  ldap_token.go    # LDAP 令牌服务
                    - AuthenticateAndCreateToken()
                    - FindOrCreateUser()
                    - FindOrCreateToken()

setting/system_setting/
  ldap.go          # LDAP 配置管理（兼容 Yearning 格式）
                    - LDAPSettings 结构体
                    - LDAPAttributeMap 结构体
```

## 注意事项

1. **首次认证**：首次使用工号认证时，会自动创建用户和令牌
2. **令牌复用**：后续请求使用相同工号，会复用已有令牌
3. **密码验证**：每次请求都会通过 LDAP 验证密码
4. **用户状态**：自动创建的用户默认为普通用户，状态为启用
5. **令牌额度**：默认无限额度，可在管理后台修改

## 与 Yearning 的兼容性

本实现参考了 Yearning 项目的 LDAP 认证模块，配置格式完全兼容：

| Yearning 字段 | new-api 字段 | 说明 |
|--------------|-------------|------|
| `Url` | `url` | 服务器地址（含端口） |
| `User` | `user` | 绑定 DN |
| `Password` | `password` | 绑定密码 |
| `Type` | `type` | 搜索过滤器 |
| `Sc` | `sc` | Base DN |
| `Ldaps` | `ldaps` | LDAPS 开关 |
| `Map` | `map` | 属性映射 JSON |
| `TestUser` | `test_user` | 测试用户 |
| `TestPassword` | `test_pass` | 测试密码 |

可以直接复用 Yearning 的 LDAP 配置。
