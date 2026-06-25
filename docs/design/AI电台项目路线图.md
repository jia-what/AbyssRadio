# AI 电台项目 — Vibe Coding 完整路线图

## 项目概述
- **名称**: AI 电台
- **类型**: 单页应用 (SPA)
- **风格**: Dark Sci-Fi · 全息 · 深邃
- **技术栈**: React + TypeScript + Vite + Tailwind CSS + Motion (Framer Motion v12) + lucide-react

---

## 阶段 0: 准备期 (1-2天)

### 0.1 核心定义
AI 电台是一个沉浸式音乐播放界面，用户可以进行点歌、切歌、实时聊天互动。
界面风格为深色科幻，带有电影级开屏动画和 Liquid Glass 材质UI。

### 0.2 功能清单 (优先级排序)

#### Must Have (核心功能)
- [ ] Portal 开屏动画 (3-4s, Canvas生成)
- [ ] 背景循环视频/粒子系统
- [ ] 播放器控件 (播放/暂停, 进度条, 时间显示)
- [ ] 点歌功能 (输入歌名, 模拟AI播放)
- [ ] 切歌功能 (上一首/下一首)
- [ ] 实时聊天窗口 (用户消息 + AI回复)
- [ ] Liquid Glass UI材质
- [ ] 响应式布局 (移动端/桌面端)

#### Should Have (重要功能)
- [ ] 当前播放列表显示
- [ ] 歌曲历史记录
- [ ] 音量控制
- [ ] 设置面板 (主题/音效等)

#### Nice to Have (扩展功能)
- [ ] 音频波形可视化
- [ ] 用户头像/昵称
- [ ] 歌词显示
- [ ] 分享功能

### 0.3 技术选型确认
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18+ | UI框架 |
| TypeScript | 5.0+ | 类型安全 |
| Vite | 5.0+ | 构建工具 |
| Tailwind CSS | 3.4+ | 样式方案 |
| Motion (Framer Motion) | v12 | 动画库 |
| lucide-react | latest | 图标库 |
| Canvas 2D API | 原生 | 开屏粒子动画 |

