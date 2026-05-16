# hotBuckets 移除实施任务文档

## 任务概览

| 项目 | 内容 |
|------|------|
| **分析文档** | `docs/hotbuckets-removal-analysis.md` |
| **改动范围** | 5 个文件，净减约 395 行代码 |
| **预计耗时** | 2-3 小时 |
| **风险等级** | 中等（涉及核心性能指标系统） |
| **Commit数量** | 1 个（原子提交） |

---

## 背景

当前性能指标系统采用三层写入架构：

```
Relay 请求
  ├→ hotBuckets（内存 sync.Map）← 查询时合并，提供实时数据
  └→ Redis（hash，1 小时过期）← 多实例聚合用
          ↓
  每 5 分钟 flushLoop → DB（perf_metrics 表，upsert 累加）
          ↓
  清空已 flush 的 hotBuckets
```

**问题**：当前 bucket 的数据只在内存中，刷新页面后不可见（最多延迟 5 分钟）。

**解决方案**：移除 hotBuckets，Record() 直接写入 DB，简化架构。

---

## Task 1: 修改 `pkg/perf_metrics/types.go`

### 删除内容

**删除的类型（约 85 行）：**

```go
// PerfMetricRow — 删除（仅 hotBuckets 查询用）
type PerfMetricRow struct {
    ModelName      string
    Group          string
    BucketTs       int64
    RequestCount   int64
    SuccessCount   int64
    AvgLatencyMs   float64
    TtftMs         float64
    OutputTokens   int64
    GenerationMs   float64
}

// PerfMetricSummaryRow — 删除（仅 hotBuckets 查询用）
type PerfMetricSummaryRow struct {
    ModelName    string
    RequestCount int64
    SuccessCount int64
    AvgLatencyMs float64
    AvgTtftMs    float64
    OutputTokens int64
    GenerationMs float64
}

// bucketKey — 删除（hotBuckets 的 key）
type bucketKey struct {
    model    string
    group    string
    bucketTs int64
}

// counters — 删除（hotBuckets 内部计数器）
type counters struct {
    requestCount   int64
    successCount   int64
    totalLatencyMs int64
    ttftSumMs      int64
    ttftCount      int64
    outputTokens   int64
    generationMs   int64
}

// atomicBucket — 删除（hotBuckets 的 value）
type atomicBucket struct {
    counters atomic.Value // 存储 *counters
}

// atomicBucket 方法 — 全部删除
func (b *atomicBucket) add(sample Sample) {
    // ... 约 20 行
}

func (b *atomicBucket) snapshot() counters {
    // ... 约 10 行
}

func (b *atomicBucket) drain() counters {
    // ... 约 15 行
}

func (b *atomicBucket) addCounters(c counters) {
    // ... 约 10 行
}
```

**修改 DBFuncs 结构体：**

```diff
  var DBFuncs struct {
-     UpsertPerfMetric      func(metric *PerfMetricData) error
-     DeleteBefore          func(cutoffTs int64) error
-     GetPerfMetrics        func(modelName string, group string, startTs int64, endTs int64) ([]PerfMetricRow, error)
-     GetPerfMetricsSummary func(startTs int64, endTs int64) ([]PerfMetricSummaryRow, error)
+     UpsertPerfMetric func(metric *PerfMetricData) error
+     DeleteBefore     func(cutoffTs int64) error
  }
```

---

## Task 2: 修改 `pkg/perf_metrics/metrics.go`

### 删除变量和导入

```diff
  import (
-     "context"
-     "fmt"
      "math"
      "sort"
-     "sync"
      "time"
  
      "github.com/QuantumNous/new-api/common"
      relaycommon "github.com/QuantumNous/new-api/relay/common"
      "github.com/QuantumNous/new-api/setting/perf_metrics_setting"
  )
  
- var hotBuckets sync.Map
-
```

### 修改 Init() 函数

```diff
  func Init() {
-     go flushLoop()
+     go cleanupLoop()  // 改为只做定期清理
  }
```

### 重写 Record() 函数

**原代码（约 35 行）：**

```go
func Record(sample Sample) {
    // ... 参数校验 ...

    key := bucketKey{
        model:    sample.Model,
        group:    sample.Group,
        bucketTs: bucketStart(time.Now().Unix()),
    }
    actual, _ := hotBuckets.LoadOrStore(key, &atomicBucket{})
    actual.(*atomicBucket).add(sample)
    recordRedis(key, sample)
}
```

**新代码（约 25 行）：**

