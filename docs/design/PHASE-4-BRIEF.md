# Phase 4 交接简报（续接用）

> 用途：新会话先读本文件 + `README.md` + `docs/design/AI Radio — Experience & Design Vision.md`，即可无缝接续 Phase 4。

## 复制给新会话的开场话术

```
先读 docs/design/PHASE-4-BRIEF.md、README.md 和 docs/design/AI Radio — Experience & Design Vision.md，然后开始 Phase 4。

Phase 3 已提交完成：左侧 AIColumn 已升级为 SignalColumn（TX/RX 信号流、频谱条、bass/mid/treble）；PULSE 经 PulseContext + usePulse（Web Audio FFT）驱动 SignalColumn 与 PulseBackdrop 占位；PlaylistColumn SpatialStack.onFocusItem 接封面 Preview；后端 /api/audio 代理取流；useRadioState 内 createMediaElementSource 分析器链。主背景仍为静态渐变 + PulseBackdrop，真正封面粒子场在本阶段做。

Phase 4 目标：CoverParticleField 封面采样粒子背景，替换 PulseBackdrop，与 PULSE / 切歌联动。

参考实现：本地只读 E:\VM\Mineradio-main（GPL-3.0，借鉴思路勿大段复制）。详见本文件「Mineradio 参考」与 docs/design/PHASE-3-BRIEF.md 同节。
```

## 当前状态（Phase 3 完成后）

- **Git**：`master` 上 Phase 3 提交点见 `git log -1`（`Phase 3: SignalColumn + PULSE 联动`）。
- **在用的目录**：前端 `ai-radio-v1/`、后端 `ai-radio/server/`。
- **启动**：根目录 `start.bat`（清 4000/3000 后拉起前后端；**改后端需重启**）。

### Phase 1–2（已完成，勿破坏）
- `SpatialLayout` + `useEdgePanels`；右侧 `SpatialStack` 3D 歌单；`LyricLight` 卡拉OK（**不要加回淡入淡出**）
- 封面 `/api/img`；歌单播放 `playPlaylist()`

### Phase 3（已完成）

| 能力 | 实现 |
|------|------|
| 左侧 SignalColumn | `SignalColumn.tsx` 替换 `SpatialLayout` 中的 `AIColumn`；`AIColumn.tsx` 遗留未删 |
| PULSE 分析 | `hooks/usePulse.ts` — FFT bass/mid/treble/beat；频段按 Hz + sampleRate 动态分 bin |
| PULSE 分发 | `context/PulseContext.tsx` — `usePulseBands`（useSyncExternalStore，~12fps）+ `usePulseFocus` |
| 背景占位 | `background/PulseBackdrop.tsx` — 渐变呼吸，Phase 4 替换 |
| 分析器接线 | `useRadioState` 创建 `<audio>` 时 `source→analyser→destination`；`crossOrigin=anonymous` |
| 取流代理 | 后端 `GET /api/audio?url=`；前端 `api.ts` `getMusicUrl` 返回同源代理 URL |
| 歌单封面联动 | `PlaylistColumn` → `setStackFocus`；`SpatialStack.onFocusItem` 用 ref 防无限重渲染 |
| Demo 歌单 | `isDemoPlayback` 时模拟正弦脉冲；真实歌单走 FFT |

### 已知遗留 / 可优化（非阻塞 Phase 4）
- **PULSE 三项读数常顶满**：自适应峰值归一化压缩动态范围，氛围够用；若要更准可后续调 `peakRef` 衰减与输出增益
- treble 在压缩音频上本就偏弱，已修 fftSize=512 下 bin 划分 bug
- 封面 `/api/img` 首次慢；`BioParticles.tsx` 未使用

## Phase 4 目标：CoverParticleField

（详见设计愿景 + `PHASE-3-BRIEF.md` Mineradio 参考 Phase 4 表）

- 新建 **`CoverParticleField.tsx`**（Three.js 或精简 WebGL），替换 `PulseBackdrop`
- 封面经 `/api/img` 采样 → 粒子网格；**SILK 预设**风格（克制、低信息密度）
- **PULSE uniform**：`usePulseBands()` 的 bass/mid/treble/beat → 粒子位移/亮度
- **切歌**：`PulseFocus` 当前曲 cover + `onFocusItem` 预览 → 旧封面→新封面 cross-fade（`uColorMixT` 思路）
- 可选：CPU Sobel 边缘/深度贴图（256²）给粒子 Z 轴起伏

### 主要改动文件（预期）
- `ai-radio-v1/src/components/background/CoverParticleField.tsx`（新建）
- `ai-radio-v1/src/App.tsx` — 用 CoverParticleField 替换 PulseBackdrop
- 可能扩展 `PulseContext` 暴露 focus cover URL（已具备）
- 删除或归档 `PulseBackdrop.tsx`、`BioParticles.tsx` 在 Phase 4 收尾时处理

### 接线（已有，直接复用）

```
useRadioState (audio + analyser)
    → PulseProvider
        → usePulseAnalysis → publish bands
        → focus (track cover | stack preview)
        → usePulseBands() / usePulseFocus()

PlaylistColumn SpatialStack.onFocusItem → setStackFocus(cover, label)
```

Phase 4 粒子场应订阅：
- `usePulseBands()` — 音频驱动
- `usePulseFocus().focus.cover` — 纹理来源（经 `utils/img.ts` 代理）

## Mineradio 参考（Phase 4 重点）

文件均在 `E:\VM\Mineradio-main`，**借鉴思路、手写实现**，勿整段复制 shader。

| 借鉴点 | 位置 | 落到 AI Radio |
|--------|------|----------------|
| 封面粒子几何 | `buildCoverParticleGeometry()` ~**5711** | `CoverParticleField` 顶点分布 |
| 顶点/片元 shader | ~**5858–6357** | 重写；**preset 0 SILK** 最接近本项目 |
| 边缘/深度 | `buildEdgeAndDepth()` ~**9460** | 256² 深度纹理，粒子 Z |
| 切歌过渡 | `uColorMixT` 等 | 双纹理 cross-fade |
| 音频驱动 | Phase 3 已完成 `usePulse` | 接 uniform，不必再从 Mineradio 搬 FFT |

## 环境坑（务必遵守）

- PowerShell 吞 `$` → 用纯路径/git/node；链式用 `;`
- 端口 4000 残留 → `start.bat` 或 taskkill
- 改后端需重启；前端 Vite 热更新
- 封面 `/api/img`；歌单 `playPlaylist()`；歌词勿淡入淡出

## 后续路线图

- **Phase 5**：酷狗歌单 API
- **Phase 6**：开场动画 + localStorage 跳过记忆
