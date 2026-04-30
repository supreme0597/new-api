# Learnings Log

## [LRN-20260430-001] best_practice

**Logged**: 2026-04-30T11:04:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Semi UI Card 组件的 `margin: 0` 内联样式会覆盖 Tailwind 的 margin 类，必须用 `!` important 前缀覆盖

### Details
在 ChannelAnalytics 页面重构中，给 Semi Card 添加 `className='!rounded-2xl mb-4'`，发现 `mb-4` 不生效。原因是 Semi Card 组件内部对根元素设置了 `margin: 0` 的内联样式，优先级高于 Tailwind 的工具类。

解决方案：改用 `!mb-4`（Tailwind important 前缀），生成 `margin-bottom: 1rem !important` 来覆盖。

同理，`!rounded-2xl` 也是因为 Semi Card 有默认 border-radius 内联样式才需要 important。

### Suggested Action
在使用 Semi UI Card + Tailwind 时，凡是涉及 margin/padding/border-radius 等 Semi 有默认值的属性，一律使用 `!` 前缀确保覆盖。

### Metadata
- Source: error
- Related Files: src/pages/ChannelAnalytics/index.jsx, src/pages/ChannelAnalytics/Detail.jsx
- Tags: semi-ui, tailwind, css-priority, card
- Pattern-Key: harden.semi_tailwind_priority

---

## [LRN-20260430-002] best_practice

**Logged**: 2026-04-30T11:04:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
将 Tabs 内的多个面板拆分为独立卡片时，需同步调整图表容器高度，避免空白过多

### Details
原 ChannelAnalytics 页面使用 Semi Tabs 组件将4个图表（来源对比/调用量占比/Token占比/使用趋势）放在一个 `h-96` 的 Card 内。拆分为独立卡片后：
- 饼图卡片改为2列布局，每个宽度只有原来的一半，`h-96` 导致空白过多
- 折线图卡片独占一行，`h-96` 也偏高

调整后：饼图卡片用 `h-80`（320px），折线图卡片用 `h-72`（288px），视觉更紧凑。

### Suggested Action
从 Tabs 拆分为独立卡片时，必须重新评估每个卡片的容器高度。2列布局下高度应比全宽减少约15-20%，折线图比饼图可以更矮。

### Metadata
- Source: user_feedback
- Related Files: src/pages/ChannelAnalytics/index.jsx, src/pages/ChannelAnalytics/Detail.jsx
- Tags: layout, card-height, tabs-split, vchart
- Pattern-Key: simplify.tabs_to_cards_height

---

## [LRN-20260430-003] best_practice

**Logged**: 2026-04-30T11:04:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
路由策略需在方案设计阶段就确定：子页面路由应体现层级关系，且需同步清理所有旧路径引用

### Details
ChannelAnalytics 原有4条路由（`/channel-analytics`、`/channel-analytics/:source`、`/console/channel-analytics`、`/console/channel-analytics/:source`），导致同一页面有两个入口。`/console/` 前缀的路由会触发 PageLayout 显示侧栏，而详情页不需要侧栏。

最终方案：仅保留 `/channel-analytics` 和 `/channel-analytics/:source`，利用 `isConsoleRoute = pathname.startsWith('/console')` 的判断自动不显示侧栏。

需要同步修改的引用点：
1. `App.jsx` — 删除 `/console/channel-analytics` 两条路由
2. `SiderBar.jsx` — 导航路径修正
3. `index.jsx` — 详情页跳转路径修正
4. `Detail.jsx` — 面包屑返回路径

### Suggested Action
修改路由时，必须全局搜索旧路径字符串，逐一修正所有引用点（路由定义、导航跳转、侧栏配置、面包屑等）。路由策略应作为方案设计的一部分提前与用户确认。

### Metadata
- Source: user_feedback
- Related Files: src/App.jsx, src/components/layout/SiderBar.jsx, src/pages/ChannelAnalytics/index.jsx, src/pages/ChannelAnalytics/Detail.jsx
- Tags: routing, sidebar, route-strategy, page-layout
- Pattern-Key: harden.route_cleanup_checklist

---
