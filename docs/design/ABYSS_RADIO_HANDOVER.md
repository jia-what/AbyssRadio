# Abyss Radio — 项目交接文档

> 生成日期：2026-06-21
> 项目代号：Abyss
> 交接模式：Claude Code Cowork → Code 界面

---

## 1. 项目整体进度总结

| 维度 | 状态 |
|------|------|
| 整体完成度 | 约 **55%** |
| 当前阶段 | **V4 后端搭建中**（Express 骨架完成，音乐 API 半接入） |
| 可运行部分 | ✅ V1 前端骨架（播放器/聊天/歌词/沉浸视图） |
| 可运行部分 | ✅ Express 后端（health + 搜索 endpoint） |
| 不可运行 | ❌ `ncm.mjs` 文件为空，音乐搜索 API 暂不可用 |

### 版本路线

```
V1：前端骨架 + Radio View 交互  ✅ 已完成
V2：视觉打磨（字体/粒子/光效）  ✅ 已完成（大部分）
V3：Immersive View 增强        ✅ 歌词/黑胶/切歌动画已完成
V4：后端对接                    🔄 进行中（Express 骨架 OK，音乐 API 半成品）
V5：音乐 + LLM + 定时          ⬜ 未开始
```

---

## 2. 项目方案与阶段划分

### V1 — 前端骨架与 Radio View（已完成）
- **目标**：React + TypeScript + Tailwind 三栏布局可交互原型
- **交付物**：播放器、聊天面板、左栏状态、视图切换、Liquid Glass 材质
- **关键文件**：`ai-radio-v1/` 目录下所有组件（前端交互均在 `ai-radio-v1/` 中完成）

### V2 — 视觉打磨（已完成）
- **目标**：确定品牌调性 Abyss / Bioluminescence（深海荧光），粒子背景，字体
- **交付物**：BioParticles 荧光粒子、Satoshi 字体、Logo 设计
- **设计决策**：见第 5 节

### V3 — Immersive View 增强（已完成）
- **目标**：沉浸模式歌词 + 黑胶动画 + 全屏歌词
- **交付物**：歌词逐行高亮、滑动切歌动画、全屏歌词阅览界面

### V4 — 后端对接（进行中）
- **目标**：Node.js Express 后端 + 音乐 API + DeepSeek LLM + SQLite
- **交付物**：Express 服务（index.mjs）、音乐搜索 API（ncm.mjs，文件为空需要重写）
- **剩余**：补全 ncm.mjs → 接 DeepSeek API → 前端对接 → SQLite

### V5 — 音乐 + LLM + 定时（未开始）
- 真实音乐源对接（网易云/酷狗）
- AI DJ 聊天（DeepSeek API）
- 定时自动播报

---

## 3. 技术栈详情

### 前端（ai-radio-v1/ — 实际运行版本）

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 19+ | UI 框架 |
| TypeScript | 5.5+ | 类型安全 |
| Vite | 5.4+ | 构建工具（端口 3000） |
| Tailwind CSS | 3.4+ | 样式方案 |
| Motion (Framer Motion) | 12+ | 动画库 |
| lucide-react | latest | 图标库 |
| Canvas 2D | 原生 | 粒子系统 + 波形可视化 |

### 后端（ai-radio/server/ — 进行中）

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | 22+ | 运行时（兼容 18+） |
| Express | 5.2+ | 后端框架（端口 4000） |
| @meting/core | 1.6+ | 聚合音乐 API（网易云+酷狗） |
| ws | 8+ | WebSocket |
| better-sqlite3 | 待安装 | 数据库 |
| cors / dotenv | — | 中间件 |

### 选型原因
- **Express**：前后端分离（方案A），用户更熟悉
- **@meting/core**：同时支持网易云+酷狗，`require` 可用
- **Canvas 2D**（非 Three.js）：粒子系统和波形足够用，无额外依赖

---

## 4. 页面类型与页面清单

| 页面/视图 | 路径/路由 | 用途 | 状态 |
|-----------|----------|------|------|
| Portal 开屏 | App.tsx → PortalAnimation | 开场动画 | ⬜ 跳过（等 AI 视频素材） |
| Radio View | RadioView.tsx | 主界面：三栏布局 | ✅ 已完成 |
| ├─ 左栏 | LeftSidebar.tsx | 状态信息（可收起） | ✅ 已完成 |
| ├─ 播放器 | CenterPlayer.tsx | 歌曲信息/进度/控制 | ✅ 已完成 |
| └─ 右栏 | AIBeam.tsx | AI 聊天面板 | ✅ 已完成 |
| Immersive View | ImmersiveView.tsx | 黑胶+歌词沉浸模式 | ✅ 已完成 |
| 全屏歌词 | CenterPlayer.tsx（内联） | 点封面进入歌词阅览 | ✅ 已完成 |

