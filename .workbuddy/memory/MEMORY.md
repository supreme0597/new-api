# 长期记忆

## 模型性能排行榜功能

### Phase 6: 测试渠道可见性控制 ✅ 已完成

已完成测试渠道可见性控制功能的实现。

**修改的文件：**

1. **model/ability.go** - 在所有路由和模型查询中过滤测试渠道
   - `GetAllEnableAbilityWithChannels()` - 添加 `is_test_channel = 0` 过滤
   - `GetAllEnableAbilityWithChannelsForUser()` - 添加过滤
   - `GetGroupEnabledModels()` - 添加 JOIN 和过滤
   - `GetGroupEnabledModelsForUser()` - 添加过滤
   - `GetEnabledModels()` - 添加 JOIN 和过滤
   - `GetEnabledModelsForUser()` - 添加过滤
   - `getChannelQuery()` - 添加 JOIN 和过滤
   - `getChannelQueryForUser()` - 添加过滤
   - `getPriority()` - 添加 JOIN 和过滤

2. **model/channel.go** - 在渠道列表查询中过滤测试渠道
   - 新增 `ApplyTestChannelScope()` 辅助函数 - 非管理员用户隐藏测试渠道
   - `GetAllChannelsForActor()` - 添加测试渠道过滤
   - `SearchChannelsForActor()` - 添加测试渠道过滤
   - `GetChannelByIdForActor()` - 添加测试渠道过滤

**行为说明：**
- 管理员可查看所有渠道（包括测试渠道）
- 普通用户看不到测试渠道
- 测试渠道的模型不会出现在模型选择列表中
- 请求不会被路由到测试渠道
- 只有采样任务和排行榜可以访问测试渠道

### 采样配置管理页面 ✅ 已完成

**新增文件：**
- `web/src/pages/SamplingConfig/index.jsx` - 采样配置管理页面

**修改的文件：**
- `web/src/App.jsx` - 添加 `/console/sampling-config` 路由
- `web/src/components/layout/SiderBar.jsx` - 添加「采样配置」侧边栏入口（仅 root 用户可见）
- `web/src/helpers/render.jsx` - 添加 `FlaskConical` 图标
- `web/src/hooks/common/useSidebar.js` - 在 `DEFAULT_ADMIN_CONFIG` 中添加 `samplingConfig`
- `web/src/i18n/locales/zh-CN.json` / `en.json` - 添加翻译词条

**页面功能：**
- 表格展示所有采样配置（ID、名称、Prompt、Max Tokens、状态）
- 支持新增/编辑/删除配置
- 支持启用/禁用切换（Switch）
- 仅超级管理员（root）可访问

### 渠道分析点击用户跳转数据看板 ✅ 已完成

**功能说明**：渠道分析详情页点击用户后跳转到数据看板，带上 username 参数进行过滤。

**修复的文件**（`web/src/components/dashboard/index.jsx`）：
1. `useEffect` 依赖数组添加 `[dashboardData.inputs.username]`，使 URL 参数变化时重新加载图表
2. `loadUserData` 跳过 username 过滤场景，避免用户排行数据覆盖已过滤的单个用户图表

**后端已支持**：后端 controller 和 model 层已正确支持 `username` 参数过滤。

### 渠道分析 UI 风格统一改造 ✅ 已完成

**功能说明**：将渠道分析页面（首页+详情页）的图表组件改为与数据看板统一的风格。

**改造内容**：

1. **统计卡片**：改为数据看板风格的圆角大卡片（`!rounded-2xl`），使用 Semi UI Avatar 颜色
2. **饼图**：自定义 SVG 环形图 → VChart 饼图组件（`SourcePieChart`）
3. **趋势折线图**：自定义 SVG 折线图 → VChart 折线图组件（`SourceTrendChart`）
4. **详情页柱状图**：自定义 CSS 柱状图 → VChart 柱状图组件（`UsageTrendChart`），添加标签显示
5. **统一卡片样式**：所有 Card 组件使用 `CARD_PROPS` 常量（`shadows=''`, `bordered: true`, `headerLine: true`）
6. **颜色统一**：复用数据看板的 `baseColors` 调色板
7. **指标更名**：渠道数 → 模型数（展示该来源下实际调用的模型数）
8. **时间格式**：小时粒度去掉秒（`04-28 15:00` 而非 `04-28 15:00:00`）
9. **布局优化**：粒度选择器移到详情页 header 与时间范围并排
10. **提示移除**：移除详情页底部的跳转提示信息

**修改的文件**：
- `model/channel_analytics.go` - 模型数统计查询、小时格式修正
- `web/src/components/dashboard/index.jsx` - 修复 username 参数传递、loadUserData 逻辑
- `web/src/pages/ChannelAnalytics/index.jsx` - 首页改造为 VChart
- `web/src/pages/ChannelAnalytics/Detail.jsx` - 详情页改造为 VChart
- `web/src/i18n/locales/zh-CN.json` / `en.json` - 翻译更新

**复用的数据看板常量**：
- `CARD_PROPS` - 卡片统一配置
- `CHART_CONFIG` - 图表统一配置（`{ mode: 'desktop-browser' }`）
- `baseColors` - 图表调色板

### 渠道分析 → 用量统计重命名及入口调整 ✅ 已完成

**功能说明**：将「渠道分析」重命名为「用量统计」，并将入口从侧边栏移到顶部导航栏。

**改造内容**：
1. **重命名**：渠道分析 → 用量统计（中文）、Channel Analytics → Usage Statistics（英文）
2. **入口位置**：侧边栏控制台区域 → 顶部导航栏（与首页/控制台/模型广场并行）
3. **权限控制**：仅管理员可见（`requireAdmin: true` + `isAdmin()` 过滤）
4. **路由**：新增 `/channel-analytics`（保留 `/console/channel-analytics` 兼容旧链接）
5. **导航过滤修复**：`useNavigation.js` 中 `undefined` 视为 `true`（默认显示），避免新功能因缺少后端配置被隐藏

**修改的文件**：
- `web/src/hooks/common/useNavigation.js` - 新增渠道分析链接、权限过滤、默认显示逻辑
- `web/src/components/layout/headerbar/index.jsx` - 传递 `isAdmin()`
- `web/src/components/layout/SiderBar.jsx` - 移除侧边栏入口
- `web/src/App.jsx` - 新增独立路由
- `web/src/pages/ChannelAnalytics/index.jsx` - 标题改为用量统计
- `web/src/pages/ChannelAnalytics/Detail.jsx` - 面包屑改为用量统计
- `web/src/i18n/locales/zh-CN.json` / `en.json` - 翻译更新

### 跨库查询兼容修复 ✅ 已完成

**问题**：测试环境部署后用量统计看不到数据，时间条件不生效。

**根因**：`LOG_DB` 和 `DB` 可能是不同的数据库（通过 `LOG_SQL_DSN` 配置）。原代码在 `LOG_DB` 上执行 `JOIN channels`，但 `channels` 表只在主库 `DB` 中，跨库 JOIN 失败导致查询返回空数据。

**修复方案**：移除所有 `JOIN channels`，改为两步查询：
1. 先从主库 `DB` 查询渠道ID和来源映射（`getChannelIDsBySource`、`getAllSourceChannelIDs`、`getSourceByChannelID`）
2. 再用 `IN` 条件在日志库 `LOG_DB` 上过滤

**修改的文件**：
- `model/channel_analytics.go` - 完全重写，移除所有 JOIN channels
