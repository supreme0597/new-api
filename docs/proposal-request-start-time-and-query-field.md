# 使用日志增加请求开始时间与范围查询模式 — 实施方案（v3）

> 本文档在 v2 基础上的**语义调整**：
> 1. 使用日志和性能排行榜的"开始时间"语义从 `request_time`（请求进入网关）调整为 `model_start_time`（模型调用开始），"结束时间"从 `created_at` 调整为 `model_end_time`（模型调用结束）
> 2. `time_field` 支持 4 个值：`created_at` / `model_start_time` / `model_end_time` / `request_time`（向后兼容）
> 3. `perf_metrics.start_bucket_ts` 改为基于 `info.ModelStartTime` 计算（有零值兜底到 `info.StartTime`）

---

## 1. 背景与目标

### 1.1 使用日志（与 v1 一致）

`Log` 表中只有 `created_at`（≈ 请求结束时间）和 `use_time`（耗时秒数）。**没有真实持久化的"请求开始时间"**。

目标：
1. 持久化 3 个新时间戳字段到 `Log` 表：`request_time`、`model_start_time`、`model_end_time`
2. 使用日志的"开始时间"=`model_start_time`，"结束时间"=`model_end_time`（而非 `request_time` / `created_at`）
3. 查询 API 支持 `time_field` 参数切换查询维度
4. 前端展示增加新列 + 切换标识

### 1.2 性能排行榜

`perf_metrics` 表使用 `bucket_ts`（时间桶）做预聚合，当前按"请求结束时间"（`time.Now()`）分桶。

目标：
1. **指标计算不变**：TPS、TTFT、延迟、成功率的计算逻辑保持现状，误差 ~17-106ms 可接受
2. **查询支持 `time_field`**：新增 `start_bucket_ts` 字段，基于 `info.ModelStartTime` 分桶，支持按"模型调用开始时间"范围查询
3. 前端排行榜页面增加 `time_field` 切换

---

## 2. 性能排行榜现状分析

### 2.1 数据写入链路

```
adaptor.DoResponse() 返回
  ↓
PostTextConsumeQuota()（同步）
  ↓
RecordConsumeLog()（同步 DB 写入 logs 表）
  ↓
gopool.Go(RecordRelaySample)（异步 goroutine）
  ↓
Record() 中：
  bucketTs = bucketStart(time.Now().Unix())  ← 按"记录时间"分桶
  hotBuckets[key{model, group, bucketTs}].add(sample)
  ↓
flushLoop（定时，每 N 分钟）：
  遍历 hotBuckets → UpsertPerfMetric → 写入 perf_metrics 表
```

### 2.2 数据查询链路

| 层级 | 文件 | 关键点 |
|------|------|--------|
| 路由 | `router/api-router.go:52-57` | `/api/perf-metrics`、`/api/perf-metrics/summary`、`/api/model-performance` |
| 控制器 | `controller/perf_metrics.go` | `GetPerfMetrics` / `GetPerfMetricsSummary`，接受 `hours` / `start_time` / `end_time` |
| 控制器 | `controller/model_performance.go:15-93` | `GetModelPerformanceList`（排行榜），接受 `hours` / `start_time` / `end_time` |
| 模型 | `model/perf_metric.go:53-89` | `GetPerfMetrics` / `GetPerfMetricsSummary`，按 `bucket_ts` 范围查询 |
| 模型 | `model/perf_metric.go:118-225` | `GetLeaderboardData`，按 `bucket_ts` 范围聚合排行 |

### 2.3 前端

| 文件 | 功能 |
|------|------|
| `web/default/src/features/performance-metrics/api.ts` | `getPerfMetrics` / `getPerfMetricsSummary` |
| `web/default/src/features/performance-metrics/types.ts` | 类型定义 |
| `web/default/src/features/performance-ranking/api.ts` | `getLeaderboard` / `getLeaderboardGroups` |
| `web/default/src/features/performance-ranking/hooks/use-leaderboard.ts` | React Query hook |
| `web/default/src/features/performance-ranking/types.ts` | `LeaderboardTimeRange` 等类型 |
| `web/default/src/features/dashboard/components/performance-overview.tsx` | 性能概览卡片 |
| `web/default/src/features/dashboard/components/model-details-performance.tsx` | 模型性能详情图表 |

