# 订阅系统完整使用指南

## 场景可行性分析

### 目标场景
**渠道/模型仅限特定用户使用，且有有效期，过期用户不能使用**

### 结论：✅ 完全支持

该系统通过 **"用户组 (Group) + 订阅有效期 (Duration)"** 的组合机制，完美支持此场景。

---

## 核心机制

### 1. 渠道/模型的组别限制（Ability 表）

系统通过 `Ability` 表实现了 **"Group + Model + Channel"** 三元组的访问控制：

| 字段 | 作用 |
|------|------|
| `group` | 用户组名称（如 `default`、`vip`、`premium`） |
| `model` | 模型名称（如 `gpt-4o`） |
| `channel_id` | 渠道 ID |
| `enabled` | 是否启用 |

**核心逻辑**（`model/channel_satisfy.go`）：
```go
// 判断指定组的用户能否通过指定渠道使用指定模型
func IsChannelEnabledForGroupModel(group, modelName string, channelID int) bool
```

**工作方式**：
- 管理员在后台为特定渠道配置 `Ability` 记录，指定哪些组可以使用
- 用户发起 API 请求时，系统检查该用户的 `group` 是否在渠道的允许列表中
- **不在列表中 → 请求被拒绝**

### 2. 订阅计划的有效期（SubscriptionPlan）

每个订阅计划都支持设置有效期（`model/subscription.go`）：

| 字段 | 说明 |
|------|------|
| `DurationUnit` | 时间单位：`year`/`month`/`day`/`hour`/`custom` |
| `DurationValue` | 时间值（如 1 month = 1个月） |
| `CustomSeconds` | 自定义秒数（仅当 unit 为 custom 时生效） |

**计算逻辑**（`calcPlanEndTime`）：
```
EndTime = StartTime + DurationValue × DurationUnit
```

例如：`DurationUnit=month, DurationValue=1` → 1个月后过期。

### 3. 订阅激活时的组别升级（UpgradeGroup）

创建订阅时（`CreateUserSubscriptionFromPlanTx`）：

```go
// 1. 计算结束时间
endUnix, _ := calcPlanEndTime(now, plan)

// 2. 如果计划指定了 UpgradeGroup，更新用户组
if plan.UpgradeGroup != "" {
    prevGroup = currentGroup                    // 记录原始组
    tx.Model(&User{}).Update("group", upgradeGroup)  // 升级用户组
}

// 3. 创建订阅记录，保存原始组用于降级
sub := &UserSubscription{
    EndTime:       endUnix,        // 有效期截止时间
    UpgradeGroup:  upgradeGroup,   // 升级到的组
    PrevUserGroup: prevGroup,      // 原始组（用于过期降级）
}
```

### 4. 订阅过期时的自动降级（ExpireDueSubscriptions）

后台任务每 **1分钟** 执行一次（`service/subscription_reset_task.go`），自动处理过期订阅：

```go
// 1. 找到所有已过期的活跃订阅
WHERE status = 'active' AND end_time <= now

// 2. 标记为 expired
UPDATE status = 'expired'

// 3. 检查用户是否还有其他活跃的升级订阅
//    → 如果有，保持当前组（不降级）
//    → 如果没有，降级回原始组
UPDATE group = prevGroup  -- 降级回购买前的组
```

---

## 数据模型详解

### SubscriptionPlan（订阅计划定义）

```go
type SubscriptionPlan struct {
    Id                        int     // 计划ID
    Title                     string  // 显示名称
    Subtitle                  string  // 副标题/描述
    PriceAmount               float64 // 价格金额
    Currency                  string  // 货币（USD/CNY等）
    DurationUnit              string  // 时间单位：year/month/day/hour/custom
    DurationValue             int     // 时间值
    CustomSeconds             int64   // 自定义秒数（当 unit=custom）
    Enabled                   bool    // 是否启用
    SortOrder                 int     // 排序
    MaxPurchasePerUser        int     // 每人最大购买次数（0=不限）
    UpgradeGroup              string  // 购买后升级到的用户组
    TotalAmount               int64   // 总配额（额度单位）
    QuotaResetPeriod          string  // 配额重置周期：never/daily/weekly/monthly/custom
    QuotaResetCustomSeconds   int64   // 自定义重置秒数
    CreatedAt/UpdatedAt       int64   // 时间戳
}
```

