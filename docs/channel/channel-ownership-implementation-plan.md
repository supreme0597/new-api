# 渠道归属与公共/私有能力改造实施文档（最终版）

## 1. 目标

实现以下能力：

- `channels.owner_user_id`
- `owner_user_id IS NULL`：公共渠道
- `owner_user_id = 用户ID`：私有渠道
- 公共/私有是**资源属性**
- admin/root 是**角色属性**
- relay 选路：**私有优先，公共兜底**
- 模型广场：**匿名仅公共；登录后公共 + 自己私有**
- 前端采用**单页面**
- 后端采用**单 CRUD 接口**
- 高风险系统运维接口继续保留管理员边界
- “测试自己的渠道”对普通用户开放

---

## 2. 最终架构结论

### 2.1 前端
采用：

- **单页面**
- 同一套渠道页
- 同一套表格/弹窗/hooks
- 按角色控制显示内容与按钮

### 2.2 后端
采用：

- **单 CRUD 接口**
- 普通用户与管理员共用 `/api/channel` 资源接口
- controller/model 内根据角色和 owner 做数据范围与操作限制

### 2.3 运维能力分层
不是所有 `/api/channel/*` 都开放给普通用户。

#### 普通用户可用
仅限自助型能力：
- 查看自己的渠道
- 创建自己的渠道
- 编辑自己的渠道
- 删除自己的渠道
- **测试自己的渠道**
- 如有需要，可拉取自己渠道的模型信息（可选）

#### 仅管理员/超管可用
系统级运维能力：
- 获取真实 key
- 批量测试
- 全量余额更新
- fix abilities
- tag 批量操作
- batch 删除
- 全局 upstream update
- codex/oauth 管理
- multi-key 管理
- 其他全局影响型接口

---

## 3. 数据模型设计

### 3.1 `channels` 表新增字段

新增：

- `owner_user_id` nullable int, indexed

语义：

- `NULL`：公共渠道
- 非 `NULL`：该用户私有渠道

### 3.2 GORM 结构
在 `model/channel.go` 的 `Channel` 中新增：

```go
OwnerUserId *int `json:"owner_user_id" gorm:"index"`
```

### 3.3 派生字段
接口返回可附带：

- `is_public`
- `scope: public | private`

注意：

- 不修改现有 `Channel.Type`
- `Type` 仍表示 provider 类型，不表示公共/私有

---

## 4. 权限模型

### 4.1 普通用户
普通用户只能：

- 看自己的私有渠道
- 创建自己的私有渠道
- 编辑自己的私有渠道
- 删除自己的私有渠道
- 测试自己的私有渠道

普通用户不能：

- 查看别人的私有渠道
- 查看公共渠道管理数据
- 创建公共渠道
- 修改 `owner_user_id`
- 执行全局运维操作

### 4.2 管理员 / Root
管理员/Root 可以：

- 查看全部渠道
- 查看公共+私有
- 创建公共渠道
- 管理公共渠道
- 管理私有渠道
- 使用所有系统级运维能力

是否允许 admin 编辑他人私有渠道：
- 建议允许
- root 保留最高权限

---

## 5. 路由设计（最终版）

### 5.1 保留 `/api/channel` 作为单 CRUD 接口组
资源 CRUD 主链路保留一组：

- `GET /api/channel`
- `GET /api/channel/search`
- `GET /api/channel/:id`
- `POST /api/channel`
- `PUT /api/channel`
- `DELETE /api/channel/:id`

### 5.2 鉴权方式调整
现有 `channelRoute.Use(middleware.AdminAuth())` 不再适用于整组。

建议改成：

#### 资源 CRUD 主链路
使用 `UserAuth()`

然后在 controller 内部按：
- role
- owner
- requested fields

进行二次控制。

#### 高风险系统运维接口
继续显式挂：
- `AdminAuth()`
- `RootAuth()`

#### 用户自助型调试接口
例如测试渠道接口，可挂 `UserAuth()`，但 controller 内必须校验 owner。

---

## 6. 后端接口分层清单

### 6.1 资源 CRUD（单接口）
这部分普通用户与管理员共用：

- `GET /api/channel`
- `GET /api/channel/search`
- `GET /api/channel/:id`
- `POST /api/channel`
- `PUT /api/channel`
- `DELETE /api/channel/:id`

#### 行为规则
##### `GET /api/channel`
- admin/root：返回全量
- user：仅返回 `owner_user_id = currentUserId`