```go
func Record(sample Sample) {
    // ... 参数校验不变 ...

    // 直接写入 DB
    bucketTs := time.Now().Unix() / perf_metrics_setting.GetBucketSeconds() * perf_metrics_setting.GetBucketSeconds()
    _ = DBFuncs.UpsertPerfMetric(&PerfMetricData{
        ModelName:      sample.Model,
        Group:          sample.Group,
        BucketTs:       bucketTs,
        RequestCount:   1,
        SuccessCount:   boolToInt(sample.Success),
        TotalLatencyMs: sample.LatencyMs,
        TtftSumMs:      sample.TtftMs,
        TtftCount:      boolToInt(sample.HasTtft && sample.TtftMs >= 0),
        OutputTokens:   sample.OutputTokens,
        GenerationMs:   sample.GenerationMs,
    })
}
```

### 修改 Query() 函数

**删除 hotBuckets 合并（约 20 行）：**

```diff
  func Query(params QueryParams) (QueryResult, error) {
      // ... 时间计算不变 ...
  
-     merged := map[bucketKey]counters{}
-     rows, err := DBFuncs.GetPerfMetrics(params.Model, params.Group, startTs, endTs)
+     rows, err := getPerfMetrics(params.Model, params.Group, startTs, endTs)
      if err != nil {
          return QueryResult{}, err
      }
-     for _, row := range rows {
-         mergeCounters(merged, bucketKey{...}, counters{...})
-     }
  
-     hotBuckets.Range(func(key, value any) bool {
-         // ... 约 15 行合并逻辑 ...
-     })
  
-     return buildQueryResult(params.Model, merged), nil
+     return buildQueryResultFromRows(params.Model, rows), nil
  }
```

### 修改 QuerySummaryAll() 函数

**删除 hotBuckets 合并（约 15 行）：**

```diff
  func QuerySummaryAll(hours int) (SummaryAllResult, error) {
      // ... 时间计算不变 ...
  
-     rows, err := DBFuncs.GetPerfMetricsSummary(startTs, endTs)
+     rows, err := getPerfMetricsSummary(startTs, endTs)
      // ... 处理 rows ...
  
-     hotBuckets.Range(func(key, value any) bool {
-         // ... 约 10 行合并逻辑 ...
-     })
  
      // ... 后续逻辑不变 ...
  }
```

### 删除的辅助函数（约 80 行）

```go
// bucketStart — 删除
func bucketStart(ts int64) int64 {
    bucketSecs := perf_metrics_setting.GetBucketSeconds()
    return ts / bucketSecs * bucketSecs
}

// HotBucketCounters — 删除
type HotBucketCounters struct {
    ModelName      string
    RequestCount   int64
    SuccessCount   int64
    TtftSumMs      int64
    TtftCount      int64
    OutputTokens   int64
    GenerationMs   int64
}

// MergeCurrentBucket — 删除
func MergeCurrentBucket() map[string]HotBucketCounters {
    // ... 约 25 行
}

// MergeHotBuckets — 删除
func MergeHotBuckets(startTs, endTs int64) map[string]HotBucketCounters {
    // ... 约 30 行
}

// mergeCounters — 删除
func mergeCounters(merged map[bucketKey]counters, key bucketKey, value counters) {
    // ... 约 15 行
}

// recordRedis — 删除
func recordRedis(key bucketKey, sample Sample) {
    // ... 约 20 行
}

// mergeRedisActiveBuckets — 删除
func mergeRedisActiveBuckets(merged map[bucketKey]counters, startTs, endTs int64) {
    // ... 约 25 行
}

// redisBucketKey — 删除
func redisBucketKey(key bucketKey) string {
    // ... 约 5 行
}

// redisCounters — 删除
func redisCounters(values map[string]string) counters {
    // ... 约 15 行
}

// parseRedisInt — 删除
func parseRedisInt(value string) int64 {
    // ... 约 10 行
}
```

---

## Task 3: 修改 `pkg/perf_metrics/flush.go`

### 重写整个文件（约 65 行变 20 行）

**原代码（约 65 行）：**

```go
func flushLoop() {
    for {
        interval := perf_metrics_setting.GetFlushIntervalMinutes()
        time.Sleep(time.Duration(interval) * time.Minute)
        setting := perf_metrics_setting.GetSetting()
        if !setting.Enabled {
            continue
        }
        flushCompletedBuckets()
        cleanupExpiredMetrics(setting.RetentionDays)
    }
}

func flushCompletedBuckets() {
    currentBucket := bucketStart(time.Now().Unix())
    hotBuckets.Range(func(key, value any) bool {
        k := key.(bucketKey)
        if k.bucketTs >= currentBucket {
            return true
        }
        bucket := value.(*atomicBucket)
        drained := bucket.drain()
        err := DBFuncs.UpsertPerfMetric(&PerfMetricData{...})
        if err != nil {
            bucket.addCounters(drained)
        }
    })
}
```

**新代码（约 20 行）：**

