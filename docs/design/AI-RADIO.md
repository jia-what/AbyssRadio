# AI Radio — 活文档

> 唯一设计/续接文档。一句话定义：**AI Radio = 有 AI 陪聊的听歌空间**。

## 产品

不是传统播放器，而是一个正在播放情绪与电波的房间。深夜、漂浮、陪伴、低信息密度。

三面交互收敛：
- **默认常显**：底部播放条
- **按需唤出**：左 AI / 右歌单（按钮或贴边手势）

核心体验：点歌到出声顺畅、歌词同步、封面完整、AI 知道「正在听什么」。

## 目录（只改这两处）

| 路径 | 职责 |
|------|------|
| `ai-radio-v1/` | 前端 — React + TypeScript + Vite + Tailwind + Motion |
| `ai-radio/server/` | 后端 — Node + Express |

启动：根目录 `start.bat` → 后端 `:4000` / 前端 `:3000`。

备份（清理前）：`E:\VM\AI_audio_bak_20260802`。决策单：`docs/COUNCIL-20260802.md`。

## 设计原则（体验愿景）

- 空间感优先，不堆组件；大量留白；前景 / 中景 / 背景纵深
- 动画慢、像呼吸；背景永远比前景更慢
- 半透明、低饱和、克制；禁止仪表盘 / 信息流 / 密集卡片
- 每次改动：先改善体验，不为功能破坏氛围

## 核心链路

登录（网易云 Cookie / 酷狗扫码）→ 统一会话 `session.mjs` → 取流（`url-smart` 主源 + 一层兜底）→ 播放 / 歌词 → AI 对话注入当前曲目。

封面统一经 `/api/img`；歌单播放走 `playPlaylist()`（按 id+source 取流，不用搜索代替）。

## 稳定 API 面（外部 / 贾维斯）

统一响应：`{ code, data, msg }`（`code === 0` 成功）。

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/health` | 探活 |
| `GET` | `/api/metrics` | 取流成功/失败计数 |
| `POST` | `/api/queue/add` | 入队（id/hash + source） |
| `POST` | `/api/player/play` | 播队列第 n 首或指定 id |
| `GET` | `/api/player/status` | 当前播放 + 队列 |

SPA 仍使用既有 `/api/music/*`、`/api/session/*`、`/api/chat` 等；新面不破坏旧调用。

## 环境坑

- PowerShell 会吞 `$` 变量；链式用 `;`
- 端口 4000 残留旧进程 → `start.bat` 或杀 PID
- 改后端需重启；前端 Vite 热更新
- 勿提交 `.env` 真实 Cookie

## 刻意搁置（费曼实验三）

新功能想法先记一周再做。当前不扩第三音源、不开场动画，直到核心链路连跑稳定。