##### `GET /api/channel/search`
- admin/root：全量搜索
- user：仅在自己渠道范围内搜索

##### `GET /api/channel/:id`
- admin/root：可查任意
- user：仅可查自己的

##### `POST /api/channel`
- admin/root：可创建公共或私有
- user：后端强制 `owner_user_id = currentUserId`

##### `PUT /api/channel`
- admin/root：可修改
- user：仅可修改自己的；忽略/拒绝 `owner_user_id` 变更、拒绝改为公共

##### `DELETE /api/channel/:id`
- admin/root：可删除
- user：仅可删除自己的

### 6.2 用户自助型接口（开放给普通用户）
#### 推荐开放
- `GET /api/channel/test/:id`
或兼容现有风格保留 `GET /api/channel/test/:id`

行为：
- admin/root：可测任意
- user：仅可测自己的

#### 可选开放
- `GET /api/channel/fetch_models/:id`
如果产品上希望普通用户能同步自己渠道的上游模型信息，则可开放
- user：仅自己的
- admin：全部

如果不确定，第一版可先不开放。

### 6.3 继续 admin/root 专属的接口
这些继续走管理员边界：

- `POST /api/channel/:id/key`
- `GET /api/channel/test`
- `GET /api/channel/update_balance`
- `GET /api/channel/update_balance/:id`
- `POST /api/channel/fix`
- `POST /api/channel/batch`
- `POST /api/channel/tag/*`
- `PUT /api/channel/tag`
- `POST /api/channel/batch/tag`
- `POST /api/channel/fetch_models`
- `/api/channel/upstream_updates/*`
- `POST /api/channel/multi_key/manage`
- `codex/oauth/*`
- 其他全局影响型接口

---

## 7. Controller 设计

### 7.1 新增权限辅助函数
建议在 controller/service/model 层抽 helper，不要到处散落 `if admin else user`。

建议抽象：

- `IsAdminActor(c *gin.Context) bool`
- `CanViewChannel(actor, channel) bool`
- `CanEditChannel(actor, channel) bool`
- `CanDeleteChannel(actor, channel) bool`
- `CanTestChannel(actor, channel) bool`
- `CanCreatePublicChannel(actor) bool`

### 7.2 查询范围构造
建议新增统一 query builder，例如：

- `BuildChannelScopeQuery(db, actor)`
- admin/root：无 owner 限制
- user：`WHERE owner_user_id = currentUserId`

这样控制器与模型层都能复用。

### 7.3 字段清洗
普通用户提交 `POST/PUT /api/channel` 时：
- 后端强制忽略或拒绝：
  - `owner_user_id`
  - 任何“公共化”字段
- 统一写为：
  - `owner_user_id = currentUserId`

---

## 8. Model 层改造

### 8.1 `model/channel.go`
需要新增：

- `OwnerUserId`
- owner-aware 查询函数
- scope-aware 搜索支持

建议新增函数：

- `GetChannelByIdForActor(id int, actor ...)`
- `SearchChannelsForActor(...)`
- `GetAllChannelsForActor(...)`

或抽统一 query helper。

### 8.2 查询原则
#### 普通用户资源视角
```sql
owner_user_id = currentUserId
```

#### 管理员资源视角
无 owner 限制，可增加筛选条件：
- `scope=public|private`
- `owner_user_id`
- provider
- status

---

## 9. relay 选路改造

这是核心安全改造，和 CRUD 单接口无关，必须做。

### 9.1 目标
按 token/user 选择渠道时：

1. 优先当前用户自己的私有渠道
2. 没有再回退公共渠道
3. 永不命中其他用户私有渠道

### 9.2 当前链路
- `middleware/auth.go`
- `model.ValidateUserToken`
- `token.UserId`
- `middleware/distributor.go`
- `service/channel_select.go`
- `model/ability.go` / `channel_cache.go`

### 9.3 新规则
查询候选渠道时按两段进行：

#### 第一段
```sql
channels.owner_user_id = currentUserId
```

#### 第二段
```sql
channels.owner_user_id IS NULL
```

每段内部仍保留当前机制：
- group/model match
- enabled
- priority
- weight
- retry

---

## 10. abilities / cache / affinity 改造

### 10.1 `model/ability.go`
第一阶段**不改 abilities 表结构**。
仍保留现有 ability 模型。

但所有 user-aware 的模型/渠道选择逻辑必须：
- join `channels`
- 带上 owner 过滤

