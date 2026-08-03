# AI Radio — 项目现状总结

> 日期：2026-08-03  
> 一句话：**有 AI 陪聊的听歌空间** — 满屏封面粒子 + 居中歌词，低信息密度、悬浮、克制动画。

续接设计文档：[`docs/design/AI-RADIO.md`](design/AI-RADIO.md)  
Mineradio 对照分析：[`docs/design/MINERADIO-COVER-LYRIC-CAMERA.md`](design/MINERADIO-COVER-LYRIC-CAMERA.md)

---

## 1. 产品形态

| 区域 | 行为 |
|------|------|
| 中景 | 封面粒子平面 + 挂在封面上的歌词（WebGL） |
| 下 | 播放条默认常显 |
| 左 / 右 | AI 陪聊、歌单 — 贴边或按钮按需浮出 |
| 背景 | 封面色氛围光 + 脉冲波形 |

不是传统播放器仪表盘；目标是「正在播放情绪与电波的房间」。

---

## 2. 目录与启动

```
AI_audio/
├── ai-radio-v1/          前端 React + TS + Vite + Tailwind + Motion
├── ai-radio/server/      后端 Node + Express
├── docs/                 设计 / 缺陷 / 决策
├── images/               参考图
└── start.bat             清 4000/3000 后同时拉起前后端
```

- 前端：http://localhost:3000  
- 后端：http://localhost:4000  
- **只改** `ai-radio-v1/` 与 `ai-radio/server/`  
- 备份参考：`E:\VM\AI_audio_bak_20260802`

---

## 3. 技术栈速览

### 前端（`ai-radio-v1/`）

- 状态：`useRadioState`（播放队列、歌词、登录会话）
- 布局：`SpatialLayout` + 贴边面板 `useEdgePanels`
- 视觉主场：`CoverParticleField`（WebGL 封面粒子 + 歌词 mesh）
- 音频驱动：`PulseContext` / `BeatPulseContext`（bass/mid/treble/beat/kick）
- 封面图统一走 `/api/img`（`utils/img.ts`），勿前端直连平台 CDN

### 后端（`ai-radio/server/`）

- 会话：`session.mjs`（网易云 Cookie / 酷狗扫码等）
- 取流：`url-smart` 主源 + 一层兜底；可播放 URL 校验
- 音源：网易云、酷狗为主（酷狗登录 / QR / 签名模块近期补齐）
- 歌词：原文 + 翻译（tlyric）；按时间戳对齐，勿按行号硬配
- 对外稳定面：`/api/health`、`/api/metrics`、`/api/queue/*`、`/api/player/*`

---

## 4. 封面 × 歌词 × 相机（当前实现重点）

对照源：`E:\VM\Mineradio-main`。AI Radio 已迁默认路径，**不是**相机 billboard。

### 4.1 绑定关系

- 封面粒子平面：`PLANE_SIZE = 4.8`（世界单位）
- 歌词贴在同一世界平面上（略抬前 `z ≈ 1.2`）
- 轨道相机绕封面转；滚轮拉近/拉远 → **封面与歌词同步变大变小**
- 默认轨道半径：`DEFAULT_ORBIT_RADIUS = 6.6`（对齐 Mineradio）

### 4.2 歌词尺寸（已按 Mineradio 修过「短句大、长句小」）

核心文件：`ai-radio-v1/src/components/background/coverParticle/lyricQuad.ts`

| 规则 | 值 / 行为 |
|------|-----------|
| 字号 | 锁定 **128px**（正常行不 shrink-to-fit） |
| 画布宽 | 随文字生长 `2048…6144` |
| 平面宽 | `6.10 × clamp(画布宽/2048, 1…3) × 0.96` |
| 效果 | 每字世界高度恒定 ≈ 0.381，短句/长句一样大，长句整块更宽 |
| 显示 | **只显示当前句** + 可选翻译（无上下句） |
| 标题 | 未到歌词行时，同一 mesh 显示歌名/艺人（避免 DOM→WebGL 跳尺寸） |

### 4.3 歌词微动效（Mineradio `float` 档）

同文件 `sampleLyricMotion` / `LYRIC_MOTION`，在 `CoverParticleField` 每帧施加：

- 双频正弦轻微呼吸缩放（挂机也会动）
- Z 轴微倾 ≈ ±1.5°
- 轻微 Y/Z 浮动
- bass / kick 只加很小推幅
- 节拍 `glowFollow` 小幅位移

### 4.4 翻译样式

- 与主歌词同系暖色（封面 highlight 调和奶油色），不再用冷青
- 字重 500、字号约 64px，略低于主句以保持主次

### 4.5 相关前端文件

```
coverParticle/
  camera.ts          轨道相机、默认半径、限制
  buildGeometry.ts   PLANE_SIZE、粒子几何
  lyricQuad.ts       歌词画布 / 平面尺寸 / 微动效 / model 矩阵
  stageTransform.ts  DOM LyricStage 备用变换（mesh 激活时 DOM 隐藏）
CoverParticleField.tsx   WebGL 主循环：粒子 + 歌词绘制
App.tsx                  lyricMesh 数据（标题 / 当前句 / 翻译 / 调色板）
```

---

## 5. 核心用户链路

1. 登录（网易云 Cookie / 酷狗扫码 QR：801→802→200）
2. 浏览歌单 / 搜索 / AI 点歌
3. `playPlaylist()` 按 id+source 取流（**不要用搜索代替歌单内播放**）
4. 播放 → 封面粒子换肤 → 歌词 mesh 同步 → AI 对话可感知当前曲

---

## 6. 已知坑（开发约定）

- PowerShell 会吞 `$` 变量；命令链式用 `;`
- 端口 4000 常残留旧后端 → 用 `start.bat` 或杀 PID
- 改后端必须重启；前端有 Vite HMR（歌词 canvas 几何大改时建议硬刷新）
- 勿提交真实 Cookie / `.env` 密钥

---

## 7. 文档地图

| 文档 | 用途 |
|------|------|
| `docs/design/AI-RADIO.md` | 活文档 / 产品原则 / API 面 |
| `docs/design/MINERADIO-COVER-LYRIC-CAMERA.md` | Mineradio 封面歌词相机对照 |
| `docs/COUNCIL-20260802.md` | 圆桌决策与清理记录 |
| `docs/DEFECTS-20260802.md` / `DEFECTS-UI-20260803.md` | 缺陷清单 |
| **本文** `docs/PROJECT-STATUS-20260803.md` | 当前实现快照（含歌词迁移结论） |

---

## 8. 近期完成（2026-08-03 视觉线）

- [x] 歌词从错误 billboard 改为挂封面平面  
- [x] 默认构图对齐 Mineradio（半径 6.6、平面 4.8）  
- [x] 固定字号 + 加宽平面（消除短/长句跳变）  
- [x] 仅当前句 + 翻译；标题与正歌同 mesh  
- [x] float 档微呼吸 / 微倾  
- [x] 翻译暖色样式  

## 9. 可接着做（未强推）

- 歌词风格档切换（smooth / glass 等幅度）  
- 与 Mineradio 更齐的副歌 `lyricSunEnergy` / 高光 bloom  
- UI 缺陷清单里剩余项（音质菜单溢出、右栏钉住等，见 `DEFECTS-UI-20260803.md`）  
- 核心链路连跑稳定前，不扩第三音源、不开场动画（见 AI-RADIO 搁置项）