### 0.4 素材清单
- [ ] 背景视频 (深色抽象粒子, 5-15秒循环, MP4)
- [ ] 字体: Helvetica Regular (OnlineWebFonts CDN)
- [ ] 图标: lucide-react (ShoppingCart, BarChart3, Heart, Menu, X, Play, Pause, SkipForward, SkipBack, MessageCircle, Settings)
- [ ] 配色方案: 深黑底(#000, #0a0a1a) + 蓝白高光(#3b82f6, #60a5fa, #fff)

---

## 阶段 1: 设计期 (1-2天)

### 1.1 页面布局草图

```
暂未确定
```

### 1.2 交互流程

用户打开页面 → Portal开屏动画(3-4s) → 自动切换主界面 → 背景视频/粒子开始播放 → UI渐入浮现

核心操作路径:
1. 点歌: 点击"点歌" → 输入歌名 → 发送 → AI回复"正在播放" → 播放器更新
2. 切歌: 点击"切歌"/"上一首"/"下一首" → 播放器切换 → 聊天显示切换信息
3. 聊天: 点击"打开聊天" → 展开聊天窗口 → 输入消息 → 显示对话

### 1.3 开屏动画时间轴 (精确版)

| 时间 | 画面描述 | 技术实现 |
|------|----------|----------|
| 0.0-0.5s | 纯黑画面 | CSS bg-black |
| 0.5-1.5s | 中心出现微弱光点, 镜头持续缓慢推近 | Canvas绘制光点, 逐渐放大+变亮 |
| 1.5-1.8s | 第一次敲击颤动, 粒子不规则向四周溅射 | 粒子系统爆发, 方向随机, 力度轻柔 |
| 2.0-2.3s | 第二次敲击颤动, 粒子溅射 | 粒子系统爆发 |
| 2.5-2.8s | 第三次敲击颤动, 粒子溅射 | 粒子系统爆发 |
| 3.0-3.2s | 光点收缩蓄力 | 光点缩小, 亮度急剧增加 |
| 3.2-3.5s | 闪光弹效果: 白光瞬间铺满全屏 | Canvas全屏白色渐变, 一帧内完成 |
| 3.5-4.0s | 白光缓慢褪去, UI轮廓从中心浮现 | 透明度动画 + UI渐入 (Motion stagger) |
| 4.0s | 开屏结束, 切换主界面, 背景视频/粒子开始 | 状态切换 showMain = true |

### 1.4 组件拆分

```
App.tsx (根组件)
├── PortalAnimation.tsx (开屏动画层, 3-4s)
│   └── Canvas粒子系统 (中心光点/敲击/溅射/闪光弹)
├── MainInterface.tsx (主界面)
│   ├── BackgroundLayer.tsx (背景层)
│   │   ├── BoomerangVideoBg.tsx (视频循环, 可选)
│   │   └── ParticleBackground.tsx (Canvas粒子, 降级方案)
│   ├── Header.tsx (顶部导航)
│   │   ├── Logo.tsx (SVG图标 + 文字)
│   │   ├── NavLinks.tsx (导航链接)
│   │   ├── CartButton.tsx (购物车按钮)
│   │   └── MobileMenu.tsx (移动端菜单)
│   ├── HeroContent.tsx (主内容区)
│   │   ├── StatusBadge.tsx (状态标签)
│   │   ├── Headline.tsx (大标题)
│   │   ├── Subtext.tsx (副标题)
│   │   └── ActionButtons.tsx (操作按钮组)
│   │       ├── RequestSongButton.tsx (点歌)
│       ├── SkipSongButton.tsx (切歌)
│       └── ChatToggleButton.tsx (聊天开关)
│   ├── ChatDrawer.tsx (聊天抽屉)
│   │   ├── ChatHeader.tsx (聊天头部)
│   │   ├── ChatMessages.tsx (消息列表)
│   │   └── ChatInput.tsx (输入框)
│   └── NowPlayingWidget.tsx (播放器组件)
│       ├── TrackInfo.tsx (歌曲信息)
│       ├── ProgressBar.tsx (进度条)
│       ├── TimeDisplay.tsx (时间显示)
│       └── ControlButtons.tsx (控制按钮)
│           ├── PrevButton.tsx (上一首)
│           ├── PlayPauseButton.tsx (播放/暂停)
│           ├── NextButton.tsx (下一首)
│           └── LikeButton.tsx (收藏)
└── GlobalStyles.tsx (全局样式/Liquid Glass)
```

---

## 阶段 2: 开发期 (3-5天)

### 开发顺序 (严格按此顺序)

1. **Day 1: 脚手架 + 全局样式**
   - `npm create vite@latest ai-radio --template react-ts`
   - 安装依赖: `npm install tailwindcss postcss autoprefixer motion lucide-react`
   - 配置 Tailwind (tailwind.config.js)
   - 配置字体 (index.html 引入 Helvetica)
   - 实现 Liquid Glass CSS 类
   - 实现 Fade-Up 入场动画 CSS

2. **Day 2: 静态布局 (无动画)**
   - 搭建 Header 组件 (Logo, Nav, Cart, MobileMenu)
   - 搭建 HeroContent 组件 (Badge, Headline, Subtext, Buttons)
   - 搭建 NowPlayingWidget 组件
   - 搭建 ChatDrawer 组件
   - 确保所有组件正确渲染, 布局正确

3. **Day 3: 开屏动画 (Portal)**
   - 实现 Canvas 粒子系统
   - 实现中心光点绘制
   - 实现敲击颤动效果
   - 实现粒子溅射效果 (打铁火星风格, 力度轻柔)
   - 实现闪光弹全屏效果
   - 实现时间轴控制 (精确到0.1s)
   - 测试动画流程

4. **Day 4: 背景层 + 交互动画**
   - 集成 BoomerangVideoBg (或 Canvas ParticleBackground)
   - 实现开屏→主界面切换逻辑
   - 使用 Motion 实现 UI 浮现动画 (stagger from center)
   - 实现 hover/active 交互效果
   - 实现按钮点击反馈

5. **Day 5: 功能逻辑 + 响应式**
   - 实现点歌功能 (mock数据)
   - 实现切歌功能
   - 实现聊天功能 (mock AI回复)
   - 实现播放器控制 (播放/暂停/进度)
   - 移动端适配 (断点: sm/md/lg)
   - 触摸交互优化

### 关键技术实现要点

#### Liquid Glass CSS (全局样式)
```css
.liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
.liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
    rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
    rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

#### Fade-Up 入场动画 (CSS)
```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: none; }
}
.animate-fade-up {
  animation: fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
/* CRITICAL: 使用 backwards, 不是 both 或 forwards */
```

#### 开屏动画 Canvas 架构
```typescript
// PortalAnimation.tsx 核心逻辑
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  life: number;
}