### 10.2 `model/channel_cache.go`
当前缓存是全局 channel id 集合，不知道 owner。

#### 第一阶段要求
缓存命中后必须二次校验：
- channel enabled
- `owner_user_id IS NULL OR owner_user_id = currentUserId`

否则缓存不能直接信任。

### 10.3 `service/channel_affinity.go`
affinity 命中某个 channelId 后也必须重校验 owner：

- 公共：可用
- 私有：必须 owner = currentUserId

不通过则丢弃 affinity，走正常选路。

### 10.4 `middleware/distributor.go`
对于：
- preferred channel
- affinity channel
- specific channel id

都要增加 owner/public 校验。

---

## 11. 模型列表与模型广场

### 11.1 `/api/pricing`
最终行为：

- 未登录：仅公共渠道衍生模型
- 已登录：公共 + 自己私有

### 11.2 `model/pricing.go`
当前全局缓存不再足够。

建议拆成：

- 公共模型缓存
- 登录用户请求时按需叠加自己的私有模型

### 11.3 `/api/user/self/models` / `controller/model.go`
用户看到的可用模型必须与实际可调用渠道一致：

- 公共能力
- 自己私有能力

不能泄露其他用户私有能力。

---

## 12. 前端设计（最终版）

### 12.1 单页面
继续复用现有页面：

- `web/src/pages/Channel/index.jsx`
- `web/src/hooks/channels/useChannelsData.jsx`
- `web/src/components/table/channels/*`
- `EditChannelModal`

### 12.2 页面行为
#### 管理员
- 页面标题：渠道管理
- 可看全部
- 可按公共/私有筛选
- 可按 owner 筛选
- 显示系统运维按钮

#### 普通用户
- 页面标题：我的渠道
- 仍然进入同一页面组件
- 只看到自己的私有渠道
- 隐藏 owner 筛选
- 隐藏系统运维按钮
- 显示“测试”按钮

### 12.3 前端接口调用
因为 CRUD 最终采用单接口，前端主 CRUD 不再需要两套 URL。

即：

- 列表、搜索、详情、创建、更新、删除都调用 `/api/channel`

前端无需分 admin/self 两组 CRUD API。

#### 前端只需做两类区分
##### 1. 显示层区分
- 按角色隐藏按钮/列

##### 2. 运维接口区分
- 普通用户 UI 不显示管理员专属按钮
- 测试按钮可显示
- 高风险接口按钮只在管理员可见

---

## 13. 菜单与路由

### 13.1 菜单
#### 管理员
显示：
- 渠道管理

#### 普通用户
显示：
- 我的渠道

### 13.2 路由
可以有两个路由入口，但都指向同一个页面组件：

- `/console/channel`
- `/console/my-channel`

或者一个路由加 query。
推荐两个路由、同组件，语义更清晰。

---

## 14. 数据迁移

### 14.1 migration
新增：

- `channels.owner_user_id` nullable + index

### 14.2 历史数据
全部回填为：
- `NULL`

即默认都视为公共渠道。

### 14.3 分阶段上线
#### Phase 1
- 加字段
- 兼容旧逻辑

#### Phase 2
- CRUD owner-aware
- 测试接口 owner-aware
- 管理员运维接口边界保持不变

#### Phase 3
- relay owner-aware
- cache/affinity owner-aware

#### Phase 4
- pricing / model visibility owner-aware

#### Phase 5
- 前端单页面收敛
- 菜单与按钮控制

---

## 15. 验收标准

### 15.1 普通用户
- 只能看到自己的渠道
- 不能看到别人私有渠道
- 不能创建公共渠道
- 不能修改 owner
- 能测试自己的渠道
- 不能调用系统级运维接口

### 15.2 管理员
- 可看所有渠道
- 可区分公共/私有
- 可管理公共/私有
- 系统级运维能力正常

### 15.3 relay
- 私有优先
- 公共兜底
- 永不命中别人私有渠道

### 15.4 模型广场
- 未登录仅公共
- 登录后公共 + 自己私有
- 不泄露别人的私有模型能力

---

## 16. 风险点

### 高风险
- 只改 CRUD，不改 relay/cache/pricing，导致私有泄露
- 缓存命中后不做 owner 二次校验
- 把管理员运维接口错误开放给普通用户
- controller 中权限分支散落，后续难维护

