# Phase 4 交接简报（已完成）

> **Phase 4 已完成**。接续 Phase 5 请读 `docs/design/PHASE-5-BRIEF.md`。

## 复制给新会话的开场话术

```
先读 docs/design/PHASE-5-BRIEF.md、README.md 和 docs/design/AI Radio — Experience & Design Vision.md，然后开始 Phase 5。

Phase 4 已提交：CoverParticleField 封面粒子背景（WebGL SILK）替换 PulseBackdrop；CoverAmbientLight / CoverPulseWave；LyricStage 3D 歌词平面；useParticleCamera 拖拽惯性；Mineradio 式 beatEngine + 自适应轻重 beatVisual 鼓点律动；双 Analyser + GainNode 音量；BottomBar 进度/音量修复；切歌封面 trackId 防错位。

Phase 5 目标：酷狗 Cookie 歌单 API（/v7/get_all_list Android 签名链路），见 ai-radio/server/kugou.mjs 占位。
```

## 当前状态（Phase 4 完成后）

- **Git**：`Phase 4: CoverParticleField + 鼓点律动 + 播放条修复`（见 `git log -1`）
- **在用的目录**：前端 `ai-radio-v1/`、后端 `ai-radio/server/`
- **启动**：根目录 `start.bat`

### Phase 4 交付清单

| 能力 | 实现 |
|------|------|
| 封面粒子场 | `CoverParticleField.tsx` + `coverParticle/*`（WebGL，SILK shader） |
| 背景层栈 | `CoverAmbientLight` → `CoverPulseWave` → `CoverParticleField`（z0–1） |
| 封面色 | `utils/coverPalette.ts`（含黑白封面 monochrome 路径） |
| PULSE | 双 Analyser（主 0.58 smooth + beat 0.10 sharp，fft 2048） |
| 鼓点律动 | `beatEngine.ts`（Mineradio processRealtimeBeatEngine）+ `beatVisual.ts`（每曲自适应轻重） |
| 歌词 3D | `LyricStage.tsx` + `stageTransform.ts`，跟随粒子相机，beatGlow 平滑 |
| 相机 | `useParticleCamera.ts` — 滚轮/WASD/拖拽惯性/双击回正 |
| 左侧 SignalColumn | 频谱条 + PULSE 联动（`signalMeter` gamma） |
| 歌单封面 | 仅跟**当前播放曲**，不跟 stack 滚动 preview |
| 切歌 | `loadGenRef` + `trackId\|cover` 纹理校验，防封面/audio 竞态 |
| 播放条 | 进度条切歌归零、分列布局、可拖 seek；GainNode 音量 + 横向 vol 滑条 |
| 移除 | `PulseBackdrop.tsx` |

### 背景 z-order（底→顶）

```
CoverAmbientLight (z0)
CoverPulseWave      (z0, 底栏上方 FFT 带)
CoverParticleField  (z1)
orbit 拖拽层        (z2)
UI SpatialLayout    (z3+)
LyricStage          (z5)
```

### PULSE 接线

```
useRadioState: audio → source → analyser + beatAnalyser → gainNode → destination
PulseProvider: usePulseAnalysis → beatEngine → beatVisual → beatPulse 包络
CoverParticleField: usePulseBands + useBeatPulseRef (kick → uKickPulse)
LyricStage: beatPulseToGlow + scale
```

### 已知遗留（非阻塞 Phase 5）

- 鼓点律动在极弱/无鼓点民谣上几乎不动 — 符合设计；强鼓点 EDM 依赖 beatEngine 阈值，可按反馈微调 `REALTIME_MIN_INTERVAL`
- `AIColumn.tsx` 仍遗留未删（SignalColumn 已替代）
- 封面 `/api/img` 首次加载仍偏慢

## Mineradio 参考（Phase 4 已借鉴）

| 借鉴点 | AI Radio 落地 |
|--------|---------------|
| processRealtimeBeatEngine | `utils/beatEngine.ts` |
| beatPulse 包络 + uBeat | `usePulse.ts` + particle shader |
| 双 analyser | `pulseAnalyserRef` + `beatAnalyserRef` |
| GainNode 音量 | `gainNodeRef` in `useRadioState` |
| 封面粒子 SILK | `coverParticle/shaders.ts`（手写，非复制） |

## 环境坑（务必遵守）

- PowerShell 吞 `$` → 用纯路径/git/node；链式用 `;`
- 端口 4000 残留 → `start.bat` 或 taskkill
- 改后端需重启；封面 `/api/img`；歌单 `playPlaylist()`；歌词勿淡入淡出

## 后续路线图

- **Phase 5**：酷狗歌单 API → `PHASE-5-BRIEF.md`
- **Phase 6**：开场动画 + localStorage 跳过记忆
