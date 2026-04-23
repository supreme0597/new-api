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
