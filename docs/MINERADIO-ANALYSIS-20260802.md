# Mineradio 完整项目分析 — 迁移评估报告

日期：2026-08-02
对象：`E:\VM\Mineradio-main`（Mineradio v2.1.0）
目标：把其核心能力（酷狗/网易云/汽水/QQ/Spotify 取流+登录）迁移进 AI_audio

---

## 〇、框架校准（重要前提）

你的 8 步法是 **Java/Spring 迁移模板**（@Transactional、ORM 实体、Redis、MQ、全局拦截器）。但 Mineradio 是 **Node.js 项目**，先做映射：

| 你的框架 | Java 假设 | Mineradio 实际 | 映射结论 |
|---|---|---|---|
| DB Schema 增量 | ORM/迁移文件 | **无数据库**——纯文件存储（`.cookie`/`.json`/缓存目录） | 存储是「文件+内存」，无表结构可合并 |
| Service 层隔离 | `@Transactional` 注解 | 函数式模块（`kugou-api.js` 等 5 个 provider 文件） | 拷贝 provider 模块即可，无注解体系 |
| 全局拦截器/鉴权 | Spring Security/Filter | 无框架级鉴权，仅有登录态检查函数 | 不存在干扰问题 |
| Redis/MQ/cron | 中间件配置 | **无 Redis、无 MQ、无 cron**——只有 `setInterval` 缓存清理 | 无中间件可搬 |
| 第三方 SDK 密钥 | 配置中心 | qishui（抖音开放平台 OAuth）、Spotify（client credentials） | 需配置，见第 5 项 |

**结论：Mineradio 是「纯函数式 Node 服务」，迁移难度远低于 Java 项目——核心就是抄 5 个 provider 模块的取流逻辑 + 登录态管理。**

---

## 一、技术栈全景

| 层 | 技术 | 规模 |
|---|---|---|
| 桌面壳 | Electron 42（`desktop/main.js`） | 5693 行 |
| 后端服务 | 纯 Node HTTP（无 Express，手写路由分发 `server.js`） | 6705 行 |
| 平台适配 | `kugou-api.js` / `qishui-api.js` / `qq-vip-api.js` / `spotify-api.js` / `ncm(网易云经 NeteaseCloudMusicApi 库)` | 共 ~8600 行 |
| 登录 | Electron 拉起官网网页扫码（酷狗/QQ/网易云/Spotify）+ 奇水 OAuth | desktop/main.js |
| 存储 | 文件：`.cookie`/`.kugou-cookie`/`.qq-cookie`/`.spotify-token.json` + `data/` JSON | 无数据库 |
| 前端 | 内置 `public/` 静态页（自研视觉） | 忽略（第 6 项） |

**关键结论**：
- **无 Express**——路由是手写的 `if (pn === '/api/xxx')` 分发（可读性差但无框架耦合）
- **5 个 provider 文件是自包含的纯函数模块**（输入 cookie+参数，输出 JSON），这是最值得抄的部分
- 网易云直接依赖 `NeteaseCloudMusicApi` 开源库（我们还没装）

---

## 二、API 路由全景（Mineradio 有、AI_audio 没有的）

### 2.1 平台能力矩阵

| 能力 | 酷狗 | 网易云 | 汽水(奇水) | QQ | Spotify |
|---|---|---|---|---|---|
| 搜索 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 取流 URL | ✅ 4路径 | ✅ song_url_v1 | ✅ 官方 OAuth | ✅ | ✅ |
| 歌单(用户) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 歌词 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 喜欢/收藏 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 登录方式 | 网页扫码+粘贴 | 扫码(库) | OAuth 扫码 | 网页扫码+粘贴 | OAuth |

### 2.2 路由清单（61 个，见勘察）

按功能分组：
- **通用**：`/api/audio`（代理）、`/api/cover`、`/api/lyric`、`/api/weather/*`、`/api/discover/home`
- **网易云**：login qr 三连 + playlist 增删 + album/artist/podcast/comment
- **酷狗**：search/song-url/lyric/user-playlists/playlist-tracks/recommendations/like
- **奇水**：search/feed/song-url/lyric/playlist/collect/comments
- **QQ/Spotify**：完整 CRUD 全家桶
- **更新器**：`/api/update/*`（GitHub release 检查+下载）

---

## 三、第 1 步：抓包定性（已完成的对比结论）

> 之前在酷狗取流链路已做过大量对比，这里汇总。

### 3.1 酷狗取流（kugou-api.js vs 我们 kugou.mjs）

