# AI Radio

沉浸式「音乐空间」网页电台：满屏粒子背景 + 居中歌词，四周面板鼠标贴边自动浮出（左 AI / 右歌单 / 下播放条）。

## 启动

```
start.bat
```
会清理 4000/3000 端口并同时拉起前后端：
- 后端 http://localhost:4000
- 前端 http://localhost:3000

## 目录结构

```
AI_audio/
├── ai-radio-v1/        前端（在用）— React + TypeScript + Vite + Tailwind + Motion
│   └── src/
│       ├── components/   按区域拆分：center / bottom / columns / layout / background / portal
│       ├── hooks/        useRadioState（播放/队列/歌词）、useEdgePanels（贴边浮出）
│       ├── services/     api.ts、playlistApi.ts
│       ├── types/  utils/  styles/
│
├── ai-radio/
│   └── server/         后端（在用）— Node + Express
│       ├── index.mjs     API 路由
│       ├── login.mjs     网易云 Cookie 登录 / 歌单
│       ├── kugou.mjs     酷狗（歌单 API 待 Phase 5）
│       ├── ncm.mjs / ncm-neapi.mjs   Meting + VIP 取流
│       ├── session.mjs   内存会话（Cookie 绑定）
│       ├── deepseek.mjs  AI 对话
│       └── db.mjs        SQLite（历史/喜欢）
│
├── docs/
│   ├── design/         设计文档：体验愿景、路线图、交接、spec
│   └── superpowers/    历史方案记录
│
├── prototypes/         实验性 HTML 原型（logo / 开场动画 / 早期界面）
│
├── _archive/           归档：旧前端 (old-frontend)、备份 (ai-radio_bak)、孤儿文件
│                       —— 死代码，未来确认无用 + 接入 git 后可删
│
└── start.bat
```

## 说明

- **在用的只有 `ai-radio-v1/`（前端）和 `ai-radio/server/`（后端）**，其余为文档、原型或归档。
- `_archive/` 内全是历史/死代码，搜索时可忽略；建议尽快 `git init` 后将其删除并改用提交历史做备份。
