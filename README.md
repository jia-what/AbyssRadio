# AI Radio

**有 AI 陪聊的听歌空间。** 满屏封面粒子 + 居中歌词；默认常显底部播放条，AI 与歌单收在角落按钮里。

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
├── ai-radio-v1/        前端 — React + TypeScript + Vite + Tailwind + Motion
├── ai-radio/server/    后端 — Node + Express
├── docs/design/        活文档 AI-RADIO.md（唯一续接文档）
├── images/             参考图
└── start.bat
```

## 说明

- 只改 `ai-radio-v1/` 与 `ai-radio/server/`。
- 续接请读 [`docs/design/AI-RADIO.md`](docs/design/AI-RADIO.md)。
- 现状快照（含封面/歌词迁移）：[`docs/PROJECT-STATUS-20260803.md`](docs/PROJECT-STATUS-20260803.md)。
- 圆桌决策单：[`docs/COUNCIL-20260802.md`](docs/COUNCIL-20260802.md)。
- 清理前备份：`E:\VM\AI_audio_bak_20260802`。
