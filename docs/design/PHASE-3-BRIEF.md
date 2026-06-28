# Phase 3 交接简报（已完成）

> Phase 3 已收尾。续接 **Phase 4** 请读 **`docs/design/PHASE-4-BRIEF.md`**。

## Phase 3 完成摘要

- **Git**：`master` 上 `Phase 3: SignalColumn + PULSE 联动`（在 Phase 2 `e9c3b55` 之后）。
- 左侧 **SignalColumn**（信号流 UI + 频谱条 + bass/mid/treble）
- **PULSE**：`usePulse` + `PulseContext`；真实 FFT + `PulseBackdrop` 占位
- 后端 **`/api/audio`** 代理；`PlaylistColumn` 封面 Preview 联动
- `AIColumn.tsx` 仍保留未引用，可 Phase 4 后归档

### 已知遗留（非阻塞）
- PULSE 三频段读数常接近满格（峰值归一化），氛围可接受
- 详见 `PHASE-4-BRIEF.md`

## 历史：Phase 3 目标（已达成）

- `AIColumn` → **SignalColumn**
- 与播放状态 **PULSE** 联动（`onFocusItem`、当前曲 cover、FFT）
- 真正封面粒子背景 → **Phase 4** `CoverParticleField`

## Mineradio 参考

见 **`PHASE-4-BRIEF.md`**（Phase 4 表）及下方 Phase 3 历史记录。

<details>
<summary>展开：Phase 3 时期的 Mineradio 参考全文（归档）</summary>

`images/` 参考图与 [Mineradio](https://github.com/XxHuberrr/Mineradio) 同源。本地只读 **`E:\VM\Mineradio-main`**（勿拷入仓库）。

### 原则

| 推荐 | 不推荐 |
|------|--------|
| 读算法、交互、shader **思路**，在 `ai-radio-v1` 里**重写** | Fork 改皮或整文件移植 `public/index.html` |
| 按需摘最小片段理解后手写 | 大段复制 shader 且不处理 GPL |

### Phase 3 已落地

| 借鉴点 | 落到 AI Radio |
|--------|----------------|
| FFT 分频段 + 包络 | `hooks/usePulse.ts` |
| 信号流 UI | `SignalColumn.tsx`（自建） |
| PULSE → 背景 | `PulseBackdrop.tsx`（占位） |

### Phase 4 待做（见 PHASE-4-BRIEF.md）

封面粒子、`buildCoverParticleGeometry`、SILK shader、切歌 cross-fade 等。

</details>

## 环境坑

- PowerShell 吞 `$`；端口 4000 残留用 `start.bat`
- 封面 `/api/img`；歌单 `playPlaylist()`
