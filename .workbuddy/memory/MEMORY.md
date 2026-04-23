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