### 应对
- 权限 helper 收口
- owner-aware query 收口
- 高风险接口继续 route 级鉴权
- 前端只做显示控制，后端做真实控制

---

## 17. 最终实施建议

最终采用：

- **前端：单页面**
- **后端：单 CRUD 接口**
- **系统运维接口：继续管理员边界**
- **测试自己的渠道：对普通用户开放**
- **relay / pricing / models：统一按 owner-aware 逻辑实现**

这是当前在 **功能完整性、权限安全、与 upstream 合并成本** 三者之间最平衡的方案。

后续可继续补充一份《按文件修改清单》，直接列出每个 Go / React 文件的具体改动点。

---

## 附录：《按文件修改清单》

### 一、后端

#### 1. `model/channel.go`
- 给 `Channel` 新增字段：`OwnerUserId *int`
- 增加派生判断辅助：`IsPublicChannel() bool`
- 给渠道列表/搜索/详情查询补 actor-aware 过滤能力
- 建议新增/调整函数：
  - `GetAllChannelsForActor(...)`
  - `SearchChannelsForActor(...)`
  - `GetChannelByIdForActor(...)`
  - `ApplyChannelActorScope(db *gorm.DB, userId int, isAdmin bool) *gorm.DB`

#### 2. `controller/channel.go`
- 把当前渠道资源 CRUD 改成“单接口 + owner-aware”：
  - `GetAllChannels`
  - `SearchChannels`
  - `GetChannel`
  - `AddChannel`
  - `UpdateChannel`
  - `DeleteChannel`
- 从 `c` 中获取 `id/role`
- 普通用户：查询只查自己；创建时强制 `OwnerUserId = &currentUserId`；更新/删除前校验 owner；忽略或拒绝请求体中的 `owner_user_id`
- 管理员：支持 `scope=public|private`、`owner_user_id` 等筛选
- 建议抽 helper：
  - `isAdminActor(c *gin.Context) bool`
  - `canManageChannel(c *gin.Context, channel *model.Channel) bool`
  - `sanitizeChannelPayloadForActor(...)`

#### 3. `router/api-router.go`
- 调整 `/api/channel` 路由鉴权边界
- 资源 CRUD 主链路改为 `UserAuth()` 可进入：
  - `GET /api/channel`
  - `GET /api/channel/search`
  - `GET /api/channel/:id`
  - `POST /api/channel`
  - `PUT /api/channel`
  - `DELETE /api/channel/:id`
- 普通用户可开放的自助接口：
  - `GET /api/channel/test/:id`
  - （可选）`GET /api/channel/fetch_models/:id`
- 以下保持 `AdminAuth()` / `RootAuth()`：
  - `POST /:id/key`
  - `GET /test`
  - `GET /update_balance`
  - `GET /update_balance/:id`
  - `POST /fix`
  - `POST /batch`
  - `POST /tag/*`
  - `PUT /tag`
  - `POST /batch/tag`
  - `POST /fetch_models`
  - `/upstream_updates/*`
  - `multi_key/manage`
  - `codex/oauth/*`

#### 4. `middleware/auth.go`
- 确认 `UserAuth()` 在 `/api/channel` 资源接口上可稳定提供 `id/role`
- 无需大改认证机制，重点是 controller 侧 owner/admin 判断可依赖现有上下文

#### 5. `service/channel_select.go`
- 将当前选路逻辑改为 user-aware
- 新增或改造函数：
  - `GetRandomSatisfiedChannelForUser(...)`
  - 或在现有参数结构中增加 `UserId`
- 逻辑：先查 owner 私有，再查公共渠道

#### 6. `middleware/distributor.go`
- 将请求上下文中的 `userId` 带入渠道选路
- 对以下路径增加 owner/public 二次校验：
  - preferred channel
  - affinity 命中 channel
  - specific channel id
  - 测试渠道相关路径（若复用分发链路）

#### 7. `model/ability.go`
- 第一阶段不改 `Ability` 表结构
- 所有 user-aware 的渠道/模型查询改为 join `channels` 并带 owner 过滤条件

#### 8. `model/channel_cache.go`
- 全局缓存命中 channelId 后增加 owner/public 校验
- 校验失败时丢弃并继续正常选路

#### 9. `service/channel_affinity.go`
- affinity 命中后重校验 owner/public
- 不满足权限时回退正常选路

