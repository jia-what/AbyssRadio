# Phase 5 交接简报（续接用）

> 用途：新会话先读本文件 + `README.md` + `docs/design/AI Radio — Experience & Design Vision.md`，即可无缝接续 Phase 5。

## 复制给新会话的开场话术

```
先读 docs/design/PHASE-5-BRIEF.md、README.md 和 docs/design/AI Radio — Experience & Design Vision.md，然后开始 Phase 5。

Phase 4 已完成：CoverParticleField 封面粒子 + PULSE/鼓点律动 + LyricStage 3D + 播放条修复。详见 docs/design/PHASE-4-BRIEF.md。

Phase 5 目标：酷狗 Cookie 绑定用户的歌单列表与曲目列表 API，与现有网易云 session 流程并列；前端 PlaylistColumn 可加载酷狗歌单并 playPlaylist 顺序播放。
```

## 当前状态（Phase 4 完成后）

- **Git 基线**：`Phase 4: CoverParticleField + 鼓点律动 + 播放条修复`
- **在用的目录**：前端 `ai-radio-v1/`、后端 `ai-radio/server/`
- **启动**：根目录 `start.bat`

### 已完成（勿破坏）

- 网易云 Cookie 绑定 + 歌单/曲目：`login.mjs` + `/api/session/*`
- 酷狗 Cookie **验证** + VIP 取流：`kugou.mjs` `verifyKugouCookie`；`ncm.mjs` 搜索/播放 kugou 源
- 前端 `playPlaylist(tracks, startIndex, sessionKey)` — 队列=整张歌单按 id+source 取流
- 封面 `/api/img` 代理；Phase 4 视觉/PULSE 全栈

## Phase 5 目标：酷狗歌单 API

### 问题

`ai-radio/server/kugou.mjs` 中 `getKugouPlaylistsByCookie` / `getKugouTracksByCookie` **仍为占位**，抛出：

> 酷狗歌单接口开发中，暂请使用网易云 Cookie

用户绑定酷狗 Cookie 后无法加载「我的歌单」，只能搜歌/单曲播放。

### 技术要点

酷狗用户歌单列表接口：

- 端点：`/v7/get_all_list`（`cloudlist.service.kugou.com`）
- 需要 **Android 客户端签名链路**：`appid` / `clientver` / `signature` 等（PHASE-2 路线图已注明）
- Cookie 字段：`KugooID`（userid）、`t`（token）、`kg_mid`；`verifyKugouCookie` 已解析

参考：

- `docs/design/PHASE-2-BRIEF.md` — Phase 5 一行说明
- `docs/design/ABYSS_RADIO_HANDOVER.md` — 双源 @meting/core 背景
- 开源实现：搜索 KuGou `get_all_list` / `cloudlist` Android sign（勿整段复制 GPL 代码，理解签名算法后手写）

### 后端任务（预期）

| 任务 | 文件 |
|------|------|
| 实现 Android 签名 + `get_all_list` 请求 | `ai-radio/server/kugou.mjs`（或拆 `kugouSign.mjs`） |
| 歌单内曲目列表 API | 同上，对接 cloudlist / tracker 相关端点 |
| 统一返回格式 | 与 `getNeteasePlaylistsByCookie` 对齐：`{ id, name, cover, trackCount }` / tracks `{ id, title, artist, cover, duration, source: 'kugou' }` |
| 会话路由 | `index.mjs` `/api/session/playlists`、`/api/session/tracks` 已有 `platform === 'kugou'` 分支，填实现即可 |
| 测试 | 扩展 `ai-radio/server/test/api.test.js`（mock 或集成，视 Cookie 可用性） |

### 前端任务（预期）

| 任务 | 文件 |
|------|------|
| 绑定 UI 支持酷狗平台（若尚未完整） | `LoginPanel` / session API 调用处 |
| 歌单列表展示酷狗来源 | `PlaylistColumn.tsx` |
| 播放 | 已有 `playPlaylist()` + `source: 'kugou'` 取流，验证即可 |

### 验收标准

1. 粘贴有效酷狗 Cookie → 绑定成功，显示昵称
2. 右侧/load 歌单 → 返回用户自建/收藏歌单列表（非空）
3. 点击歌单 → 加载曲目，封面经 `/api/img` 显示
4. 播放 → 顺序队列，切歌封面/歌词/进度正常（Phase 4 已修竞态）
5. VIP 曲目在有 Cookie 时可播放（现有 `ncm.mjs` kugou 取流路径）

### 不在 Phase 5 范围

- Phase 6 开场动画
- 新视觉/PULSE 功能
- 酷狗以外的第三源（kuwo 等）除非顺手

## 环境坑（务必遵守）

- PowerShell 吞 `$` → 用纯路径/git/node；链式用 `;`
- 端口 4000 残留 → `start.bat`
- **改后端需重启**；前端 Vite 热更新
- 勿提交 `.env` 中的真实 Cookie

## 后续路线图

- **Phase 6**：可灵式开场动画 + `localStorage` 跳过记忆（`prototypes/opening_sequence.html`）
