# 采样执行日志 — 任务清单

## 背景

将性能采样的「聚合记录」替换为「执行日志」。

- 执行日志已写入 `logs` 表（`token_name="模型测试"`）
- 前端复用 `usage-logs` 组件链
- 后端删除采样记录专用代码，保留模型广场使用的 `perf_metrics` 系统

---

## 一、删除（后端）

| # | 文件 | 删除内容 | 说明 |
|---|------|----------|------|
| 1 | `router/api-router.go` L38 | `perfMetricsRoute.GET("/list", controller.GetPerfMetricsList)` | 路由注册 |
| 2 | `controller/perf_metrics.go` L91-L152 | `GetPerfMetricsList()` 函数 | 控制器 |
| 3 | `model/perf_metric.go` L56-L67, L69+ | `PerfMetricRow` 结构体 + `GetPerfMetricsList()` 函数 | 模型层 |

> `perf_metrics` 表、`UpsertPerfMetric`、`GetPerfMetricsSummary`、`GetPerfMetrics` 等**保留**（模型广场仍在使用）。

---

## 二、删除（前端）

| # | 文件 | 删除内容 |
|---|------|----------|
| 4 | `web/default/src/features/system-settings/models/sampling-records-table.tsx` | 整个文件删除 |
| 5 | `web/default/src/features/performance-metrics/api.ts` L17-L27 | `getPerfMetricsList()` 函数 |
| 6 | `web/default/src/features/performance-metrics/types.ts` L62-L84 | `PerfMetricRow` + `PerfMetricsListResult` 类型 |

---

## 三、新建（前端）

| # | 文件 | 说明 |
|---|------|------|
| 7 | `web/default/src/features/system-settings/models/sampling-logs-section.tsx` | 复用使用日志组件，预置 `token_name=模型测试` 筛选，简化 FilterBar |

**复用清单：**

| 组件 | 来源 | 用途 |
|------|------|------|
| `UsageLogsTable` | `usage-logs/components/usage-logs-table.tsx` | 表格渲染 + 分页 + 行详情 |
| `CommonLogsColumns` | `usage-logs/components/columns/common-logs-columns.tsx` | 列定义 |
| `CommonLogsFilterBar` | `usage-logs/components/common-logs-filter-bar.tsx` | 筛选栏（隐藏 username/token/requestId） |
| `DetailsDialog` | `usage-logs/components/dialogs/details-dialog.tsx` | 行展开详情 |
| `UsageLogsProvider` | `usage-logs/components/usage-logs-provider.tsx` | 脱敏 context |
| `getAllLogs` API | `usage-logs/api.ts` | 传入 `token_name=模型测试` |

---

## 四、修改（前端）

| # | 文件 | 改动 |
|---|------|------|
| 8 | `web/default/src/features/system-settings/models/sampling-section.tsx` | 移除 `SamplingRecordsTable`、`getPerfMetricsList`、`PerfMetricRow` 的 import；替换为 `<SamplingLogsSection />` |

---

## 执行顺序

```
4 → 5,6 → 7 → 8 → 1,2,3
```

1. 先删前端旧文件（4）
2. 删前端旧类型/函数（5,6）
3. 新建采样日志组件（7）
4. 修改 sampling-section.tsx 接入新组件（8）
5. 最后清理后端（1,2,3）