| 维度 | Mineradio | AI_audio（改后） | 差异状态 |
|---|---|---|---|
| 主取流路径 | H5 gateway（appid=1014+浏览器UA+H5签名）→ mobile getSongInfo → web play/getdata → Android gateway | 已移植 H5/mobile/web 三路径 | ✅ 已对齐 |
| 签名 | `signatureH5Params`（盐 `NVPh5oo...`）| 已移植 | ✅ |
| 关键参数 | `clienttime` 毫秒、`uuid=now`、`IsFreePart:0` | 已对齐 | ✅ |
| 登录 cookie | **网页完整 cookie**（`KuGoo=` 复合字段 + `a_id=1014` + kg_mid）| 原扫码是 Android token（appid=1005）| ⚠️ 刚改成 1014 待验证 |
| VIP 判定 | `vip.kugou.com/recharge/roleinfo` 探测 + membership 封装 | 无 | ❌ 缺失（待抄） |
| 音质链 | hashCandidatesFromSong（FileHash/HQ/SQ/Res 四档）| 无（固定 128/320）| ❌ 缺失 |

### 3.2 网易云

| 维度 | Mineradio | AI_audio |
|---|---|---|
| 取流 | `song_url_v1`（level 参数）+ `song_url`（br 回退）| Meting 裸 URL（无登录态）|
| 试听检测 | `freeTrialInfo` 探测 + 多音质回退 | 无 |
| 登录 | NeteaseCloudMusicApi 扫码 | 自研 qr-key/qr/qr-check（链路通但前端状态机有 bug）|

### 3.3 响应格式差异（前端适配要点）

- Mineradio：`{ provider, url, playable, trial, level, quality, br, reason, restriction }` —— 语义化封装
- AI_audio：`{ code, data, msg }` 统一壳（Cursor 已做），data 内字段名不同
- **结论**：需要 BFF 映射层（第 2 步），但我们的 `{code,data,msg}` 壳更规范，保留我们壳、映射内层字段

---

## 四、第 2 步：BFF 适配层方案

**目标**：不改 Mineradio 源码，把它的 provider 函数（kugou-api.js 等）作为「第三方模块」引入我们的后端，外面包一层协议转换。

```
你的前端 ──> AI_audio :4000（现有路由+{code,data,msg}）──> BFF 适配层（新增 module-cloned-core/）
                                                   ├── kugou-provider.js  (import Mineradio kugou-api.js 导出函数)
                                                   ├── netease-provider.js (NeteaseCloudMusicApi 包装)
                                                   ├── mapper.js          (字段映射: song→track, url→playUrl...)
                                                   └── session-bridge.js  (登录态/cookie 中转)
```

**具体做法**：
1. `npm i NeteaseCloudMusicApi`（网易云直接复用库）
2. 把 Mineradio 的 `kugou-api.js`/`qq-vip-api.js`/`spotify-api.js` 拷贝到 `module-cloned-core/`（不改源码，保留其内部函数）
3. 写 `mapper.js`：`mapSong()` / `mapPlaylist()` / `mapPlayUrl()` 三组转换函数
4. 我们的 index.mjs 路由保持不动，handler 内部改为「先调 provider → 再 map → 最后 ok() 包装」

**工作量**：mapper 约 200-300 行，路由接线约 100 行。

---

## 五、第 3 步：DB Schema 增量

**结论：无需迁移。** Mineradio 无数据库，全部文件存储：

| Mineradio 文件 | 内容 | AI_audio 处理 |
|---|---|---|
| `.cookie` / `.kugou-cookie` / `.qq-cookie` | 平台登录 cookie 明文 | 我们已有 session.mjs 内存管理 + .env 持久化，**不需要** |
| `.spotify-token.json` / `.qishui-token` | OAuth token | 如需接平台再建 |
| `data/listen-sync-journal.json` | 听歌上报去重 | 我们有 play_history 表，**功能重叠** |
| beatmap 缓存目录 | 音频分析缓存 | 不需要 |

**唯一值得新增的表**（如果接汽水/QQ）：
- `playlist_subscriptions`（跨平台歌单订阅：platform/playlist_id/user_id）
- 增量 migration：`ALTER TABLE play_history ADD COLUMN platform TEXT DEFAULT 'netease'`（已有 source 字段，等价）

**结论：DB 增量基本为空操作**，保持现有 3 表不动。

---

## 六、第 4 步：Service 层隔离

**结论：天然满足。** Mineradio 没有全局拦截器/过滤器/鉴权注解——它的 provider 文件是纯函数，登录态靠「调用方传 cookie 字符串」。