注意：当前无路由，通过 `viewMode` state 在 Radio/Immersive 间切换。

---

## 5. 设计风格与视觉意图

### 品牌调性：Abyss / Bioluminescence（深渊 / 生物荧光）

设计关键词：**深黑、蓝光、水感、荧光、极简**

### 核心意象
- 像一望无际的黑色深海中，荧光虫聚集在水面，发出丝丝蓝光
- 光不是 LED 打上去的，是从 UI 内部自己渗出来的
- 像干冰压在蓝光上冒出的烟，边界模糊、柔和

### Logo（已定稿）
- 图形：V 形（类似 A 的下半部分），两笔白色粗线交汇于底部
- 横线：贯穿 V 两侧中部，中间断开约 18px
- 文字：ABYSS（全大写，Helvetica，letter-spacing 0.45em）
- 位置：图形下方
- 文件：`E:\VM\AI_audio\abyss_logo.html`

### 配色表

| 用途 | 色值 |
|------|------|
| 背景主色 | `#000000` / `#050508` |
| 背景次色 | `#0a0a1a` |
| 主强调色 | `#3b82f6` (blue-700) |
| 次强调色 | `#60a5fa` (blue-400) |
| 文字主色 | `#ffffff` |
| 荧光色 | `rgba(96, 165, 250, 0.15~0.5)` |

### 字体
- **主字体**：Satoshi（Fontshare CDN）— 干净几何 sans，有科技感不冷
- **歌词字体**：Georgia Italic（serif 斜体，营造意境）
- CDN 引入于 `index.html`

### 材质
- **Liquid Glass**：`backdrop-filter: blur(6px)` + `::before` 渐变边框
- **Bioluminescence 光晕**：`box-shadow` 多层柔光 + `blur` 效果
- **粒子**：蓝绿色发光圆点，`RadialGradient` 绘制光晕

---

## 6. 已完成功能模块清单

### 前端（ai-radio-v1/）

| 功能 | 实现方式 | 文件 |
|------|---------|------|
| 播放器控制 | React state + requestAnimationFrame 计时 | CenterPlayer.tsx |
| 进度条拖动 | onMouseDown/onMouseMove/onMouseUp | CenterPlayer.tsx |
| 音量控制 | drag on vertical bar + toggle mute | CenterPlayer.tsx |
| 点歌功能 | 聊天输入 → 匹配播放列表 | useRadioState.ts |
| AI 聊天 | 感应条展开 → 消息列表 | AIBeam.tsx |
| 歌词显示 | 按进度索引歌词数组，单词级高光 | CenterPlayer.tsx |
| 全屏歌词 | 点封面切换歌词视图 | CenterPlayer.tsx |
| 沉浸黑胶 | AnimatePresence 滑动切歌动画 | ImmersiveView.tsx |
| 波形可视化 | Canvas 模拟波形（160 bars） | ImmersiveView.tsx |
| 粒子背景 | Canvas 生物荧光粒子 | BioParticles.tsx |
| 视图切换 | AnimatePresence + mode state | ViewToggle.tsx |

### 后端（ai-radio/server/ — 部分完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| Express 骨架 | ✅ 已完成 | index.mjs, health endpoint, CORS, 404 |
| Vite Proxy | ✅ 已完成 | vite.config.ts proxy /api → :4000 |
| WebSocket 骨架 | ✅ 已完成 | ws.js（setup + broadcast） |
| 前端 api.ts | ✅ 已完成 | fetch 封装 GET/POST |
| 前端 ws.ts | ✅ 已完成 | 自动重连 WebSocket |
| 音乐搜索 API | ❌ 空文件 | ncm.mjs 内容为空，需要重写 |
| 音乐 URL API | ❌ 空文件 | 同上 |
| 歌词 API | ❌ 空文件 | 同上 |
| 测试 | ✅ 部分 | api.test.js 4 个基础测试通过 |

---

## 7. 待完成功能与待解决问题

### 紧急（阻塞开发）