### UserSubscription（用户订阅实例）

```go
type UserSubscription struct {
    Id              int     // 订阅实例ID
    UserId          int     // 用户ID
    PlanId          int     // 计划ID
    AmountTotal     int64   // 总配额
    AmountUsed      int64   // 已使用配额
    StartTime       int64   // 开始时间（Unix时间戳）
    EndTime         int64   // 结束时间（Unix时间戳）
    Status          string  // 状态：active/expired/cancelled
    Source          string  // 来源：order（订单）/ admin（管理员）
    LastResetTime   int64   // 上次配额重置时间
    NextResetTime   int64   // 下次配额重置时间
    UpgradeGroup    string  // 升级到的用户组
    PrevUserGroup   string  // 原始用户组（用于降级）
    CreatedAt       int64   // 创建时间
    UpdatedAt       int64   // 更新时间
}
```

### SubscriptionOrder（订阅订单）

```go
type SubscriptionOrder struct {
    Id                int     // 订单ID
    UserId            int     // 用户ID
    PlanId            int     // 计划ID
    Money             float64 // 支付金额
    TradeNo           string  // 交易号（唯一）
    PaymentMethod     string  // 支付方式
    PaymentProvider   string  // 支付提供商（epay/stripe等）
    Status            string  // 状态：pending/paid/expired/cancelled
    Source            string  // 来源
    CreateTime        int64   // 创建时间
    CompleteTime      int64   // 完成时间
}
```

---

## API 接口清单

### 管理员接口（需要 admin 权限）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subscription/plans` | 获取所有订阅计划 |
| POST | `/api/subscription/plan` | 创建订阅计划 |
| PUT | `/api/subscription/plan` | 更新订阅计划 |
| DELETE | `/api/subscription/plan/:id` | 删除订阅计划 |
| GET | `/api/subscription/orders` | 查看所有订单 |
| GET | `/api/subscription/user-subs` | 查看用户订阅列表 |
| POST | `/api/subscription/user-sub` | 管理员为用户绑定订阅 |
| DELETE | `/api/subscription/user-sub/:id` | 删除用户订阅 |

### 普通用户接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subscription/plans` | 浏览可用订阅计划 |
| POST | `/api/subscription/request` | 发起订阅请求（创建订单） |
| POST | `/api/subscription/callback/epay` | Epay 支付回调（无需认证） |
| POST | `/api/subscription/purchase/balance` | 使用余额购买订阅 |

---

## 管理员使用指南

### 场景：创建 VIP 专属 GPT-4o 渠道

#### 步骤 1：创建专属渠道

1. 进入「渠道管理」
2. 点击「新建渠道」
3. 配置渠道信息：
   - **名称**：VIP 专线 GPT-4o
   - **类型**：OpenAI
   - **Base URL**：https://api.openai.com/v1
   - **密钥**：你的 OpenAI API Key
4. 在「模型」中添加：`gpt-4o`

#### 步骤 2：配置渠道组别限制

1. 在渠道详情中找到「组别权限」
2. 添加 Ability 记录：
   - **组名**：`vip`
   - **模型**：`gpt-4o`
   - **启用**：✅

> **关键**：此时只有 `group='vip'` 的用户才能使用该渠道调用 gpt-4o

#### 步骤 3：创建订阅计划

进入「订阅管理」→「计划管理」，创建新计划：

```json
{
  "title": "VIP 月度订阅",
  "subtitle": "专享高速 GPT-4o 线路，月度 100 万额度",
  "price_amount": 20.00,
  "currency": "USD",
  "duration_unit": "month",
  "duration_value": 1,
  "upgrade_group": "vip",
  "total_amount": 1000000,
  "quota_reset_period": "monthly",
  "enabled": true
}
```

**字段说明**：
- `duration_unit/month + duration_value/1`：有效期 1 个月
- `upgrade_group/vip`：购买后自动将用户升级到 vip 组
- `total_amount/1000000`：每月 100 万额度
- `quota_reset_period/monthly`：每月自动重置额度

#### 步骤 4：配置支付网关

进入「系统设置」→「支付设置」：

