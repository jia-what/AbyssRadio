# Mineradio 主界面视觉层分析 — 封面粒子 + 字幕 + 3D 空间 + 鼓点动效

日期：2026-08-03
对象：`E:\VM\Mineradio-main`（Mineradio v2.1.0）UI 视觉层
目标：主界面「歌曲封面 + 字幕」逻辑迁移进 AI_radio（AI_audio）
关系：本报告与 `MINERADIO-ANALYSIS-20260802.md`（取流/登录层）互补，本文只讲 UI 视觉层

---

## 〇、结论先行（迁移建议按性价比排序）

| 优先级 | 项目 | 工作量 | 理由 |
|---|---|---|---|
| 🥇 P0 | **相机 FOV punch（鼓点收缩镜头）** | ~0.5h | 一行 fov 变化就有 Mineradio 80% 的节奏感 |
| 🥈 P0 | **粒子 z 向鼓动（uBeat→pos.z）** | ~0.5h | shader 现成，加一个 uniform 即可 |
| 🥉 P1 | **YRC 逐字歌词解析** | ~半天 | 卡拉OK 高光从"估算"变"精确"，质变 |
| P1 | **歌词翻译行（tlyric）** | ~半天 | 数据已有，加插槽 |
| P2 | **歌词相机锁定（低配版视差）** | ~1 天 | DOM 歌词加跟随偏移，立体感折中方案 |
| P2 | **封面深度浮雕** | ~1 天 | 粒子模块已写过 buildEdgeAndDepth，接 depth uniform |
| ❌ | 自由相机/镜头跟拍/骷髅口型 | — | 与"低信息密度、克制动画"定位冲突 |
| ❌ | 离线 BeatMap 预分析 | — | 准但重（每首 1–3s + 4 频段解码），实时频谱已够用 |
| ❌ | 涟漪交互/6 种歌词动效/多行影院模式 | — | 定位冲突 + 工作量大 |

---

## 一、封面（WebGL 粒子系统）

### Mineradio 实现
核心文件（全部 THREE.js，全局 var 老式模块，GPL-3.0 **参考重写不拷贝**）：

- `public/js/modules/02-visual/00-pointer-cover-particles.js`（1044 行）
  - **封面粒子**：THREE.Points + 自定义 shader，封面图作为 `uCoverTex` 纹理喂给粒子
  - 切歌 crossfade：`uPrevCoverTex` + `uColorMixT`（0=旧 → 1=新，320–960ms 渐变）
  - 交互：拖拽旋转（`applyParticleSpinDrag` 带惯性）、滚轮缩放、双击回正、点击涟漪
- `public/js/modules/02-visual/15-ripples-cover-depth.js`（651 行）
  - **封面深度/边缘纹理**：`buildEdgeAndDepth` 离线 canvas 算 depth+edge（R=depth, G=edge, B=fg-mask, A=lum）→ shader 伪 3D 浮雕；有缓存（`getCoverDepthCache`）
  - AI 深度（`queueAIDepthForCover`）：重活延迟调度（`scheduleVisualApply` + 渲染交互期间 defer）
  - 取色联动：`updateLyricPaletteFromCover` → 歌词颜色随封面

### AI_radio 现状
- ✅ 已有自研 WebGL 粒子（`CoverParticleField.tsx` 370 行 + `coverParticle/` 模块：shaders/geometry/mat4/camera）
- ✅ 封面纹理 + 切歌混色（MIX_DURATION_MS 1400）
- ✅ 已有 `buildEdgeAndDepth`（depth+edge 已写过，但没接进 shader）
- ✅ 已有 `coverPalette.ts` 取色
- ❌ 无深度浮雕效果、无涟漪、无拖拽旋转的完整交互（相机有 orbit 但交互少）

---

## 二、字幕（歌词舞台）