---

## 3. 性能排行榜方案

### 3.1 指标计算：不做改动

| 指标 | 当前计算方式 | 误差来源 | 误差量级 | 结论 |
|------|-------------|----------|----------|------|
| `latencyMs` | `time.Now() - StartTime - queueTimeMs` | 包含计费开销 + goroutine 调度 | ~17-106ms | **不改** |
| `ttftMs` | `FirstResponseTime - StartTime - queueTimeMs` | 已经是真实值 | 0ms | 不改 |
| `generationMs` | `time.Now() - FirstResponseTime` | 包含计费开销 | ~17-106ms | **不改** |
| `avgTps` | `outputTokens / (generationMs / 1000)` | 间接受 generationMs 影响 | ~17-106ms | 不改 |
| `successRate` | `successCount / requestCount * 100` | 无时间相关误差 | 0 | 不改 |

> **原因**：误差量级（~100ms）相对于模型调用耗时（通常 1-30s）占比极低（< 1%），对排行榜排名影响可忽略。

### 3.2 查询支持 `time_field`：新增 `start_bucket_ts` 字段

#### 核心思路

当前 `perf_metrics` 表只有 `bucket_ts`（按 `time.Now()` 分桶 ≈ 请求结束时间）。要支持按"请求开始时间"查询，需要**新增一个 `start_bucket_ts` 字段**，记录每个桶内请求的最早开始时间分桶值。

#### 数据库改动

**文件**：`model/perf_metric.go`

```go
type PerfMetric struct {
    // ... 现有字段 ...
    BucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_perf_model_group_bucket,priority:3;index:idx_perf_bucket_ts"`

    // ===== 新增 =====
    // StartBucketTs: 桶内请求的最早开始时间分桶值（用于 time_field=request_time 查询）
    // 索引：使用复合索引 (model_name, start_bucket_ts)，匹配实际查询模式
    //        WHERE model_name = ? AND start_bucket_ts >= ? AND start_bucket_ts <= ?
    // 索引名避免与现有的 idx_perf_model_group_bucket 冲突
    StartBucketTs  int64  `json:"start_bucket_ts" gorm:"default:0;index:idx_perf_model_start_bucket,priority:2;index:idx_perf_model_group_start_bucket,priority:3"`
}
```

> **架构师评审优化**：原方案使用单列索引 `index:idx_perf_start_bucket_ts`，但实际查询是 `WHERE model_name = ? AND start_bucket_ts >= ? AND start_bucket_ts <= ?`，单列索引效果有限。改为复合索引 `(model_name, start_bucket_ts)` 和 `(model_name, group, start_bucket_ts)`，与 leaderboard 的 group 查询对齐。

GORM AutoMigrate 自动加列 + 索引。

#### 数据写入改动

**文件**：`pkg/perf_metrics/types.go`

在 `Sample` 结构体中新增：

```go
type Sample struct {
    // ... 现有字段 ...
    StartBucketTs int64  // ===== 新增：请求开始时间的桶值 =====
}
```

**文件**：`pkg/perf_metrics/metrics.go`

在 `RecordRelaySample` 中计算 `StartBucketTs`：

```go
func RecordRelaySample(info *relaycommon.RelayInfo, success bool, outputTokens int64) {
    // ... 现有逻辑不变 ...

    Record(Sample{
        Model:        info.OriginModelName,
        Group:        info.UsingGroup,
        LatencyMs:    latencyMs,
        TtftMs:       ttftMs,
        HasTtft:      hasTtft,
        Success:      success,
        OutputTokens: outputTokens,
        GenerationMs: generationMs,
        // ===== 新增：按 model_start_time 分桶（向后兼容 info.StartTime） =====
        StartBucketTs: startBucketTsFromInfo(info),
    })
}