#### 10. `controller/model.go`
- 让用户可见模型列表与 owner-aware 渠道能力保持一致
- 检查并改造 `ListModels` 及基于 `GetGroupEnabledModels(...)` 的逻辑

#### 11. `model/pricing.go`
- 重构 pricing 聚合：
  - 公共模型缓存
  - 用户私有模型增量拼接
- 按 owner 过滤 ability/channel 来源

#### 12. `controller/pricing.go`
- 根据 `c.GetInt("id")` 决定返回：
  - 未登录：public only
  - 已登录：public + owned private

#### 13. `model/channel_satisfy.go`
- 若最终用户可见/可调度逻辑会依赖该层，新增 owner-aware 版本
  - `IsChannelEnabledForGroupModelForUser(...)`
  - 或在调用方统一先做 owner/public 判断

#### 14. `controller/channel-test.go`
- 若承载测试渠道逻辑，补 owner 校验与角色分流：
  - admin/root：可测任意
  - user：仅可测自己的渠道

#### 15. `controller/channel-billing.go`
- 保持 admin/root 专属，无需对普通用户开放

#### 16. `controller/channel_upstream_update.go`
- 保持 admin/root 专属，无需对普通用户开放全局更新

#### 17. Migration 文件（新增）
- 为 `channels` 表新增 `owner_user_id` nullable + index
- 历史数据回填为 `NULL`
- 必须兼容 SQLite / MySQL / PostgreSQL

### 二、前端

#### 18. `web/src/pages/Channel/index.jsx`
- 保持单页面组件
- 根据角色切换页面标题：
  - admin：渠道管理
  - user：我的渠道
- 决定是否展示管理员专属操作区

#### 19. `web/src/hooks/channels/useChannelsData.jsx`
- 继续调用同一套 CRUD 接口 `/api/channel`
- 根据当前角色控制：
  - 默认筛选
  - 请求参数
  - 页面按钮状态
  - 是否显示管理员运维动作
- 增加 `scope` 筛选支持：
  - admin：可筛选 public/private
  - user：可固定为 private 或不展示该筛选

#### 20. `web/src/components/table/channels/index.*`
- 渠道表格增加“渠道类型”列
- 根据 `owner_user_id` 派生显示公共/私有

#### 21. `web/src/components/table/channels/ChannelsTable.*`
- 按角色控制按钮显示
- 普通用户显示：编辑、删除、测试
- 普通用户隐藏：批量运维、tag 批量动作、全局测试、key 管理、全局同步、余额更新、multi-key/codex 等
- 管理员保留现有能力并增加公共/私有视角支持

#### 22. `web/src/components/table/channels/modals/EditChannelModal.*`
- 继续复用同一弹窗
- 普通用户模式：不显示 `owner_user_id`；不允许设置公共；创建/更新时不暴露 owner 控制字段
- 管理员模式：可设置公共/私有；可查看/调整 owner（若产品最终确认允许）

#### 23. `web/src/components/table/channels/*Filters*`
- 增加“渠道类型”筛选
- admin：全部 / 公共 / 私有 / （可选）owner 搜索
- user：可固定私有或不显示

#### 24. `web/src/components/layout/SiderBar.jsx`
- 菜单增加“我的渠道”
- admin 显示“渠道管理”
- user 显示“我的渠道”
- 两者可指向同一个页面组件

#### 25. `web/src/App.jsx`
- 增加普通用户访问渠道页的路由入口
- 推荐：
  - `/console/channel`
  - `/console/my-channel`
- 两者都指向同一个页面组件

#### 26. `web/src/helpers/utils.jsx` / 角色判断相关文件
- 复用现有角色判断逻辑
- 页面按角色控制文案与按钮显隐

#### 27. `web/src/pages/Pricing/*`
- 如需显式区分模型来源，可增加来源筛选/标识：公共 / 我的私有
- 第一阶段可先不做复杂 UI，只保证接口正确

#### 28. `web/src/hooks/model-pricing/useModelPricingData.jsx`
- 确认前端可兼容：
  - 未登录只拿公共
  - 登录后拿公共 + 自己私有
- 若接口结构不变，则前端改动应尽量小

### 三、测试与验证

#### 29. 后端测试文件（新增/修改）
- 覆盖渠道资源权限：
  - user 只能查自己的
  - user 不能改别人的
  - user 创建强制私有
  - admin 可看全量
- 覆盖 relay 选路：
  - 私有优先
  - 公共兜底
  - 不命中他人私有