class PortalAnimator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private phase: 'black' | 'approach' | 'strike' | 'flash' | 'reveal' = 'black';
  private startTime: number = 0;

  // 时间轴控制
  private timeline = [
    { phase: 'black', duration: 500 },
    { phase: 'approach', duration: 1000 },
    { phase: 'strike', duration: 1500 }, // 3次敲击
    { phase: 'flash', duration: 500 },
    { phase: 'reveal', duration: 500 },
  ];

  public start() {
    this.startTime = performance.now();
    this.loop();
  }

  private loop() {
    const elapsed = performance.now() - this.startTime;
    this.updatePhase(elapsed);
    this.render();

    if (elapsed < 4000) {
      requestAnimationFrame(() => this.loop());
    } else {
      this.onComplete?.();
    }
  }

  private render() {
    // 根据当前 phase 渲染不同画面
  }
}
```

---

## 阶段 3: 测试优化期 (1-2天)

### 3.1 功能测试清单
- [ ] 开屏动画完整播放 (3-4s)
- [ ] 开屏→主界面自动切换
- [ ] 背景视频/粒子正常循环
- [ ] 点歌按钮点击正常
- [ ] 切歌按钮点击正常
- [ ] 聊天窗口展开/收起
- [ ] 聊天消息发送/显示
- [ ] 播放器播放/暂停
- [ ] 播放器上一首/下一首
- [ ] 播放器进度条显示
- [ ] 收藏按钮切换状态
- [ ] 移动端菜单展开/收起
- [ ] 所有导航链接正常

### 3.2 动画测试清单
- [ ] 开屏动画帧率稳定 (60fps)
- [ ] 粒子数量适中 (不过多/过少)
- [ ] 敲击时间点准确 (1.5s, 2.0s, 2.5s)
- [ ] 闪光弹效果足够亮
- [ ] UI浮现顺序正确 (从中心向外)
- [ ] 背景动画流畅
- [ ] hover效果响应及时

### 3.3 性能测试
- [ ] Lighthouse 性能评分 > 90
- [ ] 首屏加载时间 < 2s
- [ ] 动画帧率稳定 (无掉帧)
- [ ] 内存占用稳定 (无泄漏)
- [ ] 低性能设备测试 (降低粒子数)

### 3.4 降级测试
- [ ] prefers-reduced-motion: 动画禁用
- [ ] 低性能设备: Canvas粒子降级为CSS
- [ ] 无视频时: Canvas背景正常工作
- [ ] 移动端: 触摸交互正常

### 3.5 视觉微调
- [ ] 间距统一 (8px倍数)
- [ ] 颜色对比度检查
- [ ] 字体渲染清晰
- [ ] 动画缓动自然
- [ ] Liquid Glass效果可见

---

## 阶段 4: 部署期 (0.5天)

### 4.1 构建
```bash
npm run build
```

### 4.2 部署平台选择
| 平台 | 优点 | 推荐度 |
|------|------|--------|
| Vercel | 零配置, 自动HTTPS, 全球CDN | ⭐⭐⭐⭐⭐ |
| Netlify | 拖拽部署, 表单功能 | ⭐⭐⭐⭐ |
| Cloudflare Pages | 极速, 边缘网络 | ⭐⭐⭐⭐ |
| GitHub Pages | 免费, 简单 | ⭐⭐⭐ |

### 4.3 部署步骤 (Vercel)
1. 代码推送到 GitHub
2. 登录 Vercel, 导入项目
3. 配置构建命令: `npm run build`
4. 配置输出目录: `dist`
5. 点击 Deploy
6. 获得域名: `https://ai-radio.vercel.app`

---

## 素材清单 (详细)

### 字体
- Helvetica Regular
- CDN: https://db.onlinewebfonts.com/c/a64ff11d2c24584c767f6257e880dc65?family=Helvetica+Regular
- 备用: Helvetica, Arial, sans-serif

### 图标 (lucide-react)
- ShoppingCart (购物车)
- BarChart3 (播放器图标)
- Heart (收藏)
- Menu (菜单)
- X (关闭)
- Play (播放)
- Pause (暂停)
- SkipForward (下一首)
- SkipBack (上一首)
- MessageCircle (聊天)
- Settings (设置)
- Volume2 (音量)

### 配色方案
| 用途 | 色值 | Tailwind |
|------|------|----------|
| 背景主色 | #000000 | bg-black |
| 背景次色 | #0a0a1a | bg-[#0a0a1a] |
| 主强调色 | #3b82f6 | blue-700 |
| 次强调色 | #60a5fa | blue-400 |
| 文字主色 | #ffffff | text-white |
| 文字次色 | rgba(255,255,255,0.9) | text-white/90 |
| 文字辅助 | rgba(255,255,255,0.5) | text-white/50 |
| 玻璃边框 | rgba(255,255,255,0.1) | border-white/10 |

