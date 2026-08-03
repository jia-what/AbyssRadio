# Mineradio：封面 × 歌词联动 & 摄像机镜头逻辑

> 分析源：`E:\VM\Mineradio-main`（只读）  
> 用途：给 AI Radio / Hermes 对照移植，不当作可执行代码拷贝。  
> 日期：2026-08-03

---

## 一、总览

Mineradio 的沉浸体验由三套系统咬合：

1. **封面粒子平面**（Three.js Points + 封面采样 shader）
2. **3D 歌词舞台**（文字 mesh / 卡拉 OK shader，贴在封面世界坐标上）
3. **单台透视相机**（轨道 + 自由飞行 + 节拍电影冲击 + focus 取景）

三者共享：**同一组音频 uniforms（bass/mid/treble/beat）**、**同一份封面调色板**、**同一套世界旋转**。鼓点一响 → 粒子炸一下 + 镜头推近 + 歌词发光甩一下，是同源信号，不是三套各自乱抖。

核心目录：

| 区域 | 路径 |
|------|------|
| 相机 | `public/js/modules/01-scene/` |
| 封面 / 歌词视觉 | `public/js/modules/02-visual/` |
| 节拍状态 | `public/js/modules/00-state/03-beat-dj-state.js`、`03-beat/` |
| 主循环 | `public/js/modules/11-main-loop.js` |
| 离线 cameraBeats | 根目录 `dj-analyzer.js` |

---

## 二、摄像机 / 镜头逻辑

### 2.1 架构：一台相机，多层驱动

唯一 Three.js 相机在 `01-scene/00-renderer-quality.js`：

- `PerspectiveCamera(45, …, 0.1, 100)`，基线 FOV = **45**

驱动层（优先级从高到低）：

| 优先级 | 模式 | 文件 | 行为 |
|--------|------|------|------|
| 1 | 自由飞行 Free | `01-orbit-free-camera.js` | WASD + Pointer Lock，当帧直接写相机并 return |
| 2 | 回正 recentering | `03-focus-cinema-camera.js` | 拉回 preset baseline |
| 3 | Focus 取景 | 同上 | hover 歌单架/队列时硬编码构图 |
| 4 | 居中锁 centerLocked | 同上 | baseline + 电影微偏移 |
| 5 | 普通轨道 Orbit | 同上 + 输入在 `00-pointer-cover-particles.js` | user 球坐标 + cine 叠加 |

节拍 / 电影层 **不是独立相机**，而是把音频编译成 kick（punch / radius / theta / phi / roll / FOV），叠进轨道或自由相机。

### 2.2 轨道相机（默认）

状态对象 `orbit`（`01-orbit-free-camera.js`）分层：

- `userTheta/Phi/Radius`：用户拖拽的永久目标  
- `cineTheta/Phi/Radius`：电影模式瞬时微偏移  
- `theta/phi/radius`：每帧 lerp 后的实际值  
- `baseline*`：各 preset 默认姿态（回正用）

约束（魔数）：

- `phi ∈ [-0.45π, 0.45π]`
- `radius ∈ [2.4, 14.0]`，默认约 **6.6**
- 缓动：普通 theta/phi **0.10**、radius **0.07**；focus 时 **0.16 / 0.12**

输入（注意：在封面粒子文件里，不在 scene 目录）：

- 拖拽旋转 / 滚轮缩放 / 双击回正 → `02-visual/00-pointer-cover-particles.js`
- 滚轮：`userRadius += deltaY * 0.005`
- 键盘：`R` 切自由相机，`K` 回正 → `04-shelf/06-keyboard-camera-events.js`

### 2.3 自由飞行

- Pointer Lock + WASD / Space·Ctrl 升降 / Shift 加速（速度约 2.35 / 6.2）
- 鼠标灵敏度约 `0.00125`；pitch 夹 ±0.49π
- 激活时从当前轨道姿态无缝接管；仍可叠加节拍 kick / FOV punch
- 姿态可持久化 localStorage

### 2.4 节拍电影相机（Beat / Cinema）

**信号三条路**（最终都进 `scheduleBeatCamera`）：

1. 实时：`processRealtimeBeatEngine`（分频 kick/body/vocal/snap + onset + tempo）
2. 离线 map：`currentBeatMap.cameraBeats`（`dj-analyzer.js` 产出）
3. DJ map：`currentDjBeatMap.cameraBeats`

`scheduleBeatCamera` 把一拍编成事件（ADSR，队列最多 8～12）：