| 问题 | 说明 | 解决方案 |
|------|------|---------|
| `ncm.mjs` 为空 | 文件在多次写入中被截断，内容丢失 | **需要重写 music API 模块** |
| `ai-radio-v1/` vs `ai-radio/` | 前端代码在两个目录有重叠 | 需要决定统一到哪个目录 |

### V4 后续

| 功能 | 优先级 |
|------|--------|
| 补全 ncm.mjs（searchNetease/searchKuGou/searchBoth/getUrl/getLyric） | P0 |
| 前端对接真实搜索（替换模拟数据） | P0 |
| 配置 DeepSeek API Key + LLM 聊天 | P1 |
| SQLite 存储（历史/偏好） | P1 |
| 前端播放真实音频 | P2 |

### 已知卡点
1. **npm install 在 Linux 环境超时** — 需要用户在 Windows 上手动装包
2. **`@meting/core` 是 ESM only** — 后端需要写 `.mjs` 或 `type: module`
3. **`ai-radio-v1/` 和 `ai-radio/` 两个目录** — v1 是旧前端，ai-radio 是新目录含 server，但前端代码不全在 ai-radio/src 里。实际可运行的完整前端在 `ai-radio-v1/`
4. **`spec.md` 已被截断** — 只有 7 行，内容不全

---

## 8. 项目文件结构与核心组件说明

### 根目录（E:\VM\AI_audio\）

```
E:\VM\AI_audio\
├── start.bat                         ← 一键启动（前端 + 后端）
├── spec.md                           ← 项目规格书（已截断，需要重写）
├── AI电台项目路线图.md               ← 原始路线图（参考用）
├── abyss_logo.html                   ← Logo SVG 设计文件
├── opening_sequence.html             ← 开屏动画原型（纯 HTML）
├── ai-radio-v1/                      ← ✅ 当前可运行的前端（重要）
│   └── src/
│       ├── App.tsx                   ← 根组件，状态管理 + 视图切换
│       ├── components/
│       │   ├── background/           ← BioParticles.tsx（荧光粒子）
│       │   ├── chat/                 ← AIBeam.tsx, BreathingLight.tsx
│       │   ├── layout/               ← RadioView.tsx, ImmersiveView.tsx, ViewToggle.tsx
│       │   ├── player/               ← CenterPlayer.tsx（播放器核心）
│       │   ├── sidebar/              ← LeftSidebar.tsx
│       │   └── portal/               ← PortalAnimation.tsx（开屏，跳过）
│       ├── hooks/                    ← useRadioState.ts（全局状态）
│       ├── styles/                   ← globals.css（Liquid Glass + 动画）
│       └── types/ + utils/           ← 类型定义 + 工具函数
│
├── ai-radio/                         ← 新目录（前端骨架 + 后端）
│   ├── src/                          ← 前端代码（稀疏，不全）
│   │   ├── services/                 ← api.ts, ws.ts
│   │   └── vite.config.ts
│   ├── server/                       ← Express 后端
│   │   ├── index.mjs                 ← 入口（ESM 模块）
│   │   ├── ncm.mjs                   ← ⚠️ 文件为空，需要重写
│   │   ├── ws.js                     ← WebSocket 模块
│   │   ├── test/
│   │   └── package.json
│   └── package.json
│
└── docs/
    └── superpowers/
        └── plans/                    ← V4 实现计划
```

### 核心组件说明

| 组件 | 文件位置 | 角色 |
|------|---------|------|
| App.tsx | ai-radio-v1/src/ | 根组件：BioParticles 背景 → 视图切换 → Radio/Immersive |
| useRadioState | ai-radio-v1/src/hooks/ | 全局状态管理：播放器/聊天/歌词/音量 |
| CenterPlayer | ai-radio-v1/src/components/player/ | 播放器核心：封面/歌词/进度条/控制/全屏歌词 |
| AIBeam | ai-radio-v1/src/components/chat/ | AI 感应条 + 聊天面板 |
| RadioView | ai-radio-v1/src/components/layout/ | 三栏布局容器 |
| ImmersiveView | ai-radio-v1/src/components/layout/ | 沉浸式：黑胶/歌词/波形/切歌 |
| BioParticles | ai-radio-v1/src/components/background/ | Canvas 荧光粒子 |
| index.mjs | ai-radio/server/ | Express 后端入口 |
| ncm.mjs | ai-radio/server/ | ⚠️ 音乐 API（需重写） |

---

## 9. 数据模型、API 与模拟数据情况

### 数据模型