### Mineradio 实现
**数据层**（`06-lyrics/00-lyrics-fetch-parse.js`，681 行）：
- **双格式解析**：LRC 行级（`parseLyricText`）+ **YRC 逐字卡拉OK**（`parseYrcText`，words[] 带时间戳）
- `timingSource` 四档优先级：`yrc-word > yrc-line > lrc-line > fallback`
- 翻译行（tlyric）+ **网易云翻译兜底**（`findNeteaseLyricFallbackCandidate`，10 分钟失败缓存）
- 持久缓存（`readPersistentLyricCache`）+ 队列预取 + 失败重试（700ms/1.6s/3.2s）
- 行时长推断：下一行时间差，clamp 0.45–12s

**渲染层**（`02-visual/`）：
- `08-lyrics-display-modes.js`：单行/双行/三行/影院 5 行/自定义 10 行；6 种动效（glass/smooth/float/shine/quick/glitch），每档有完整运动曲线参数（enter/exit/slide/progressEase/contextDrift/glowLift/floatAmp）
- `13-lyrics-mesh-build.js`（491 行）：**CanvasTexture 文字贴图 → 网格**，shader `depth = clamp(2.2/max(0.35,-mv.z))` 视差、AdditiveBlending 辉光
- `14-stage-lyrics-rendering.js`（3207 行）：逐字进度、辉光、运动曲线、行切换动画

**3D 空间锚定**（`14-stage-lyrics-rendering.js` 2170–2205 行，立体感关键）：
1. **相机锁定（默认）**：`lyricLayoutBase = camera.position + cameraDir × 4.85`——歌词悬浮在相机前方，四元数跟随（position.lerp 0.24 / quaternion.slerp 0.22），**任何视角都正对镜头**且带轻微滞后（像无人机吊牌）
2. **锁封面**：跟随粒子群 world position + quaternion，封面转歌词跟着转
3. **骷髅口型**（特殊预设）：嵌进骷髅嘴随旋转
- 锁定自适应缩放：`lyricCameraLockFit` 按锁定距离反推 scale，离远自动放大保可读

### AI_radio 现状
- ✅ DOM 实现（`LyricLight.tsx` 152 行）：三行滚动 + 逐字卡拉OK（CharFill，rAF 60fps，按演唱节奏封顶高光）
- ✅ `parseLRC.ts`：仅 LRC 行级（`[mm:ss.xx]` 格式）
- ✅ `coverPalette.ts` 歌词取色同思路
- ❌ 无 YRC 逐字、无翻译行、无持久缓存/预取、**无 3D 空间感**（平面 DOM）

---

## 三、3D 视角转动（空间感）

### Mineradio 双层相机（`01-scene/00-renderer-quality.js` + `01-orbit-free-camera.js` 501 行）
1. **轨道相机（默认）**：球坐标 `orbit = {theta, phi, radius}`（radius 6.6，phi ±45°，radius 2.4–14）
   - 拖拽旋转（惯性 spin）、滚轮缩放（0.005/格）、双击回正（recenter tween）
2. **自由相机（进阶）**：FPS 六自由度（yaw/pitch/roll + WASD + PointerLock），localStorage 持久化，beat 镜头抖动
3. **镜头跟拍**：hover 歌单/队列时 `orbit.focus` 平滑 lerp 过去，交互完回弹

**立体感本质**：粒子群本身 3D（`pos.z` 大量 depth 偏移 + `bassBreath + depthZ`），相机绕它转 → 视差 = 真 3D 深度 + 相机旋转

### AI_radio 现状
- ✅ 已有球坐标 orbit（`coverParticle/camera.ts`：theta/phi/radius，初始 0/0.08/6.2，minPhi/maxPhi 限制，注释"aligned with Mineradio particleSpin feel"）
- ✅ 已有拖拽惯性（spin）
- ❌ 无滚轮缩放、无双击回正、无自由相机

---

## 四、鼓点跳动（节奏感引擎）

### Mineradio 双轨制（`03-beat/`）
1. **离线 BeatMap**（`01-audio-beat-analysis.js` 761 行）：
   - fetch 完整音频 → OfflineAudioContext 解码
   - **4 频段滤波**：低鼓 38–155Hz / 鼓身 130–420 / 人声 420–2600 / 敲击 1800–9000
   - 10ms 帧能量 → 正向差分 onset → 自适应阈值（percentile 88%）→ 峰检测
   - 输出 `beats[]`（time + strength + impact + body）+ BPM 网格线（worker 测 tempo）