- **combo**：downbeat / push / drop / rebound / accent（按拍序号与能量）
- **mode**：deep / body / snap（频带占比）
- 主冲击是 **dolly（radiusKick）**，辅以 phi/theta 摆、snap 滚转、**FOV punch**
- 冷却约 0.46～0.5s；动态缩放 `cameraDynamicsScale` 随曲段能量在约 `[0.18, 1.18]`（DJ 略宽）

`updateBeatCamera` 每帧求 kick → `updateCinema` 写入 `orbit.cine*`，并加极慢 idle 漂移（sin 低频）。用户可调总强度 `fx.cinemaShake ∈ [0, 1.8]`；为 0 则电影层关闭。

FOV 收放（`updateCamera` 末尾）：

- `targetFOV = BASE_FOV - punch * (DJ ? 2.62 : 2.35)`
- 收快（ease≈0.24）放慢（≈0.12）

### 2.5 Focus 电影取景

hover 侧栏/队列 → `setFocusZone(type)`，延迟约 **260ms** 激活。类型举例：

- `shelf-side`：甩向右侧歌单架（theta≈0.42, radius≈4.2, camPunch≈0.82）
- `shelf-stage`：仰拍舞台
- `queue`：看向左侧队列

focus 时 `lookAt` **不再是原点**（常规轨道看原点）；节拍强度减半以免晃瞎。

### 2.6 每帧顺序（`11-main-loop.js`）

```
音频分析 → 写 uniforms(uBass/uBeat…)
→ updateCinema(dt)      // 内含 updateBeatCamera
→ updateFreeCamera(dt)
→ updateCamera()          // 唯一常规写相机姿态
→ applySkullCameraPose()  // preset 6 可再覆盖
→ 粒子/歌词更新
```

### 2.7 与封面 / 歌词的关系

- 轨道绕**原点**（封面粒子居中）转；节拍 dolly = 把封面怼向观众  
- 同一套鼠标：既转相机又转粒子自旋 → 视差  
- Sonic preset：`readSonicLyricLookAtTarget` 可让相机轻微跟拍 3D 歌词组  
- 「阳光溢光」`lyricSunEnergy` 与相机 punch **分轨**（副歌段落感 vs 单鼓点冲击）

---

## 三、封面 × 歌词联动动作

### 3.1 封面系统（要点）

文件：`02-visual/00-pointer-cover-particles.js` 等。

- 网格平面 `PLANE_SIZE = 4.8`，粒子 UV 采样封面  
- 多 preset（SILK / TUNNEL / ORBIT / VOID / VINYL / WALLPAPER…）共 shader，`uPreset` 分支  
- **Bass 涟漪**：`bass > 0.30` 上升沿触发，冷却 0.32s，最多 12 个涟漪纹理  
- 切歌：旧封面 → `prevCoverTex`，`uColorMixT` 0→1（SILK ~520ms / 其它 ~960ms）  
- 深度：CPU / 可选 AI depth → `uEdgeTex`  
- 附属：背面封面层、背景星河；浮空层代码里曾短路禁用；骷髅 preset=6 独立点云 + 下颌随 bass

### 3.2 歌词系统（要点）

- **Three.js 文字平面**，不是 DOM；容器 `stageLyrics.group`  
- 显示模式：single / dual / triple / cinema…  
- 运动风格档：`glass/smooth/float/quick/shine/glitch`（`08-lyrics-display-modes.js` 的 `lyricMotionProfile`）  
- 卡拉 OK：`uProgress` + smoothstep 羽化（`uFeather` ≈ 0.03～0.055）  
- 星河：约 420 点挂在歌词组下，宽高随歌词尺寸缓动，透明度吃 glow/beat  
- 调色板：`updateLyricPaletteFromCover` 从封面抽色 → 歌词 / 星河 / 骷髅同源 520ms 渐变

### 3.3 联动核心（一起动）

1. **共享音频 uniforms**  
   主循环算 bass/mid/treble/`beatPulse` → 封面 shader 与歌词 shader 同读。

2. **共享世界旋转（歌词贴封面）**  
   `updateStageLyrics3D`：`particles.getWorldPosition/Quaternion` → 赋给 `stageLyrics.group`。  
   拖封面 = 拖歌词。可选：
   - `lyricCameraLock`：歌词改贴相机前（距离约 4.85）billboard  
   - 骷髅嘴部锚定：歌词吸在下颌局部点

3. **共享调色板**  
   切歌 `refreshCoverDependentColors` 一次更新背面粒子色 + 歌词 palette。