```go
func cleanupLoop() {
    for {
        time.Sleep(24 * time.Hour)
        setting := perf_metrics_setting.GetSetting()
        if !setting.Enabled {
            continue
        }
        cleanupExpiredMetrics(setting.RetentionDays)
    }
}
```

**保留的函数：**

```go
func cleanupExpiredMetrics(retentionDays int) {
    // 保留不变
}
```

**删除的函数：**

```go
func flushCompletedBuckets()          // ~35 行
defunc deleteOldEmptyBucket(...)     // ~15 行
func redisCounters(...)               // ~10 行
func parseRedisInt(...)              // ~5 行
```

---

## Task 4: 修改 `model/perf_metric.go`

### 4.1 删除 `QueryPerfMetricsWithHotBuckets`（L142-199，58 行）

```go
// 该函数无任何调用者，是死代码，直接删除
func QueryPerfMetricsWithHotBuckets(...) ([]PerfMetricPoint, error) {
    // ... 58 行代码
}
```

### 4.2 删除 `QueryPerfMetricsSummaryWithHotBuckets`（L201-246，45 行）

```go
// 该函数无任何调用者，是死代码，直接删除
func QueryPerfMetricsSummaryWithHotBuckets(...) ([]ModelSummary, error) {
    // ... 45 行代码
}
```

### 4.3 `GetLeaderboardData` 删除 Step 1.5（L286-311，26 行）

**原代码：**

```go
func GetLeaderboardData(startTs int64, endTs int64, vendorId int, sortBy string, sortOrder string) ([]LeaderboardItem, error) {
    // Step 1: 从 perf_metrics 按 model_name 聚合
    var aggRows []LeaderboardAggRow
    query := DB.Model(&PerfMetric{}).
        // ... SQL 不变 ...

    if err := query.Find(&aggRows).Error; err != nil {
        return nil, err
    }

    // Step 1.5: 合并内存中的 hotBuckets（未 flush 到 DB 的最新数据）
    hotData := perfmetrics.MergeHotBuckets(startTs, endTs)
    aggMap := make(map[string]*LeaderboardAggRow, len(aggRows))
    for i := range aggRows {
        aggMap[aggRows[i].ModelName] = &aggRows[i]
    }
    for model, hot := range hotData {
        row, exists := aggMap[model]
        if !exists {
            row = &LeaderboardAggRow{ModelName: model}
            aggMap[model] = row
        }
        row.RequestCount += hot.RequestCount
        row.SuccessCount += hot.SuccessCount
        row.TtftSumMs += hot.TtftSumMs
        row.TtftCount += hot.TtftCount
        row.OutputTokens += hot.OutputTokens
        row.GenerationMs += hot.GenerationMs
    }
    // 重建 aggRows
    aggRows = make([]LeaderboardAggRow, 0, len(aggMap))
    for _, row := range aggMap {
        if row.RequestCount > 0 {
            aggRows = append(aggRows, *row)
        }
    }
    if len(aggRows) == 0 {
        return []LeaderboardItem{}, nil
    }
    // ... 后续逻辑 ...
}
```

**新代码：**

```go
func GetLeaderboardData(startTs int64, endTs int64, vendorId int, sortBy string, sortOrder string) ([]LeaderboardItem, error) {
    // Step 1: 从 perf_metrics 按 model_name 聚合
    var aggRows []LeaderboardAggRow
    query := DB.Model(&PerfMetric{}).
        // ... SQL 不变 ...

    if err := query.Find(&aggRows).Error; err != nil {
        return nil, err
    }

    if len(aggRows) == 0 {
        return []LeaderboardItem{}, nil
    }
    // ... 后续逻辑不变 ...
}
```

### 4.4 清理 import

```diff
  import (
      "fmt"
      "sort"
      "time"
  
-     perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
      "github.com/QuantumNous/new-api/setting/perf_metrics_setting"
      "gorm.io/gorm"
      "gorm.io/gorm/clause"
  )
```

---

## Task 5: 修改 `model/perf_metrics_registry.go`

### 删除两个 DB 函数注册（约 25 行）

```diff
  func RegisterPerfMetricsDB() {
      perfmetrics.DBFuncs.UpsertPerfMetric = func(metric *perfmetrics.PerfMetricData) error {
          // 保留不变
      }
  
      perfmetrics.DBFuncs.DeleteBefore = func(cutoffTs int64) error {
          // 保留不变
      }
  
-     perfmetrics.DBFuncs.GetPerfMetrics = func(modelName string, group string, startTs int64, endTs int64) ([]perfmetrics.PerfMetricRow, error) {
-         // ... 约 20 行 SQL 查询 ...
-     }
-
-     perfmetrics.DBFuncs.GetPerfMetricsSummary = func(startTs int64, endTs int64) ([]perfmetrics.PerfMetricSummaryRow, error) {
-         // ... 约 15 行 SQL 查询 ...
-     }
  }
```