### 背景视频 (可选)
- 要求: 深色抽象, 微光粒子缓慢飘动, 5-15秒循环, MP4格式
- 分辨率: 1920x1080+
- 文件大小: < 5MB (压缩后)
- 获取方式: Runway/Pika生成, 或Pexels/Pixabay下载

---

## 风险与备选方案

### 风险1: 开屏动画性能不佳
- **症状**: 帧率低于30fps, 卡顿
- **解决方案**: 减少粒子数量(50→30), 降低Canvas分辨率, 使用requestAnimationFrame节流
- **降级方案**: 简化为CSS动画 (光点放大+白色渐变)

### 风险2: 背景视频加载慢
- **症状**: 首屏加载超过3s, 视频循环不流畅
- **解决方案**: 视频压缩, 使用CDN, 预加载
- **降级方案**: 使用Canvas粒子背景替代

### 风险3: Liquid Glass效果不明显
- **症状**: 玻璃质感弱, 像普通半透明
- **解决方案**: 调整backdrop-filter blur值, 增加边框高光, 确保背景有内容可模糊
- **降级方案**: 使用纯色半透明背景

### 风险4: 移动端体验差
- **症状**: 触摸不灵敏, 布局错乱, 动画卡顿
- **解决方案**: 增加触摸事件, 简化布局, 减少粒子数
- **降级方案**: 移动端禁用复杂动画

---

## 项目文件结构

```
ai-radio/
├── public/
│   ├── bg-video.mp4          # 背景视频 (可选)
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── portal/
│   │   │   ├── PortalAnimation.tsx
│   │   │   └── ParticleSystem.ts
│   │   ├── background/
│   │   │   ├── BoomerangVideoBg.tsx
│   │   │   └── ParticleBackground.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Logo.tsx
│   │   │   ├── NavLinks.tsx
│   │   │   ├── CartButton.tsx
│   │   │   └── MobileMenu.tsx
│   │   ├── hero/
│   │   │   ├── HeroContent.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── Headline.tsx
│   │   │   ├── Subtext.tsx
│   │   │   └── ActionButtons.tsx
│   │   ├── chat/
│   │   │   ├── ChatDrawer.tsx
│   │   │   ├── ChatHeader.tsx
│   │   │   ├── ChatMessages.tsx
│   │   │   └── ChatInput.tsx
│   │   └── player/
│   │       ├── NowPlayingWidget.tsx
│   │       ├── TrackInfo.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── TimeDisplay.tsx
│   │       └── ControlButtons.tsx
│   ├── hooks/
│   │   ├── usePortalAnimation.ts
│   │   ├── useBoomerangVideo.ts
│   │   └── useMediaQuery.ts
│   ├── styles/
│   │   ├── liquid-glass.css
│   │   ├── fade-up.css
│   │   └── globals.css
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── formatTime.ts
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## 开发环境配置

### 1. 创建项目
```bash
npm create vite@latest ai-radio --template react-ts
cd ai-radio
```

### 2. 安装依赖
```bash
npm install
npm install -D tailwindcss postcss autoprefixer
npm install motion lucide-react
npx tailwindcss init -p
```

### 3. 配置 Tailwind
```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        helvetica: ['Helvetica Regular', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

### 4. 配置字体 (index.html)
```html
<link rel="stylesheet" href="https://db.onlinewebfonts.com/c/a64ff11d2c24584c767f6257e880dc65?family=Helvetica+Regular" />
<style>
  html { font-family: 'Helvetica Regular', Helvetica, Arial, sans-serif; }
</style>
```

---

## 里程碑检查点

| 里程碑 | 检查内容 | 预计时间 |
|--------|----------|----------|
| M1: 脚手架完成 | 项目能运行, Tailwind生效, 字体加载 | Day 1 |
| M2: 静态布局完成 | 所有组件渲染, 布局正确, 无动画 | Day 2 |
| M3: 开屏动画完成 | Canvas粒子, 时间轴准确, 流畅 | Day 3 |
| M4: 交互完成 | 背景+UI动画, hover效果, 切换逻辑 | Day 4 |
| M5: 功能完成 | 点歌/切歌/聊天/播放器, 响应式 | Day 5 |
| M6: 测试完成 | 功能/动画/性能/降级测试通过 | Day 6-7 |
| M7: 部署完成 | 线上可访问, 分享链接 | Day 7-8 |

---

## 备注

- 所有动画使用 `animation-fill-mode: backwards` (不是 both/forwards), 避免破坏 backdrop-filter
- 优先使用 CSS 动画, 复杂交互使用 Motion
- 保持组件单一职责, 便于测试和复用
- 定期提交代码, 每个里程碑一个 commit
- 遇到技术难题先查文档, 再搜索, 最后问 AI