4. **Beat → 歌词附加动作**  
   - `beatGlow`：attack 0.32 / release 0.10（与 kick/punch 合成）  
   - `highBloom` / `lyricSunEnergy`：副歌级持续亮起（不是单点闪）  
   - `glowFollowX/Y/Roll`：吃相机 kick 方向，重拍发光「甩一下」再 `*0.92` 回弹  

5. **切歌四线协同**  
   封面 crossfade + palette tween + 歌词 enter/exit +（可选）相机 lock 硬对齐帧。

---

## 四、动画原则（可复述）

| 原则 | 做法 |
|------|------|
| 统一缓动 | `visualEase = t²(3-2t)` smoothstep |
| 帧率无关 | `x += (target-x) * min(1, k*dt)` |
| 呼吸 | 低频 `sin(uTime * 0.2…)` |
| 卡拉 OK | 进度前沿羽化，非整块硬切 |
| 镜头克制 | 主冲击是 dolly+微 FOV，不是乱晃位移 |
| 同源律动 | 粒子 / 镜头 / 歌词 glow 吃同一拍 |

禁止感：仪表盘式硬切、多套节拍各自为政、歌词与封面旋转脱节。

---

## 五、关键符号速查

| 符号 | 含义 | 位置 |
|------|------|------|
| `orbit` / `freeCamera` | 轨道 / 自由相机状态 | `01-orbit-free-camera.js` |
| `beatCam` | punch / *Kick / events | `03-beat-dj-state.js` |
| `updateCinema` / `updateCamera` | 电影层 → 写相机 | `03-focus-cinema-camera.js` |
| `scheduleBeatCamera` | 一拍 → 事件 | `02-beat-camera-runtime.js` |
| `stageLyrics` | 歌词舞台状态 | `02-lyrics-state-layout.js` |
| `updateStageLyrics3D` | 贴封面 + 动画 | `14-stage-lyrics-rendering.js`（visual 模块内） |
| `updateLyricPaletteFromCover` | 封面→歌词色 | `07-lyrics-palette-text-utils.js` |
| `PLANE_SIZE=4.8` | 封面平面 | `00-pointer-cover-particles.js` |
| `BASE_FOV=45` | 相机基线 FOV | orbit-free-camera |

主循环相机段：`updateCinema → updateFreeCamera → updateCamera`（`11-main-loop.js`）。

---

## 六、对 AI Radio（`ai-radio-v1`）的对照建议

已有近似物：`CoverParticleField`、`LyricStage` / `LyricLight`、`useSpatialOrbit`、beat FOV punch。相对 Mineradio 仍可补：

1. **封面→歌词四色调色板**（primary/secondary/highlight/glow），副歌级 `lyricSunEnergy`，勿只跟单鼓点闪  
2. **歌词与封面共旋转**（或明确 camera-lock billboard 二选一，避免「字在空中、封面自转」脱节）  
3. **glowFollow**：用 kick 方向做小位移回弹，比纯 scale 更有生命  
4. **电影层可关**：总开关 + 强度（对标 `fx.cinemaShake`），安静段收敛  
5. **运动风格档**：float/shine 等参数表抽成配置，而不是写死一种手感  
6. **勿整段抄 GPL/专有实现**：理解算法后在 AI Radio 自写（签名/着色器结构同理）

---

## 七、为何「同一摄像机角度」两项目画面差很多（2026-08-03）

对照实拍：侧视时 Mineradio 歌词与封面共面、字正向；AI Radio 曾出现**镜像字** + 封面已侧立、歌词仍正对镜头。

| | Mineradio | AI Radio（当前 WebGL `lyricMesh`） |
|--|--|--|
| 挂接 | 歌词组 **copy 封面粒子** `position/quaternion`（贴在封面平面上） | **已对齐**：`buildLyricCoverModelMatrix` 挂在封面平面 `LYRIC_COVER_ANCHOR`，相机绕两者转 |
| 侧视时 | 封面侧棱 + 歌词共面侧过去 | 同左（刷新后生效） |
| 背面 | 必要时 flip | `eye.z < 0` 时 `flipX`，避免镜像字 |
| DOM 备用 | 少用 | mesh 激活时仍隐藏 DOM，避免双份 |

> 2026-08-03 Cursor：已把 AI Radio WebGL 歌词从 billboard 改回封面共面挂接。

---

## 八、一句话备忘

> Mineradio 的镜头是「轨道骨架 + 节拍冲击叠加」；封面与歌词是「同一平面上的同色、同拍、同转」。移植时优先保证**同源信号**和**世界坐标粘合**，再谈花活 preset。