```typescript
// types/index.ts
interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string;  // 渐变色字符串 "#1a0a2e-#16213e"（模拟）/ URL（真实）
  duration: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}
```

### 模拟数据位置

- **播放列表**：`useRadioState.ts` 中的 `PLAYLIST` 常量（5 首假数据）
- **歌词**：`useRadioState.ts` 中的 `LYRICS` 对象（每首歌配 8 句假歌词）
- **AI 回复**：`App.tsx` 中的 `handleSend` — 硬编码字符串

### API 设计（后端）

| 端点 | 方法 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| `/api/health` | GET | — | 健康检查 | ✅ |
| `/api/music/search` | GET | q, source | 搜索歌曲（source: both/netease/kugou） | ❌ 空文件 |
| `/api/music/url` | GET | id, source | 获取播放地址 | ❌ 空文件 |
| `/api/music/lyric` | GET | id, source | 获取歌词 | ❌ 空文件 |

---

## 10. 环境、配置与启动方式

### 启动命令

```bash
# 双击 start.bat（一键启动前端 + 后端）

# 或手动：
# 终端 1 — 后端
cd E:\VM\AI_audio\ai-radio\server
node index.mjs

# 终端 2 — 前端
cd E:\VM\AI_audio\ai-radio-v1
node node_modules\vite\bin\vite.js
```

### 访问地址
- 前端：http://localhost:3000
- 后端：http://localhost:4000

### Node 版本
- Cowork 环境：Node 22.22.0
- Windows：Node 24.13.0
- 兼容 Node.js 18+

### 环境变量
后端需要 `.env` 文件（`ai-radio/server/.env`）：
```
DEEPSEEK_API_KEY=sk-your-key-here
```
（用户自行从 deepseek.com 获取，还未配置）

### 代理配置
Vite proxy 已在 `vite.config.ts` 中配好：
```typescript
server: {
  port: 3000,
  proxy: { '/api': 'http://localhost:4000' },
}
```

---

## 11. 开发环境与工具链说明（重要）

### 项目来源
本项目完全在 **Claude Code Cowork 界面** 中通过 vibe coding 方式开发。绝大部分代码由 AI 辅助生成，伴随着大量的试错和迭代修改。

### 是否可脱离 Cowork 历史运行

**可以**，但需要注意：

| 要点 | 说明 |
|------|------|
| ✅ 代码完整性 | 所有已完成的组件代码都在文件系统中，不依赖对话历史 |
| ✅ 启动方式 | `start.bat` 双击即可运行，不需要 Cowork |
| ❌ `ncm.mjs` 为空 | 这个文件在多次写入中被截断，**需要重写** |
| ❌ 决策记录 | `spec.md` 已被截断，以下关键决策仅存于对话历史 |

### 需要从对话中提取的决策记录

1. **品牌名 Abyss** — 从开篇动画构思中诞生的名字，Logo 为 V 形 + 断开横线
2. **Bioluminescence 视觉方向** — 不是全息/赛博朋克，是深海荧光
3. **方案 A 前后端分离** — Express 端口 4000，Vite proxy
4. **双音乐源** — 网易云 + 酷狗通过 `@meting/core` 聚合
5. **DeepSeek API** — 用户有 DeepSeek Key，未配置
6. **开屏动画** — 构思完成但跳过，等 AI 生成视频素材
7. **跳过 PWA** — 留到最后
8. **跳过移动端适配** — 等桌面端完成再考虑

### 对新 Code 界面的接手建议

1. **先完整跑一遍项目**：双击 `start.bat` 确认前端在 `http://localhost:3000` 能打开
2. **首选重写 `ncm.mjs`**：这是当前最大阻塞项，参考 `docs/superpowers/plans/2026-06-18-v4-backend.md` 中的代码
3. **统一代码目录**：`ai-radio-v1/` 是完整前端，`ai-radio/` 有后端但前端代码不全。建议迁移方向：前端代码统一到 `ai-radio/src/`
4. **补充注释**：组件基本无注释，建议给关键函数加 JSDoc
5. **恢复 spec.md**：本文档可替代 spec.md 作为项目参考
6. **`ai-radio/server/package.json` 中的 `dependencies` 列表是准确的**，直接 `npm install` 即可

### 代码质量备注
- 组件内的内联样式（`style={{}}`）较多 — 优先用 Tailwind
- 部分动画性能可通过 `will-change` 优化
- 歌词数据目前是硬编码，等接入真实音乐源后需要从 API 获取
