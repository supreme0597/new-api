## 技术决策记录

### 2026-05-08: 修复 React 19 + use-sync-external-store polyfill 冲突
- **问题**：`@tanstack/react-store@0.9.3`（@tanstack/react-router 间接依赖）硬依赖 `use-sync-external-store@1.6.0` polyfill，与 React 19 内置 API 冲突，导致 TanStack Invariant failed
- **修复**：在 `rsbuild.config.ts` 中添加别名 `'use-sync-external-store': 'react'`
- **长期方案**：升级 @tanstack/react-router 到 v2（已移除 polyfill 依赖）
- **涉及 polyfill 的依赖**：@tanstack/react-store、@base-ui/react、react-i18next、react-redux、zustand 4.x（@xyflow 嵌套）、swr