2. **实时兜底**（rtBeat）：频谱 onset 检测，beatMap 未锁定时用
3. **触发层**（`04-beat-map-runtime.js`）：播放游标每帧扫时间戳 → `triggerScheduledBeat`：
   `pulse = 0.14 + strength×0.46 + impact×0.18 + body×0.08 + comboLift`（重拍/downbeat 加成，clamp ≤0.78）→ `scheduledBeatPulse`
4. **三路消费者**：
   - **相机 punch**（最出效果）：`camera.fov -= pulse × 1.75` 收缩 + radiusKick 位移抖动（`01-orbit-free-camera.js` 377–380）
   - **粒子 shader**：`uBeat` uniform → 顶点 `pos.z += uBeat × 0.018` 深度鼓动
   - **辉光/骷髅**：`beatGlow`、`ampDrive = smoothstep(uBass×0.44 + uMid×0.22 + uBeat×0.72)`

### AI_radio 现状
- ✅ 实时频谱 onset + 自适应映射（`utils/beatVisual.ts` 74 行：每首歌自动适应强弱，mapHit 0.14–0.82）
- ✅ BeatPulseContext 已把 kick 分发给粒子（缩放/辉光）
- ❌ 无相机 FOV punch、无粒子 z 向鼓动、无离线 BeatMap

---

## 五、代码可复用性判定

| Mineradio 代码 | 可否直接搬 | 原因 |
|---|---|---|
| `00-pointer-cover-particles.js` | ❌ 重写 | THREE.js 全局 var + GPL-3.0；AI_radio 已有自研 WebGL |
| `15-ripples-cover-depth.js` | 🟡 思路 | buildEdgeAndDepth 思路已在本项目实现过 |
| `08-lyrics-display-modes.js` | 🟡 参考 | 纯函数配置，可移植为 TS 常量表 |
| `13-lyrics-mesh-build.js` | ❌ | CanvasTexture→mesh 架构，AI_radio 是 DOM 歌词 |
| `14-stage-lyrics-rendering.js` | 🟡 参考 | 相机锁定数学（lerp/slerp 系数）可借鉴到 DOM 视差 |
| `01-audio-beat-analysis.js` | 🟡 参考 | 频段滤波+onset 算法可移植，但先不做（实时已够） |
| `04-beat-map-runtime.js` | 🟡 参考 | pulse 计算公式可移植到现有 kick 映射 |

---

## 六、推荐落地顺序

**第一阶段（节奏感，~1h）**：
1. `updateViewFromOrbit` 加 fov punch：`fov = base - beatPulse × 1.75`，鼓点镜头"吸近"
2. shader 顶点加 `pos.z += uBeat × 0.018` 鼓动

**第二阶段（歌词质变，~1 天）**：
3. 后端 `getKugouLyric` 补 `fmt=yrc`（lyrics.kugou.com 链路已有，参照 Mineradio `parseYrcText` 数据结构）
4. 前端 `parseLRC.ts` 扩展 YRC → LyricLight CharFill 用真实逐字时间戳
5. 翻译行插槽（tlyric）

**第三阶段（空间感，~1–2 天）**：
6. 滚轮缩放 + 双击回正（orbit 补齐）
7. DOM 歌词视差跟随（相机 theta/phi → 歌词 translate 反方向偏移，低配版"锁相机"）
8. 封面深度浮雕接 shader（buildEdgeAndDepth 已有）

---

## 七、风险与注意

- **GPL-3.0**：Mineradio 是 GPL-3.0，**参考重写不拷贝**，任何搬代码都需重写为 React/TS 风格
- **性能**：Mineradio 有完整 DPR 预算（5.2M 像素）+ 自适应 FPS（60–90）+ 交互提频，AI_radio 需注意粒子数上限
- **产品定位**：Mineradio 是"花哨影院风"，AI_radio 是"低信息密度、克制动画"——只挑节奏感/立体感精髓，不做花哨堆砌