迁移方式：
```
module-cloned-core/
├── providers/           # 原样拷贝，零改动
│   ├── kugou-api.js     # 87960 B
│   ├── qishui-api.js    # 132366 B (最大，依赖最多)
│   ├── qq-vip-api.js
│   └── spotify-api.js
├── index.js             # 统一导出 + cookie 注入
└── README.md
```

**注意点**：
- `kugou-api.js` 是 CJS（`module.exports`），我们 server 是 ESM——用 `createRequire` 引入即可
- 它们内部有 `console.log` 调试输出，接入时包一层静音
- qishui-api 依赖 qishui-auth-v6（抖音 OAuth，需用户自己申请开放平台应用）——**建议排最后或不做**

---

## 七、第 5 步：Infra 配置

| 项 | Mineradio | AI_audio 迁移 |
|---|---|---|
| Redis | ❌ 无 | 无 |
| MQ | ❌ 无 | 无 |
| cron | ❌ 无（仅 setInterval 缓存清理）| 无 |
| 密钥 | qishui: clientKey/clientSecret（open.douyin.com 开放平台）| `.env` 加 `QISHUI_CLIENT_KEY/SECRET`（如做）|
| 密钥 | Spotify: client_id/secret（`/api/spotify/config` 提供）| `.env` 加 `SPOTIFY_CLIENT_ID/SECRET`（如做）|
| 环境变量 | 23 个 `process.env.*`（COOKIE_FILE/PORT/更新器）| 只取我们需要的：PORT 已有 |

**结论**：无中间件可搬。唯一新增配置是「如果接汽水/Spotify 的平台密钥」。

---

## 八、第 6 步：忽略前端

**结论：已确认忽略。** `public/` 是 Mineradio 自研渲染（粒子视觉/3D 歌单架），与 AI_audio 的 React 前端完全无关。迁移只取 `server.js` 的 handler 逻辑 + provider 文件，`desktop/` 的 Electron 壳只在「以后做桌面 app」时参考登录窗口实现。

---

## 九、第 7 步：试点功能建议

**推荐试点：酷狗取流（song/url）——理由**：
1. 外部依赖最少（只需要 cookie，无 OAuth 配置）
2. 我们已经把 H5/mobile/web 三路径移植成功、网页 cookie 验证可播 VIP——**Mineradio 引擎 + 我们的 session 已经通了**
3. 闭环短：前端点歌 → url-smart → BFF 调 provider → 返回 URL → 前端播放

**试点验收标准**：
- 用 Mineradio 的 `handleKugouSongUrl` 走通 VIP《晴天》→ 浏览器出声
- 复用我们的 `{code,data,msg}` 壳，前端零改动
- 非 VIP 歌回归不破

**备选试点**：网易云取流（装 NeteaseCloudMusicApi 后 song_url_v1 带 cookie）

---

## 十、第 8 步：迭代顺序建议

按耦合度从低到高：

| 阶段 | 模块 | 依赖 | 难度 |
|---|---|---|---|
| P0 | 酷狗取流 provider 接入（已通，转正）| cookie | ★ |
| P1 | 网易云取流（NeteaseCloudMusicApi）| 装库+扫码 | ★★ |
| P2 | 酷狗/网易云歌词+喜欢+歌单增强 | 已有 | ★★ |
| P3 | QQ 音乐（qq-vip-api.js）| cookie | ★★★ |
| P4 | Spotify（OAuth 配置）| 需密钥 | ★★★ |
| P5 | 汽水/奇水（qishui）| 抖音开放平台申请 | ★★★★（可能放弃）|

**建议范围**：P0-P1（酷狗+网易云，正好对上你「只要两个平台」的要求），P2 增强，QQ/Spotify/汽水按需。

---

## 十一、风险与注意

1. **license**：Mineradio 是 GPL-3.0，`kugou-api.js` 若整体拷贝进你的项目，你的项目整体可能受影响（GPL 传染）。**建议：不拷贝文件，而是「参考实现重写」**（我们已这么做了——H5/mobile/web 路径是照着写的）。若坚持拷贝，需接受 GPL 或与作者确认
2. **qishui 复杂度**：132KB 单文件 + 音频解密器 + 抖音 OAuth，性价比最低，默认不做
3. **NeteaseCloudMusicApi**：MIT 协议，可直接用
4. **登录 cookie 有效期**：网页 cookie 会过期，需提供「重新登录」入口（已有）
5. **vip 探测**：Mineradio 的 roleinfo 探测 + membership 封装值得抄（P2 增强项）