---

## Task 6: 验证与测试

### 编译检查

```bash
# 1. 编译检查
go build ./...

# 2. 静态分析
go vet ./...

# 3. 检查是否有 import cycle
go list -deps ./pkg/perf_metrics/... | head -20
```

### 功能验证

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|----------|
| 编译通过 | `go build ./...` | 无错误 |
| 无 import cycle | `go list -deps ./...` | 正常输出 |
| Record() 写入 DB | 触发 relay 请求后查询 DB | 数据存在 |
| Query() 返回数据 | 调用模型广场 API | 返回正确数据 |
| QuerySummaryAll() 返回数据 | 调用性能概览 API | 返回正确数据 |
| GetLeaderboardData() 返回数据 | 调用排行榜 API | 返回正确数据 |
| 过期数据清理 | 等待或手动触发 cleanup | 过期数据被删除 |
| 多实例一致性 | 多实例部署测试 | 数据一致 |

### API 端点验证

```bash
# 1. 触发 relay 请求（产生性能数据）
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "hello"}]}'

# 2. 立即查询模型广场（应能看到新数据）
curl http://localhost:3000/api/perf-metrics/query?model=gpt-3.5-turbo

# 3. 查询排行榜
curl http://localhost:3000/api/perf-metrics/leaderboard

# 4. 查询性能概览
curl http://localhost:3000/api/perf-metrics/summary
```

---

## 文件改动总览

| 文件 | 改动类型 | 净减行数 | 关键改动 |
|------|----------|----------|----------|
| `pkg/perf_metrics/types.go` | 删除类型和方法 | -85 行 | 删除 bucketKey, counters, atomicBucket 等 |
| `pkg/perf_metrics/metrics.go` | 重写 Record(), 删除合并逻辑 | -110 行 | Record() 直接 upsert DB；删除 hotBuckets.Range |
| `pkg/perf_metrics/flush.go` | 重写整个文件 | -65 行 | flushLoop → cleanupLoop |
| `model/perf_metric.go` | 删除函数和合并逻辑 | -100 行 | 删除 2 个死函数 + GetLeaderboardData hotBuckets 合并 |
| `model/perf_metrics_registry.go` | 删除注册函数 | -25 行 | 删除 GetPerfMetrics/GetPerfMetricsSummary 注册 |
| **总计** | | **-395 行** | |

---

## 架构变化对比

### 移除前

```
Relay 请求
  ├→ hotBuckets（内存 sync.Map）← 查询时合并
  ├→ Redis（hash，1 小时过期）← 多实例聚合
  └→ 等待 5 分钟 flush → DB
```

**问题**：
- 刷新页面后，当前 bucket 数据不可见（最多 5 分钟延迟）
- 需要复杂的 hotBuckets 合并逻辑
- 多实例需要 Redis 聚合层

### 移除后

```
Relay 请求
  └→ 直接 upsert DB

查询
  └→ 直接查 DB
```

**优势**：
- 数据立即可见
- 代码简化 395 行
- 单/多实例都天然一致
- 不再需要 Redis 层

---

## Commit 信息

```
refactor(perf_metrics): remove hotBuckets to simplify architecture

BREAKING CHANGE: Remove hotBuckets (sync.Map) from perf_metrics system

Changes:
- pkg/perf_metrics/types.go: Remove bucketKey, counters, atomicBucket types
- pkg/perf_metrics/metrics.go: Record() now writes directly to DB
- pkg/perf_metrics/flush.go: Replace flushLoop with cleanupLoop
- model/perf_metric.go: Remove hotBuckets merging, delete 2 unused functions
- model/perf_metrics_registry.go: Remove GetPerfMetrics/GetPerfMetricsSummary

Benefits:
- 395 lines of code removed
- Data immediately visible after request (no 5-min delay)
- Consistent data across all instances
- Simplified architecture, easier to maintain

Migration:
- No DB migration needed
- Existing data in perf_metrics table remains valid
- Config FlushInterval is now ignored (cleanup interval is fixed at 24h)
```

---

## 注意事项

### 1. FlushInterval 配置

`FlushInterval` 配置项在去掉 hotBuckets 后不再需要。推荐保留但标记为 deprecated，避免破坏现有配置文件。

### 2. 性能影响

- **每次请求**：多一次 DB upsert（对大多数部署可接受）
- **QPS 很高时**（每秒数百请求）：可能需要考虑批量写入
- **权衡**：用可接受的写入开销换取架构简洁性

### 3. 数据一致性

移除后数据一致性天然保证：
- 单实例：所有请求写同一个 DB
- 多实例：所有实例写同一个 DB
- 刷新页面：数据已在 DB，立即可见
