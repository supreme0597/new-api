# MEMORY.md - 项目长期记忆

## 项目技术栈
- new-api：Go 后端 + MySQL，React 前端（VChart + Semi UI + Tailwind CSS）
- 前端路由：react-router-dom v6，PageLayout 根据路径 `/console/` 前缀决定是否显示侧栏

## Semi UI + Tailwind CSS 经验
- Semi Card 组件自带 `margin: 0` 内联样式，Tailwind 的 `mb-4` 会被覆盖，必须用 `!mb-4`（important 前缀）
- 同理 `!rounded-2xl` 也是因为 Semi Card 有默认 border-radius 内联样式
- 凡涉及 Semi 有默认值的 CSS 属性（margin/padding/border-radius），Tailwind 类一律加 `!` 前缀

## 图表卡片高度规范
- 饼图卡片（2列布局）：`h-80`（320px）
- 折线图卡片（独占一行）：`h-72`（288px）
- 从 Tabs 拆分为独立卡片时，需重新评估容器高度，2列布局应比全宽减少约15-20%

## 渠道分析路由
- 列表页：`/channel-analytics`（无侧栏）
- 详情页：`/channel-analytics/:source`（无侧栏）
- 不再使用 `/console/channel-analytics` 路径

## 渠道分析统计卡片布局
- 用量统计总览页：4 个独立指标卡片（来源总数、总调用次数、总 Token 消耗、活跃用户数），4 列 grid 布局（lg:grid-cols-4）
- 详情页：4 个独立指标卡片（调用次数、模型数、Token 消耗、活跃用户），4 列 grid 布局
- 每个卡片有独立背景色：blue-50 / purple-50 / green-50 / orange-50
- 卡片样式与数据看板 StatsCards 一致：Card title（图标+指标名）+ headerLine 分隔线 + body（大字号数值）
- title 属性传入 JSX（div.flex.items-center.gap-2 包裹图标和文字），利用 Semi Card 的 headerLine 渲染分隔线
- body 区域：彩色 lucide 图标（size=20, text-xxx-500）+ 数值（text-2xl font-semibold），用 flex items-center gap-3 排列

## 渠道分析图表颜色
- 使用柔和多色系色板（AntV 默认色系）：`['#5b8ff9', '#5ad8a6', '#f6bd16', '#e8684a', '#9270ca', '#6dc8ec', '#ff9d4d', '#f6c3f7', '#a0d8f7', '#96d6b5']`
- 饼图和趋势图按索引轮询取色，来源对比表格 Tag 用 Semi 的 `color="cyan"`
- 不再使用 `modelToColor()`，避免高饱和度颜色

## 调用次数统计口径差异
- ChannelAnalytics 的 `total_calls`/`call_count`：按来源(source)维度聚合，支持时间范围筛选，来自 `/api/channel-analytics/*` 接口
- Dashboard 的 `request_count`：用户表累计全量字段，不支持时间筛选，来自 `/api/user/self`
- Dashboard 的 `times`：日志数据按模型维度前端累加（item.count），支持时间筛选，来自 `/api/data/self/`
- 三者数值可能不一致，统计维度不同