- 覆盖 pricing/model visibility：
  - anonymous -> public only
  - logged in -> public + own private
- 覆盖 test channel：
  - user 能测自己的
  - user 不能测别人的
  - admin 能测任意

### 四、建议开发顺序

#### 第一批：模型与接口边界
1. `model/channel.go`
2. migration
3. `router/api-router.go`
4. `controller/channel.go`

#### 第二批：调用安全链路
5. `service/channel_select.go`
6. `middleware/distributor.go`
7. `model/ability.go`
8. `model/channel_cache.go`
9. `service/channel_affinity.go`

#### 第三批：模型广场与模型列表
10. `controller/model.go`
11. `model/pricing.go`
12. `controller/pricing.go`

#### 第四批：前端
13. `App.jsx`
14. `SiderBar.jsx`
15. `pages/Channel/index.jsx`
16. `useChannelsData.jsx`
17. `ChannelsTable`
18. `EditChannelModal`
19. `Filters`

#### 第五批：测试收尾
20. 后端权限与选路测试
21. 前端角色显示与主流程回归

---

## 附录 B：本次会话实际变更清单（增量记录）

> 以下为 2026-04-05 会话中实际落地的变更，与原始计划的差异点。

### 一、后端变更

#### 1. `controller/channel.go`
- `currentActor(c)` 改为返回 3 值：`(userId, isAdmin, isRoot)`
- `isRootActor(c)` 新增，判断 `role >= RoleRootUser`
- `sanitizeChannelPayloadForActor`：只有超管创建公共渠道，普通管理员也变私有
- `GetAllChannels` / `SearchChannels`：
  - 新增 `owner` 查询参数（按归属人筛选）
  - 返回数据填充 `owner_username`
- `GetChannelOwners` 新增接口：返回所有渠道归属人列表
- `CopyChannel` 权限与行为大改：
  - 路由从 `AdminAuth` 降为 `UserAuth`
  - 公共渠道任何人都能复制
  - 超管复制 → 公共，保留密钥
  - 管理员/普通用户复制 → 私有，清空密钥
  - 复制名称加来源标记：公共 `[来源: 公共 #ID]`，私有 `[来源: UID 用户名 #ID]`
- `POST /api/channel/fetch_models` 从 `RootAuth` 降为 `UserAuth`
- 启用/禁用渠道前端按钮开放（后端 `PUT /api/channel/` 本就是 `UserAuth`）

#### 2. `controller/channel-test.go`
- `testChannel` 函数签名增加 `userId int` 参数
- `TestChannel` 改用 `CanActorViewChannel`（管理员可测试所有渠道排查问题）
- `RecordConsumeLog` 的 userId 不再硬编码 1，使用实际调用者 ID
- `GetUserCache` 不再硬编码 1，使用实际调用者 userId
- `AutomaticallyTestChannels` 传 userId=1 保持原行为

#### 3. `model/channel.go`
- `Channel` 结构体新增 `OwnerUsername string` 字段（`json:"owner_username" gorm:"-"`）
- `CanActorManageChannel` 增加 `isRoot bool` 参数：
  - 超管可管理所有渠道
  - 普通管理员只能管理公共渠道 + 自己的私有渠道
  - 不能管理别人的私有渠道
- `GetChannelOwnerUserIds()` 新增：返回所有渠道归属人 ID 列表

#### 4. `model/ability.go`
- `GetAllEnableAbilityWithChannels`：恢复查询所有启用渠道（包含私有），relay 缓存需要全量
- `applyAbilityChannelOwnerScope`：超管跳过 owner 过滤，能看到所有渠道的模型
- `getChannelQueryForUser`：`commonGroupCol` 加 `abilities.` 前缀，修复 PostgreSQL `column reference "group" is ambiguous`

#### 5. `model/log.go`
- `GetUserLogs` 新增 `channel int` 参数，支持按渠道 ID 筛选
- `GetUserLogs` 填充 `ChannelName`（原来被 `formatUserLogs` 清空了）

#### 6. `router/api-router.go`
- `POST /api/channel/fetch_models` → `UserAuth()`
- `POST /api/channel/copy/:id` → `UserAuth()`
- `GET /api/channel/owners` → `UserAuth()` 新增

### 二、前端变更

