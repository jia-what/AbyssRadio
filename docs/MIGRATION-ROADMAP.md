# Mineradio → AI_audio 迁移落地路线图（GPL 规避版）

日期：2026-08-02（2026-08-02 晚更新：老板定序——先打通基本链路，搜索/歌词问题后续按需借鉴 Mineradio）
目标：把 Mineradio 的核心能力（酷狗/网易云取流+登录+歌单/歌词/喜欢）迁移进 AI_audio，**除前端 UI 外全部后端能力落地**
对象：`E:\VM\Mineradio-main`（v2.1.0，GPL-3.0）→ `E:\VM\AI_audio\ai-radio`（ESM + Express + {code,data,msg} 壳）
优先级：**P0 酷狗基本链路（登录→歌单→播放）优先打通**；搜索/歌词（AI_audio 已有路由但有问题）后续再修，可借鉴 Mineradio 的 search/lyric 实现

---

## 〇、总原则（GPL 传染的解法）

> **不拷贝 Mineradio 任何源码文件，全部「参考行为重写」。**

- 只把 Mineradio 当「黑盒行为说明书」：看它调哪些接口、传什么参数、返回什么，然后自己写实现
- 禁止：`cp`、diff 摘抄、逐行翻译粘贴它的 provider 代码段
- 酷狗 H5/mobile/web 三路径、签名（盐 NVPh5oo...）已经是这么重写过来的 ✅
- 新代码所有权归 AI_audio（我们自己的实现），项目整体保持可自主分发
- 例外：`@neteasecloudmusicapienhanced/api` 是 MIT 协议，可直接依赖使用

---

## 一、现状盘点（2026-08-02 实查，2026-08-02 晚更新）

### ✅ 已有（迁移已完成的）
| 能力 | 位置 | 状态 |
|---|---|---|
| 酷狗三路径取流（H5/mobile/web gateway）| kugou.mjs / kugouSign.mjs（重写版）| ✅ VIP 实测可播（晴天/夜曲/告白气球 完整流）|
| 酷狗扫码登录（已切网页版 appid=1014 参数）| kugouQr.mjs / kugouLogin.mjs | ✅ 二维码流程可出码（飞书扫码验证）；token 换 API token 仍受 20018 限制，非必要 |
| 酷狗歌单/用户信息 | kugou.mjs（verifyKugouCookie / playlists / playlist/tracks）| ✅ **已切 H5 网关链路，15 个歌单全通** |
| 酷狗登录态持久化 | .env KUGOU_COOKIE（Mineradio 网页 cookie 926B）+ dotenv | ✅ **2026-08-02 已补 dotenv 加载，重启自动生效，无需手动导入** |
| 网易云 NEAPI 增强库（MIT）| ncm-neapi.mjs（getVipUrl 雏形）| ⚠️ 待 P1 |
| 响应统一壳 {code,data,msg} | response.mjs | ✅ |
| 登录态管理 | session.mjs | ✅ |
| 前端路由（search/url/url-smart/img/audio/lyric/queue/player/history/likes/login-qr/session/playlists）| index.mjs | ✅ |

### 🔧 本次修复的关键坑（2026-08-02 晚）
1. **歌单接口换 H5 网关链路**：原走 Android API（appid=1005）需 `login_by_token` 换 token，酷狗返回 20018 拒。正解 = H5 网关（appid=1014）网页 cookie 直连，无需刷新（Mineradio 同款路径）
2. **H5 签名 body 必须参与**：`signatureH5Params` 是 `SALT + sorted(params) + JSON.stringify(body) + SALT`，漏 body 会 20006
3. **dotenv 未加载**：package.json 有依赖但代码没 `import 'dotenv/config'`，.env 持久化形同虚设 → 已补
4. 代码：kugouSign.mjs 新增 `signatureH5Params`/`kugouH5Request`；kugou.mjs 歌单/曲目函数切换 H5 链路；index.mjs 补 dotenv

### ❌ 缺失（本次要做的）
| 能力 | Mineradio 行为 | 说明 |
|---|---|---|
| VIP 探测 | `vip.kugou.com/recharge/roleinfo` + membership 封装 | 决定能放几档音质 |
| 四档音质链 | `hashCandidatesFromSong`（FileHash/HQ/SQ/Res）| 我们固定 128/320，需升档 |
| 网易云 song_url_v1 完整封装 | level 参数 + song_url br 回退 | ncm-neapi.mjs 只有雏形 |
| 网易云试听检测 | freeTrialInfo 探测 + 多音质回退 | 未登录 VIP 歌给试听片段 |
| 酷狗歌词 | /api/music/lyric 多源已通，缺酷狗源确认 | 增强项 |
| 酷狗喜欢/收藏 | like API | likes 表已有，接平台同步 |