// startBucketTsFromInfo 返回基于 ModelStartTime 的桶值
// 若 ModelStartTime 未设置则回退到 StartTime（兼容旧路径 / 异常路径）
func startBucketTsFromInfo(info *relaycommon.RelayInfo) int64 {
    if info == nil {
        return 0
    }
    if !info.ModelStartTime.IsZero() {
        return bucketStart(info.ModelStartTime.Unix())
    }
    if !info.StartTime.IsZero() {
        return bucketStart(info.StartTime.Unix())
    }
    return 0
}
```

**文件**：`pkg/perf_metrics/metrics.go` — `Record()` 函数

在 `atomicBucket.add()` 时追踪最小 `StartBucketTs`，使用 CAS 循环实现并发安全：

```go
func Record(sample Sample) {
    // ... 现有逻辑不变 ...
    key := bucketKey{
        model:    sample.Model,
        group:    sample.Group,
        bucketTs: bucketStart(time.Now().Unix()),  // 结束时间桶（不变）
    }
    actual, _ := hotBuckets.LoadOrStore(key, &atomicBucket{})
    actual.(*atomicBucket).add(sample)
    // ===== 新增：记录最小开始时间桶（CAS 并发安全） =====
    actual.(*atomicBucket).updateMinStartBucket(sample.StartBucketTs)
    recordRedis(key, sample)
}
```

> **架构师评审优化**：`atomicBucket` 需要暴露 `snapshotMinStartBucketTs()` 方法，配合 CAS 实现并发安全。`updateMinStartBucket` 使用 CAS 循环，初始值 0 表示"未设置"：

```go
func (b *atomicBucket) updateMinStartBucket(val int64) {
    for {
        current := b.minStartBucketTs.Load()
        if current != 0 && current <= val {
            return // 已有更小值，无需更新
        }
        if b.minStartBucketTs.CompareAndSwap(current, val) {
            return
        }
    }
}

