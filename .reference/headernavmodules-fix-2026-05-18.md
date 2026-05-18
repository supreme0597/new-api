# HeaderNavModules Performance Leaderboard 修复文档

## 日期
2026-05-18

## 问题描述

**功能缺失**：顶部导航栏缺少「性能排行榜」入口。合入上游代码后，`performance_leaderboard` 模块在导航栏中不显示。

## 原因分析

根因在前端解析层 `nav-modules.ts`，共三层缺失：

1. **默认值缺失**：`DEFAULT_HEADER_NAV_MODULES` 只有 `pricing` 和 `rankings`，没有 `performance_leaderboard`
2. **克隆函数缺失**：`cloneHeaderNavDefaults()` 只深拷贝了 `pricing` 和 `rankings`，未包含 `performance_leaderboard`
3. **解析分支缺失**：`parseHeaderNavModules()` 只对 `pricing` 和 `rankings` 做了 `parseAccess` 显式处理。当 JSON 中出现 `performance_leaderboard: {enabled: true, requireAuth: false}` 时，走进通用 boolean 分支，对象值被静默丢弃

**数据流**：后端 `GetStatus` 返回 `HeaderNavModules` JSON → `nav-modules.ts` 解析 → `use-top-nav-links.ts` 消费。解析阶段丢失导致导航栏不渲染该条目。

> 注：`use-top-nav-links.ts` 本地的 `DEFAULT_HEADER_NAV_MODULES`（L34-42）已包含 `performance_leaderboard`，但实际使用的是 `nav-modules.ts` 的解析结果（L136），本地默认值未生效。

## 修复方案

**仅修改前端 `web/default/src/lib/nav-modules.ts`，共 3 处改动。** 不改后端，不改函数签名，不碰上游已有逻辑，纯增量新增。

### 改动 1：默认值加 performance_leaderboard

```diff
 const DEFAULT_HEADER_NAV_MODULES: HeaderNavModules = {
   home: true,
   console: true,
   pricing: { enabled: true, requireAuth: false },
   rankings: { enabled: true, requireAuth: false },
+  performance_leaderboard: { enabled: true, requireAuth: false },
   docs: true,
   about: true,
 }
```

### 改动 2：克隆函数加深拷贝

```diff
 function cloneHeaderNavDefaults(): HeaderNavModules {
   return {
     ...DEFAULT_HEADER_NAV_MODULES,
     pricing: { ...DEFAULT_HEADER_NAV_MODULES.pricing },
     rankings: { ...DEFAULT_HEADER_NAV_MODULES.rankings },
+    performance_leaderboard: { ...DEFAULT_HEADER_NAV_MODULES.performance_leaderboard },
   }
 }
```

### 改动 3：解析函数加显式分支

```diff
   Object.entries(parsed).forEach(([key, value]) => {
     if (key === 'pricing') {
       result.pricing = parseAccess(value, result.pricing)
       return
     }
     if (key === 'rankings') {
       result.rankings = parseAccess(value, result.rankings)
       return
     }
+    if (key === 'performance_leaderboard') {
+      result.performance_leaderboard = parseAccess(value, result.performance_leaderboard)
+      return
+    }

     const fallback = result[key]
     // ... generic fallback unchanged
   })
```

## 为什么不需要后端改动

前端 `cloneHeaderNavDefaults()` 的默认值保证了：即使后端返回的 JSON 中没有 `performance_leaderboard`，解析结果仍然包含默认值 `{enabled: true, requireAuth: false}`。如果后端有该字段，`parseAccess` 会正确解析。

## 修改文件清单

| 文件路径 | 修改说明 |
|---------|---------|
| `web/default/src/lib/nav-modules.ts` | 默认值、克隆函数、解析分支各加 1 行，共约 5 行 |

## 方案对比

| 对比项 | 初版方案（已废弃） | 最终方案 |
|---|---|---|
| 后端改动 | `controller/misc.go` 新增 ~20 行 JSON 解析/注入逻辑 | **无** |
| 前端改动文件 | `nav-modules.ts` + 修改函数参数 | **仅 `nav-modules.ts`** |
| 函数签名变更 | `cloneHeaderNavDefaults` 参数列表变化 | **无** |
| 上游冲突风险 | 高（后端+前端双改） | **极低**（纯增量，不改已有逻辑） |
| 核心思路 | 后端兜底注入 + 前端克隆 | 前端解析层补齐缺失的显式分支 |
