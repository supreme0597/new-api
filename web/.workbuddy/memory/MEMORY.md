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
- 每个卡片有独立背景色：blue-50 / purple-50 / green-50 / orange-50
- 不再使用分组标题（createSectionTitle），每个卡片直接展示指标名+数值+图标

## 调用次数统计口径差异
- ChannelAnalytics 的 `total_calls`/`call_count`：按来源(source)维度聚合，支持时间范围筛选，来自 `/api/channel-analytics/*` 接口
- Dashboard 的 `request_count`：用户表累计全量字段，不支持时间筛选，来自 `/api/user/self`
- Dashboard 的 `times`：日志数据按模型维度前端累加（item.count），支持时间筛选，来自 `/api/data/self/`
- 三者数值可能不一致，统计维度不同
