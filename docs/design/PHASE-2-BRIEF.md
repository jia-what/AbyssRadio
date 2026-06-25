# Phase 2 交接简报（续接用）

> 用途：上下文重置后，新会话先读本文件 + `README.md` + `docs/design/AI Radio — Experience & Design Vision.md`，即可无缝接续 Phase 2。

## 当前状态（基线）

- Git 基线提交：`chore: initial baseline`（master），工作区干净。
- 在用目录：**前端 `ai-radio-v1/`**、**后端 `ai-radio/server/`**。其余为 `docs/`、`prototypes/`、`_archive/`（死代码，未跟踪）。
- 启动：根目录 `start.bat`（清 4000/3000 端口后同时拉起前后端）。

### 已完成
- Phase 1a：空间布局 `SpatialLayout` + `useEdgePanels`（鼠标贴边浮出，离开 1s 收回）。中间 `LyricLight`、底部 `BottomBar`、左 `AIColumn`、右 `PlaylistColumn`。
- Phase 1b：Cookie 会话绑定（`session.mjs` + `/api/session/bind`）+ 网易云歌单（`login.mjs`）。
- Phase 1c：VIP 取流用会话 Cookie（`ncm-neapi.mjs`）；`useRadioState.playPlaylist()` 让队列=整张歌单按序、按 id+source 精确取流。
- 歌词重做：`LyricLight.tsx` 三行滚动 + `CharFill` 逐字卡拉OK，rAF 60fps 平滑，按演唱节奏封顶高光。**已去掉淡入淡出，不要再加回。**

## Phase 2 目标：右侧 3D SpatialStack

把当前 `PlaylistColumn.tsx` 的扁平列表，升级为参考图里的效果：
- 歌单 / 歌曲共用一套 **3D 倾斜卡片堆叠**（rotateY 透视 + scale + translateZ）。
- **滚轮上下切换**，带磁吸感。
- **点击某歌单 → 展开其歌曲列表**（同一套堆叠呈现）。
- **悬停放大/预览**，点击播放。
- 与背景粒子联动（PULSE）的钩子先留接口，真正粒子背景在 Phase 4。

> ⚠️ 新会话务必让用户**重新发一次 Phase 2 的参考截图**（3 张：歌单堆叠、悬停放大、点进歌曲展开）。图片不会跨会话保留。

### 主要改动文件
- `ai-radio-v1/src/components/columns/PlaylistColumn.tsx`（核心：列表→3D 堆叠）
- 可能新增 `components/columns/SpatialStack.tsx` 之类的子组件
- `ai-radio-v1/src/hooks/useRadioState.ts`（`playPlaylist` 已就绪，按需扩展）
- 封面问题在本阶段一并处理（见下）

### 封面问题（从 Phase 1 顺延到这里）
- 已做：`utils/img.ts` 经 `/api/img` 代理 + 兼容协议相对 URL（`//host`）。后端 `/api/img` 已验证可用。
- 若侧栏封面仍为空：很可能是网易云 `playlistDetail` 返回的 track 缺 `al.picUrl`。备选方案：后端对歌单内 trackId 批量调 `song/detail` 补全封面。绑定后看 `getNeteaseTracksByCookie` 实际返回值再定。

## 待用户确认的设计点（开新会话时先问）
1. 堆叠可见卡片数 / 倾斜角度 / 间距风格？
2. 切换交互：滚轮旋转堆叠，还是拖拽？
3. 歌单→歌曲：原地展开，还是切换视图？
4. 悬停是"放大预览"还是"试听"，点击才正式播放？

## 本项目环境/约定（踩过的坑，务必遵守）
- **本 agent 终端会吞掉 PowerShell 的 `$` 变量**（`$_`、`$p` 等会变空）。写命令避免用 PS 变量；用通配符路径、`-LiteralPath`、或纯 git/node 命令。`&` 不能链式，用 `;`。
- **端口 4000 常有残留旧后端**：现象是新代码不生效（接口 404 / 行为像旧版）。先 `Get-NetTCPConnection -LocalPort 4000` 查 PID，`taskkill /F /PID <pid>` 清掉再起；或直接用 `start.bat`（自带清理）。
- 改完后端需重启才生效；改前端 vite 热更新。
- 没有为 `_archive/` 做 git 备份（被忽略），需要时再处理。
- 验证前端改动用 `ReadLints`；后端启动确认打印 `Abyss Radio API running on http://localhost:4000`。

## 后续阶段（Phase 2 之后）
- Phase 3：左侧 `SignalColumn` AI 信号流重做 + 粒子 PULSE 联动。
- Phase 4：`CoverParticleField` 专辑封面采样粒子背景 + Web Audio 鼓点 + 切歌过渡（替换当前 `BioParticles`）。
- Phase 5：酷狗歌单 API（移植 `/v7/get_all_list` Android 签名链路）。
- Phase 6：可灵式开场动画 + `localStorage` 跳过记忆（参考 `prototypes/opening_sequence.html`）。