func (b *atomicBucket) snapshotMinStartBucketTs() int64 {
    return b.minStartBucketTs.Load()
}
```

> **注意**：drain 时需要 Swap 回填原始 min 值而非 0，如果 flush 失败，回填的应该是原始 min 值而非 0。

**文件**：`pkg/perf_metrics/flush.go` — `flushCompletedBuckets()`

在 `UpsertPerfMetric` 时传入 `StartBucketTs`：

```go
err := DBFuncs.UpsertPerfMetric(&PerfMetricData{
    // ... 现有字段 ...
    StartBucketTs: bucket.snapshotMinStartBucketTs(),  // ===== 新增 =====
})
```

`PerfMetricData` 结构体也需加 `StartBucketTs int64` 字段。

**⚠️ 架构师评审修正（缺陷 A）**：`UpsertPerfMetric` 的合并策略必须对 `StartBucketTs` 使用 `LEAST()` 而非 `+`。当 flush 间隔内有多个 goroutine flush 同一个 bucket 的不同批次时，DB 中已有的 `start_bucket_ts` 需要与新 flush 的值取 MIN。

**文件**：`model/perf_metric.go` — `UpsertPerfMetric` 函数修正：

```go
func UpsertPerfMetric(metric *PerfMetric) error {
    if metric == nil || metric.RequestCount == 0 {
        return nil
    }
    return DB.Clauses(clause.OnConflict{
        Columns: []clause.Column{
            {Name: "model_name"},
            {Name: "group"},
            {Name: "bucket_ts"},
        },
        DoUpdates: clause.Assignments(map[string]interface{}{
            "request_count":    gorm.Expr("perf_metrics.request_count + ?", metric.RequestCount),
            "success_count":    gorm.Expr("perf_metrics.success_count + ?", metric.SuccessCount),
            "total_latency_ms": gorm.Expr("perf_metrics.total_latency_ms + ?", metric.TotalLatencyMs),
            "ttft_sum_ms":      gorm.Expr("perf_metrics.ttft_sum_ms + ?", metric.TtftSumMs),
            "ttft_count":       gorm.Expr("perf_metrics.ttft_count + ?", metric.TtftCount),
            "output_tokens":    gorm.Expr("perf_metrics.output_tokens + ?", metric.OutputTokens),
            "generation_ms":    gorm.Expr("perf_metrics.generation_ms + ?", metric.GenerationMs),
            // ===== 修正：StartBucketTs 用 LEAST 而非 + =====
            "start_bucket_ts": gorm.Expr(
                "LEAST(COALESCE(perf_metrics.start_bucket_ts, ?), ?)",
                metric.StartBucketTs, metric.StartBucketTs,
            ),
        }),
    }).Create(metric).Error
}
```

> **跨数据库兼容**：`LEAST` 在 SQLite (3.28+)、MySQL 5.7+、PostgreSQL 9.1+ 均支持。`COALESCE` 处理首次插入时字段为 NULL 的情况。

#### 数据查询改动

**文件**：`model/perf_metric.go`

修改 `GetPerfMetrics` / `GetPerfMetricsSummary` / `GetLeaderboardData`，新增 `timeField string` 参数：

```go
func GetPerfMetrics(modelName string, group string, startTs int64, endTs int64, timeField string) ([]PerfMetric, error) {
    var metrics []PerfMetric
    column := "bucket_ts"
    if timeField == "request_time" || timeField == "model_start_time" {
        column = "start_bucket_ts"
    }
    query := DB.Model(&PerfMetric{}).
        Where("model_name = ? AND "+column+" >= ? AND "+column+" <= ?", modelName, startTs, endTs)
    // ... 其余不变 ...
}
```

> **白名单校验**：`timeField` 允许 `"created_at"` / `"request_time"` / `"model_start_time"` / `"model_end_time"`，其他值回退到 `"created_at"`。`request_time` 与 `model_start_time` 都映射到 `start_bucket_ts`（向后兼容旧客户端传值）。

**⚠️ 架构师评审修正（缺陷 B）**：`pkg/perf_metrics/metrics.go` 中的 `Query()` 和 `QuerySummaryAll()` 函数的内存 hotBuckets 遍历路径也需要支持 `timeField` 过滤。当 `time_field=request_time` 或 `model_start_time` 时，内存路径需要使用 `startBucketTs` 过滤：

```go
// Query() 函数修改
func Query(params QueryParams, timeField string) (QueryResult, error) {
    // ... DB 查询部分不变 ...

    hotBuckets.Range(func(key, value any) bool {
        k := key.(bucketKey)
        if k.model != params.Model || k.bucketTs < startTs || k.bucketTs > endTs {
            return true
        }
        if params.Group != "" && k.group != params.Group {
            return true
        }
        // ===== 新增：memory path timeField 过滤 =====
        if timeField == "request_time" || timeField == "model_start_time" {
            if snap := value.(*atomicBucket).snapshotMinStartBucketTs(); snap < startTs || snap > endTs {
                return true
            }
        }
        mergeCounters(merged, k, value.(*atomicBucket).snapshot())
        return true
    })
    // ...
}
```

> **说明**：hotBuckets 的 key 是 `(model, group, bucketTs)`（结束时间桶），但 `atomicBucket.minStartBucketTs` 存储了该桶内请求的最小开始时间桶。当 `timeField=request_time` 或 `model_start_time` 时，需要额外检查这个值是否在查询范围内。

**文件**：`controller/perf_metrics.go`

```go
func GetPerfMetrics(c *gin.Context) {
    // ... 现有参数解析 ...
    timeField := c.DefaultQuery("time_field", "created_at")
    if timeField != "created_at" && timeField != "request_time" && timeField != "model_start_time" && timeField != "model_end_time" {
        timeField = "created_at"
    }
    // 传给 model 层
}
```

同理修改 `GetPerfMetricsSummary`。

**文件**：`controller/model_performance.go` — `GetModelPerformanceList`

```go
func GetModelPerformanceList(c *gin.Context) {
    // ... 现有参数解析 ...
    timeField := c.DefaultQuery("time_field", "created_at")
    if timeField != "created_at" && timeField != "request_time" && timeField != "model_start_time" && timeField != "model_end_time" {
        timeField = "created_at"
    }
    // 传给 model.GetLeaderboardData(...)
}
```

#### 前端改动

**文件**：`web/default/src/features/performance-ranking/types.ts`

```ts
export interface LeaderboardParams {
    hours?: LeaderboardTimeRange
    start_time?: number
    end_time?: number
    time_field?: 'created_at' | 'request_time'  // ===== 新增 =====
}
```

**文件**：`web/default/src/features/performance-ranking/api.ts`

```ts
export async function getLeaderboard(params: LeaderboardParams = {}) {
    const queryParams: Record<string, string | number> = { ... }
    if (params.time_field) queryParams.time_field = params.time_field  // ===== 新增 =====
    // ...
}
```

**文件**：`web/default/src/features/performance-ranking/index.tsx`

在排行榜页面的时间范围选择器旁，增加与使用日志相同的 `Radio.Group`：

```tsx
<RadioGroup value={timeField} onValueChange={setTimeField}>
  <RadioGroupItem value="created_at" id="tf-end" />
  <Label htmlFor="tf-end">{t('End Time')}</Label>
  <RadioGroupItem value="request_time" id="tf-start" />
  <Label htmlFor="tf-start">{t('Start Time')}</Label>