---

## 二、落地步骤（按阶段，每步可独立验收）

### P0：酷狗引擎转正（当前收尾，★）
**目标**：酷狗全链路（登录→VIP 判定→四档音质）真实出声。

1. **扫码登录终验**：老板用 AI_audio 前端扫码，确认拿到网页 token（带 VIP 权益）；非 VIP 歌回归不破
   - 验收：登录后 `/api/music/url-smart` 返回的 VIP 歌 URL 可直接播放（完整流，非试听）
2. **写 `vipProbe.mjs`**（行为重写）：调 `vip.kugou.com/recharge/roleinfo` 探测会员状态，封装 `getKugouMembership(cookie)` → `{ isVip, level, expire }`
3. **音质链升级**：重写 `hashCandidatesFromSong` 等价逻辑，从歌曲详情取 FileHash/HQ/SQ/Res 四档；`url-smart` 按 membership 选最高可用档；非 VIP 用户自动降级到可用档
   - 验收：VIP 账号能取到 SQ 档 URL；游客账号取 128k 不报错
4. **GPL 纪律检查**：新代码逐段比对，确保无 Mineradio 源码残留

**P0 完成标准**：酷狗 VIP《晴天》完整流出声 + 非 VIP 歌不破 + 四档 URL 可取。

---

### P1：网易云转正（★）
**目标**：网易云走 NEAPI（MIT 库），登录后 VIP 可播完整，未登录给试听。

1. **封装 `neteaseUrlSmart`**：调 NEAPI `song_url_v1`（level=standard/high/lossless）+ 失败回退 `song_url`（br 参数）
2. **freeTrialInfo 探测**：返回 `{ playable, trial: true/false, trialLen }`，未登录 VIP 歌前端展示试听片段 + 引导登录
3. **前端扫码状态机修复**：`/api/login/qr-key → qr → qr-check` 链路后端已通，前端轮询 bug 定位修复（已记录 DEFECTS）
4. **接入 url-smart 路由**：`source=netease` 时走新链路

**P1 完成标准**：网易云 VIP 歌登录后完整播放；未登录给试听并提示登录。

---

### P2：能力增强（★★）
1. **酷狗歌词**：确认 `/api/music/lyric` 酷狗源可用（Mineradio 行为：getLyricByHash）；缺则补
2. **酷狗喜欢同步**：`/api/likes/toggle` 接酷狗 like API（Mineradio 行为：like/dislike by hash）
3. **VIP 状态接口**：`/api/vip/status` 给前端展示会员档位（可做可不做）

---

### P3：可选平台（按需，★★★）
| 平台 | 做法 | 前置条件 | 建议 |
|---|---|---|---|
| QQ 音乐 | 行为重写 qq-vip-api.js（网页 cookie）| 用户提供 QQ cookie | 按需 |
| Spotify | OAuth client credentials | 需申请 client_id/secret | 按需 |
| 汽水/奇水 | 抖音开放平台 + 音频解密器 | 132KB 单文件，复杂度最高 | **放弃** |

---

## 三、风险与纪律（迁移期间持续生效）

1. **GPL 规避纪律**：对照行为写，禁止复制粘贴源码；审查点放在每阶段验收时
2. **cookie 过期**：网页 cookie 会过期，VIP 歌会突然打不开 → 前端要有「重新登录」提示（入口已有）
3. **风控**：主力账号别高频轮询；酷狗 20028 行为验证 → 换网页 cookie 重登（已有解法）
4. **自测纪律**：**Cursor 自测只验格式，不验真功能**——每阶段由贾维斯亲自复测真实链路（酷狗取流曾"冒烟全绿实际无声"，引以为戒）
5. **回归**：每阶段跑一遍非 VIP 歌 + 已有功能（search/lyric/queue/player），不破才收尾

---

## 四、验收总纲

- ✅ 全部真实链路实测出声（不是模拟/格式验证）
- ✅ 前端零改动或最小改动（保留 {code,data,msg} 壳）
- ✅ 非 VIP 歌回归不破
- ✅ GPL 审查通过（无 Mineradio 源码残留）