#### 7. `web/src/hooks/channels/useChannelsData.jsx`
- 删除 `isAdminUser` 变量，统一直接调用 `isAdmin()`
- `fetchGroups` 角色分流：管理员走 `/api/group/`，普通用户走 `/api/user/self/groups`
- `scopeFilter` 默认值从 `'private'` 改为 `'all'`
- `loadChannels` / `searchChannels` 新增 `ownerF` 参数（第 8 个）
- `formInitValues` 新增 `searchOwner: ''`

#### 8. `web/src/hooks/users/useUsersData.jsx`
- `fetchGroups` 简化：只调 `/api/group/` + success 防御（管理员页面）

#### 9. `web/src/components/table/channels/ChannelsActions.jsx`
- 删除 `isAdminUser` prop，"渠道类型"筛选对所有人开放

#### 10. `web/src/components/table/channels/ChannelsTabs.jsx`
- 新增 `scopeFilter` prop，`handleTabChange` 传入 `scopeFilter`

#### 11. `web/src/components/table/channels/ChannelsFilters.jsx`
- 新增归属人筛选下拉（管理员可见）
- `searchChannels` 调用传 `scopeFilter` 和 `owner` 参数

#### 12. `web/src/components/table/channels/ChannelsColumnDefs.jsx`
- 删除 `isAdminUser` 引用，统一 `isAdmin()`
- 私有渠道标签显示归属人：`私有 (username)`
- 启用/禁用按钮去掉 `isAdmin()` 限制
- 复制按钮去掉 `isAdmin()` 限制

#### 13. `web/src/components/table/channels/ChannelsTable.jsx`
- 删除 `isAdminUser` 解构和传参

#### 14. `web/src/components/layout/SiderBar.jsx`
- `icononly` → `iconOnly`（修复 React 警告）

#### 15. `web/src/components/table/channels/modals/EditChannelModal.jsx`
- `fetchGroups` 角色分流

#### 16. `web/src/components/table/channels/modals/EditTagModal.jsx`
- `fetchGroups` 角色分流

#### 17. `web/src/hooks/usage-logs/useUsageLogsData.jsx`
- 渠道列默认对所有用户可见
- 非管理员不再强制隐藏渠道列
- `loadLogs` URL 新增 `channel` 参数
- `getLogSelfStat` URL 新增 `channel` 参数

#### 18. `web/src/components/table/usage-logs/UsageLogsColumnDefs.jsx`
- 渠道列 render 条件从 `isAdminUser &&` 改为 `(isAdminUser || record.type === 2) ?`

#### 19. `web/src/components/table/usage-logs/UsageLogsFilters.jsx`
- 渠道 ID 筛选对所有用户开放

#### 20. `web/src/components/table/usage-logs/modals/ColumnSelectorModal.jsx`
- 渠道列不再对非管理员隐藏

### 三、渠道复制最终矩阵

| 复制者 | 原渠道 | 归属 | 密钥 | 来源标记 |
|--------|--------|------|------|---------|
| 超管 | 任意 | 公共 | ✅ 保留 | 无 |
| 管理员 | 公共 | 私有 | ❌ 清空 | `[来源: 公共 #ID]` |
| 管理员 | 自己的私有 | 私有 | ✅ 保留 | 无 |
| 管理员 | 别人的私有 | 私有 | ❌ 清空 | `[来源: UID 用户名 #ID]` |
| 普通用户 | 公共 | 私有 | ❌ 清空 | `[来源: 公共 #ID]` |
| 普通用户 | 自己的私有 | 私有 | ✅ 保留 | 无 |

### 四、渠道管理权限矩阵

| 操作 | 超管 | 普通管理员 | 普通用户 |
|------|------|-----------|---------|
| 查看公共渠道 | ✅ | ✅ | ✅ |
| 查看别人的私有渠道 | ✅ | ✅ | ❌ |
| 管理公共渠道 | ✅ | ✅ | ❌ |
| 管理自己的私有渠道 | ✅ | ✅ | ✅ |
| 管理别人的私有渠道 | ✅ | ❌ | ❌ |
| 测试渠道 | ✅ 任意 | ✅ 任意 | ✅ 自己的 |
| 复制公共渠道 | ✅ | ✅ | ✅ |
| 复制别人的私有渠道 | ✅ | ✅ | ❌ |

### 五、模型广场

- 未登录：仅公共渠道衍生模型
- 已登录：公共 + 自己私有
- `GetAllEnableAbilityWithChannels` 包含所有启用渠道（relay 缓存需要）
- `applyAbilityChannelOwnerScope` 控制用户可见范围