</RadioGroup>
```

**文件**：`web/default/src/features/performance-metrics/api.ts` — 同步修改 `getPerfMetrics` / `getPerfMetricsSummary`，支持 `time_field` 参数透传。

**i18n**：`i18n/locales/zh-CN.yaml` / `en.yaml` / `zh-TW.yaml` 加翻译：
- `End Time`：结束时间
- `Start Time`：开始时间

---

## 4. 使用日志部分（与 v1 一致）

> 此部分与 v1 方案完全一致，此处仅保留文件清单概要，详细内容见 v1。

### 4.1 Log 模型新增 3 字段

`model/log.go`：`request_time` / `model_start_time` / `model_end_time`

### 4.2 RelayInfo 新增 2 字段

`relay/common/relay_info.go`：`ModelStartTime` / `ModelEndTime`

### 4.3 12 个 relay handler 打点

`compatible_handler.go` / `responses_handler.go` / `gemini_handler.go` / `claude_handler.go` / `image_handler.go` / `audio_handler.go` / `embedding_handler.go` / `rerank_handler.go` / `chat_completions_via_responses.go` / `mjproxy_handler.go` / `websocket.go` / `helper/stream_scanner.go`

> **⚠️ 架构师评审说明**：`helper/stream_scanner.go` 不是 handler，而是共享的流式扫描工具。如果它是 handler 的内部实现（被多个 handler 调用），那么 `ModelStartTime` / `ModelEndTime` 的赋值应该在 handler 层完成（即在调用 stream_scanner 前后），而不是修改 stream_scanner 本身。实施时需确认：是否真的需要修改 stream_scanner？还是在调用它的 handler 中打点更合理？

### 4.4 日志记录函数改造

`model/log.go`：`RecordConsumeLog` / `RecordErrorLog` / `RecordTaskBillingLog` 加参数
`service/text_quota.go` / `service/quota.go` / `service/violation_fee.go`：传入 3 个时间戳

> **⚠️ 架构师评审补充**：错误日志路径（`RecordErrorLog`）在 `controller/relay.go:299` 也被调用。需明确错误日志中 `model_start_time` / `model_end_time` 的赋值策略（是否在 catch 块中也设置）。同时确认 `controller/channel-test.go` 中的 `RecordErrorLog` 调用是否也需要传新参数。

### 4.5 查询 API 加 `time_field`

`controller/log.go`：`GetAllLogs` / `GetUserLogs` 解析 `time_field`
`model/log.go`：`GetAllLogs` / `GetUserLogs` / `SumUsedQuota` / `SumUsedToken` 按 `timeField` 切换 WHERE 列

### 4.6 前端

Schema / 类型 / 列展示 / 详情弹窗 / Filter Bar Radio 切换 / i18n

---

## 5. 文件改动清单汇总

### 5.1 使用日志（与 v1 一致）

| # | 文件 | 改动概要 |
|---|------|----------|
| 1 | `model/log.go` | Log 加 3 字段 + RecordConsumeLogParams / RecordErrorLog / RecordTaskBillingLogParams 加参数 + GetAllLogs / GetUserLogs 加 timeField |
| 2 | `relay/common/relay_info.go` | RelayInfo 加 ModelStartTime / ModelEndTime |
| 3-14 | 12 个 relay handler 文件 | DoRequest 前后打点 |
| 15-17 | `service/quota.go` / `text_quota.go` / `violation_fee.go` | 传 3 个时间戳 |
| 18 | `controller/log.go` | 解析 time_field |
| 19-21 | `controller/relay.go` / `channel-test.go` / `model/sampling_task.go` | RecordErrorLog / RecordTaskBillingLog 传新参数 |
| 22-26 | 前端 5 个文件 | Schema / 类型 / 列 / 详情 / Filter Bar |
| 27-29 | i18n 3 个文件 | 翻译 |

### 5.2 性能排行榜（v2 新增）

| # | 文件 | 改动概要 |
|---|------|----------|
| 1 | `model/perf_metric.go` | PerfMetric 加 StartBucketTs（复合索引）+ UpsertPerfMetric 用 LEAST 合并 + GetPerfMetrics / GetPerfMetricsSummary / GetLeaderboardData 加 timeField 参数 |
| 2 | `model/perf_metrics_registry.go` | **新增**：Upsert 闭包加 StartBucketTs 映射 + GetPerfMetrics / GetPerfMetricsSummary 闭包加 timeField 参数（方案文件清单未列出，架构师评审补充） |
| 3 | `pkg/perf_metrics/types.go` | Sample 加 StartBucketTs + PerfMetricData 加 StartBucketTs + QueryParams 加 timeField |
| 4 | `pkg/perf_metrics/metrics.go` | RecordRelaySample 计算 StartBucketTs + Record() 追踪 minStartBucketTs（CAS）+ Query() / QuerySummaryAll() 内存路径加 timeField 过滤 |
| 5 | `pkg/perf_metrics/flush.go` | UpsertPerfMetric 传入 StartBucketTs |
| 6 | `controller/perf_metrics.go` | GetPerfMetrics / GetPerfMetricsSummary 解析 time_field |
| 7 | `controller/model_performance.go` | GetModelPerformanceList 解析 time_field |
| 8 | `web/.../performance-ranking/types.ts` | LeaderboardParams 加 time_field |
| 9 | `web/.../performance-ranking/api.ts` | getLeaderboard 透传 time_field |
| 10 | `web/.../performance-ranking/index.tsx` | 排行榜页面加 Radio 切换 + "迁移后数据"提示 |
| 11 | `web/.../performance-metrics/api.ts` | getPerfMetrics 透传 time_field |
| 12 | i18n 3 个文件 | 加 End Time / Start Time 翻译 |

---

## 6. 实施步骤

> **架构师评审优化**：原方案先做"模型字段 + DDL"，建议改为先做"数据结构 → 写入 → 读取"的标准顺序，让每一步可独立验证。

### Phase 1：使用日志（4 步，顺序调优后）

1. **RelayInfo 加字段**（纯数据结构，不影响运行）：`relay/common/relay_info.go` 加 `ModelStartTime` / `ModelEndTime`
2. **Log 模型加字段 + AutoMigrate**（DDL 必须在写入前完成）：`model/log.go` 加 3 个时间戳字段
3. **12 个 handler 打点 + 日志记录函数传参**（写入链路）：handler 在 DoRequest 前后设置 `ModelStartTime` / `ModelEndTime`，service 层传 3 个时间戳到 `RecordConsumeLog` 等
4. **查询 API 加 timeField + 前端展示/切换**（读取链路）：`controller/log.go` 解析 `time_field`，`model/log.go` `GetAllLogs` 等切换 WHERE 列，前端 Filter Bar 加 Radio

### Phase 2：性能排行榜（3 步，顺序调优后）

5. **PerfMetric 模型加 StartBucketTs + AutoMigrate**（DDL）：`model/perf_metric.go` 加字段 + 复合索引
6. **perf_metrics 写入链路**（写入）：`Sample` / `PerfMetricData` 加字段 → `RecordRelaySample` 计算 → `Record()` CAS 追踪 → `flush.go` 传值 → `UpsertPerfMetric` 用 LEAST 合并 → `model/perf_metrics_registry.go` 同步注册闭包
7. **查询 API 加 timeField + 前端 Radio 切换**（读取）：`QueryParams` 加 timeField → `GetPerfMetrics` / `GetPerfMetricsSummary` / `Query()` / `QuerySummaryAll()` 支持 timeField → controller 解析 → 前端加 Radio + 迁移后数据提示

> **关键路径**：第 5-6 步实施时必须同时修改 `model/perf_metrics_registry.go`（连接 `pkg/perf_metrics` 和 `model` 的桥梁），原方案文件清单遗漏了这一点。

---

## 7. 兼容性

| 场景 | 行为 |
|------|------|
| 旧客户端不传 time_field | 默认 created_at，行为不变 |
| perf_metrics 旧数据 StartBucketTs=0 | 查询 time_field=request_time 时，旧数据不参与（WHERE start_bucket_ts >= X 不会匹配 0），**合理** |
| 切换后新数据 | StartBucketTs 有值，可正常查询 |
| 历史数据 | 旧数据的 StartBucketTs 为 0，不影响新查询 |

> **⚠️ 架构师评审补充**：当用户查询时间范围完全在迁移之前（例如查询 3 天前的数据），`request_time` 模式会返回空结果，而 `created_at` 模式正常。这是预期行为，但应在前端 UI 上增加提示："请求开始时间模式仅显示迁移后的数据"，避免用户困惑。

---

## 8. 验证清单

### 使用日志
- [ ] 发送请求 → logs 表 4 个时间戳都 > 0
- [ ] 不传 time_field → 行为不变
- [ ] time_field=request_time → 按 request_time 范围过滤
- [ ] 前端 Radio 切换正常
- [ ] 旧数据不报错

### 性能排行榜
- [ ] 发送请求 → perf_metrics 表 StartBucketTs > 0
- [ ] 不传 time_field → 行为不变（按 bucket_ts 查询）
- [ ] time_field=request_time → 按 start_bucket_ts 范围过滤（DB 路径）
- [ ] time_field=request_time → 按 start_bucket_ts 范围过滤（内存 hotBuckets 路径）
- [ ] UpsertPerfMetric 合并时 StartBucketTs 取 LEAST（非 +）
- [ ] 排行榜前端 Radio 切换正常
- [ ] 前端显示"请求开始时间模式仅显示迁移后的数据"提示（request_time 模式下）
- [ ] 旧数据（StartBucketTs=0）在 request_time 模式下不参与排行，合理
- [ ] TPS / TTFT / 延迟数值与改动前基本一致（差异 < 100ms）
- [ ] `model/perf_metrics_registry.go` 闭包注册正确（Upsert + GetPerfMetrics + GetPerfMetricsSummary）

---

## 9. 变更日志

| 日期 | 版本 | 改动 |
|------|------|------|
| 2026-07-07 | v1.0 | 初稿 |
| 2026-07-07 | v2.0 | 新增性能排行榜部分：指标计算不改 + 新增 start_bucket_ts 支持 time_field 查询 |
| 2026-07-07 | v2.1 | **架构师评审修正**：(1) 修正 UpsertPerfMetric 合并策略，StartBucketTs 用 LEAST(COALESCE(...)) 而非 + (2) hotBuckets 内存查询路径增加 timeField 过滤 (3) 复合索引替代单列索引 (4) atomicBucket CAS 并发安全实现 (5) Phase 步骤顺序调优 (6) 补充 model/perf_metrics_registry.go 到文件清单 (7) 前端增加迁移后数据提示 (8) helper/stream_scanner.go 打点位置说明 |
