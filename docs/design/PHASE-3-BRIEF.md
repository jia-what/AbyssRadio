# Phase 3 交接简报（续接用）

> 用途：新会话先读本文件 + `README.md` + `docs/design/AI Radio — Experience & Design Vision.md`，即可无缝接续 Phase 3。

## 复制给新会话的开场话术

```
先读 docs/design/PHASE-3-BRIEF.md、README.md 和 docs/design/AI Radio — Experience & Design Vision.md，然后开始 Phase 3。

Phase 2 已提交完成：右侧 PlaylistColumn 已改为 SpatialStack 3D 堆叠（滚轮磁吸、详情切歌曲列表、播放歌单/播放按钮）；鼠标进入右侧栏有整屏聚焦倾斜，离开右侧 420px 热区立即收回；封面经 CoverThumb + 后端 song/detail 批量补全已可用（走 /api/img 代理，首次加载偏慢可接受）。主背景为静态渐变（SpatialUniverse 星云已删，太卡）；useSpatialOrbit 拖拽视差仍保留。SpatialStack.onFocusItem 已留接口供 PULSE。

Phase 3 目标：左侧 AIColumn 重做为 SignalColumn AI 信号流 + 与粒子 PULSE 联动（真正封面粒子场在 Phase 4）。
```

## 当前状态（Phase 2 完成后）

- **Git**：`master` 上应有 `Phase 2: …` 提交点（本文件同批或紧随其后）。
- **在用的目录**：前端 `ai-radio-v1/`、后端 `ai-radio/server/`。
- **启动**：根目录 `start.bat`（清 4000/3000 后拉起前后端）。

### Phase 1（已完成，勿动歌词淡入淡出）
- 空间布局 `SpatialLayout` + `useEdgePanels`（左/底 1s 收回；**右侧 0ms 立即收回**）
- Cookie 绑定 + 网易云歌单 + VIP 取流 + `playPlaylist()` 整单按序
- `LyricLight` 三行滚动 + 逐字卡拉OK（**不要加回淡入淡出**）

### Phase 2（已完成）
| 能力 | 实现 |
|------|------|
| 右侧 3D 歌单/歌曲堆叠 | `SpatialStack.tsx` + `PlaylistColumn.tsx` |
| 滚轮磁吸切换 | 累积阈值 + spring |
| 歌单→歌曲 | 「详情」切换视图淡入淡出；「播放歌单」直接开播 |
| 聚焦卡片 | 封面 + 播放歌单/详情；歌曲行仅「播放」 |
| 右侧聚焦倾斜 | `SpatialLayout` + `App`；歌单栏 HUD 不随拖拽转 |
| 右侧热区 | `RIGHT_ZONE_WIDTH = 420`（`useEdgePanels.ts`） |
| 封面 | `CoverThumb`（`<img>`）；`login.mjs` 批量 `song/detail`；`img.ts` http→https |
| liquid-glass 遮挡修复 | `globals.css`：`::before` z-index + 子元素 z-index |
| PULSE 钩子 | `SpatialStack.onFocusItem`（Phase 3/4 接） |
| 空间拖拽 | `useSpatialOrbit`（轻量视差，非真 3D 星云） |

> 📷 参考图：`images/主屏幕样式.png`、`images/右侧歌单状态栏.png`、`images/歌单展开后歌曲状态栏.png`

### 已知遗留 / 可优化（非阻塞）
- 封面首次经 `/api/img` 代理较慢（有 24h 缓存）；可后续做懒加载/缩略图
- `BioParticles.tsx` 仍在仓库但未使用；Phase 4 用 `CoverParticleField` 替换
- 酷狗歌单 → Phase 5；开场动画 → Phase 6

## Phase 3 目标：左侧 SignalColumn + PULSE 联动

（详见设计愿景文档）

- 将 `AIColumn.tsx` 升级为 **SignalColumn** 风格的 AI 信号流 UI
- 与背景/播放状态 **PULSE** 联动（可先接 `SpatialStack.onFocusItem`、当前曲 cover、播放进度等）
- 真正「专辑封面采样粒子背景」在 **Phase 4**，Phase 3 先做信号流 + 联动接口/占位

### 主要改动文件（预期）
- `ai-radio-v1/src/components/columns/AIColumn.tsx`（或新建 `SignalColumn.tsx`）
- `ai-radio-v1/src/components/layout/SpatialLayout.tsx`
- 可能扩展 `useRadioState` / 全局 PULSE 上下文
- `SpatialStack.tsx` 的 `onFocusItem` 可接到 PULSE

## 环境坑（务必遵守）

- PowerShell 会吞 `$` 变量 → 用纯路径/git/node，链式用 `;` 不用 `&`
- 端口 4000 残留旧后端 → `start.bat` 或 `taskkill` 后再起
- 改后端需重启；前端 Vite 热更新
- 封面统一 `/api/img` + `utils/img.ts`；歌单播放走 `playPlaylist()`

## 后续路线图

- **Phase 4**：`CoverParticleField` 封面粒子 + Web Audio 鼓点 + 切歌过渡
- **Phase 5**：酷狗歌单 API
- **Phase 6**：开场动画 + localStorage 跳过记忆