```json
{
  "epay_url": "https://pay.example.com/",
  "epay_pid": "your_merchant_id",
  "epay_key": "your_api_key"
}
```

---

## 普通用户使用指南

### 购买订阅流程

1. **浏览计划**：访问「订阅中心」，查看所有可用的订阅计划
2. **选择计划**：点击「VIP 月度订阅」，查看详情
3. **发起支付**：
   - 点击「立即购买」
   - 系统创建订单，返回支付 URL
   - 跳转至支付网关完成付款
4. **自动激活**：
   - 支付成功后，系统自动完成订单
   - 用户组自动升级为 `vip`
   - 额度（100万）立即到账
5. **使用专属渠道**：
   - 用户现在可以调用 gpt-4o
   - 请求会被路由到「VIP 专线 GPT-4o」渠道
   - 享受更快响应和更高可用性

### 订阅到期流程

1. **到期前**：正常使用，额度按月重置
2. **到期时**：
   - 系统自动将订阅标记为 `expired`
   - 用户组从 `vip` 降级回 `default`
   - 失去访问 VIP 专线渠道的权限
3. **续期**：重新购买订阅，再次获得 vip 组权限

---

## 配额重置机制

### 支持的重置周期

| 周期 | 说明 | 示例 |
|------|------|------|
| `never` | 从不重置 | 一次性额度 |
| `daily` | 每日重置 | 每天 00:00 重置 |
| `weekly` | 每周重置 | 每周一 00:00 重置 |
| `monthly` | 每月重置 | 每月 1 日 00:00 重置 |
| `custom` | 自定义 | 按 `QuotaResetCustomSeconds` 秒数间隔重置 |

### 重置逻辑

后台任务每分钟检查：
```sql
-- 找到需要重置的订阅
WHERE next_reset_time <= now() 
  AND status = 'active' 
  AND end_time > now()

-- 重置操作
UPDATE amount_used = 0,
       last_reset_time = now(),
       next_reset_time = calcNextResetTime(now, plan, end_time)
```

---

## 后台任务

### Subscription Reset Task（订阅维护任务）

**运行频率**：每分钟执行一次

**执行内容**：
1. **过期处理**：查找并处理已过期的订阅（`ExpireDueSubscriptions`）
2. **配额重置**：为活跃的订阅重置配额（`ResetDueSubscriptions`）
3. **清理**：定期清理旧的预消费记录（`CleanupSubscriptionPreConsumeRecords`）

**启动代码**（`main.go`）：
```go
func main() {
    // ... 其他初始化 ...
    service.StartSubscriptionQuotaResetTask()
    // ...
}
```

---

## 完整场景示例

### 场景：VIP 用户专享高速 GPT-4o

#### 管理员配置

```
渠道配置：
├─ 渠道A: VIP专线-GPT-4o
│  ├─ Ability: group="vip", model="gpt-4o", enabled=true
│  └─ 密钥: sk-xxx (高优先级 OpenAI Key)
│
└─ 渠道B: 普通线路-GPT-4o
   ├─ Ability: group="default", model="gpt-4o", enabled=true
   └─ 密钥: sk-yyy (普通 OpenAI Key)

订阅计划：
├─ 名称: VIP 月度订阅
├─ 价格: $20/月
├─ 升级组: vip
├─ 有效期: 1 month
├─ 额度: 100万 tokens/月
└─ 重置: monthly
```

#### 用户生命周期

| 阶段 | 用户组 | 可用渠道 | 可用额度 |
|------|--------|----------|----------|
| 注册后 | `default` | 渠道B（普通线路） | 赠送额度 |
| 购买订阅 | `vip` | 渠道A（VIP专线）+ 渠道B | 100万/月 |
| 使用 15 天 | `vip` | 渠道A（VIP专线）+ 渠道B | 100万/月 |
| 使用 30 天 | `vip`（自动重置） | 渠道A（VIP专线）+ 渠道B | 100万/月（重置） |
| 到期 | `default`（自动降级） | 渠道B（普通线路） | 赠送额度 |

#### 技术流程图

```
用户请求 gpt-4o
    │
    ▼
[中间件] 获取当前用户组
    │
    ▼
[分发器] 查找可用渠道
    │
    ├─ 检查组别匹配：IsChannelEnabledForGroupModel(group="vip", model="gpt-4o")
    │
    ▼
匹配到 渠道A (VIP专线)
    │
    ▼
[预消费检查] PreConsumeUserSubscription
    │
    ├─ 查找活跃订阅: WHERE status='active' AND end_time > now
    ├─ 检查额度: amount_total - amount_used >= request_cost
    └─ 锁定额度
    │
    ▼
[转发] 请求上游 OpenAI API
    │
    ▼
[后消费] PostConsumeUserSubscriptionDelta
    │
    └─ 更新 amount_used += actual_cost
    │
    ▼
返回响应给用户
```

---

## 常见问题

### Q1: 用户购买后多久能使用专属渠道？
**A**: 支付完成瞬间。支付回调处理完成后，立即更新用户组并创建订阅记录。

### Q2: 订阅过期后，用户正在进行的请求会怎样？
**A**: 
- 正在进行的请求不受影响，正常完成
- 新的请求会被拒绝（组权限检查失败）或路由到默认渠道
- 剩余额度会被清零

### Q3: 如果用户同时购买两个不同的订阅计划？
**A**: 
- 每个订阅是独立的实例
- 额度是累加的（先消费的订阅额度用完后再消费下一个）
- 组别以最新的活跃订阅为准（或保持最高权限组）

### Q4: 管理员如何手动给用户添加订阅？
**A**: 使用接口 `POST /api/subscription/user-sub`：
```json
{
  "user_id": 123,
  "plan_id": 1,
  "note": "补偿赠送"
}
```

### Q5: 如何设置永久订阅？
**A**: 将 `DurationUnit` 设为 `custom`，`DurationValue` 设为很大的值（如 100 年对应的秒数）。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `model/subscription.go` | 订阅数据模型、核心逻辑 |
| `model/channel_satisfy.go` | 渠道/模型组别匹配检查 |
| `service/subscription_reset_task.go` | 后台定时任务 |
| `controller/subscription.go` | API 控制器 |
| `router/api-router.go` | 路由定义（165-198行） |

---

## 数据库表结构

```sql
-- 订阅计划表
CREATE TABLE subscription_plans (
    id INTEGER PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    subtitle VARCHAR(255) DEFAULT '',
    price_amount DECIMAL(10,6) NOT NULL DEFAULT 0,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    duration_unit VARCHAR(16) NOT NULL DEFAULT 'month',
    duration_value INT NOT NULL DEFAULT 1,
    custom_seconds BIGINT NOT NULL DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    max_purchase_per_user INT DEFAULT 0,
    upgrade_group VARCHAR(64) DEFAULT '',
    total_amount BIGINT NOT NULL DEFAULT 0,
    quota_reset_period VARCHAR(16) DEFAULT 'never',
    quota_reset_custom_seconds BIGINT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);

-- 用户订阅实例表
CREATE TABLE user_subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INT NOT NULL INDEX,
    plan_id INT NOT NULL INDEX,
    amount_total BIGINT NOT NULL DEFAULT 0,
    amount_used BIGINT NOT NULL DEFAULT 0,
    start_time BIGINT,
    end_time BIGINT INDEX,
    status VARCHAR(32) INDEX,  -- active/expired/cancelled
    source VARCHAR(32) DEFAULT 'order',
    last_reset_time BIGINT DEFAULT 0,
    next_reset_time BIGINT DEFAULT 0 INDEX,
    upgrade_group VARCHAR(64) DEFAULT '',
    prev_user_group VARCHAR(64) DEFAULT '',
    created_at BIGINT,
    updated_at BIGINT
);

-- 订阅订单表
CREATE TABLE subscription_orders (
    id INTEGER PRIMARY KEY,
    user_id INT NOT NULL INDEX,
    plan_id INT NOT NULL INDEX,
    money DECIMAL(10,6),
    trade_no VARCHAR(255) UNIQUE INDEX,
    payment_method VARCHAR(50),
    payment_provider VARCHAR(50) DEFAULT '',
    status VARCHAR(32) DEFAULT 'pending',  -- pending/paid/expired/cancelled
    source VARCHAR(32) DEFAULT '',
    create_time BIGINT,
    complete_time BIGINT
);
```
