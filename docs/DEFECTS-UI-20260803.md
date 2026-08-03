# UI 缺陷单 · 2026-08-03

> 仅问题描述，供 Hermes 修复。项目根：`E:\VM\AI_audio`  
> 最新调查：**「暂无翻译」= 接口 tlyric 整段为空**（非 UI 对齐问题）；见缺陷 8

---

## 缺陷 1（历史）：点开音质菜单撑破底栏高度

此前：菜单参与底栏布局导致胶囊被撑高、控件贴底。若 Hermes 已改为 `fixed` 浮层，本条可视为部分修复；**仍须对照缺陷 3**（超出屏幕）。

---

## 缺陷 2（历史）：左右「AI」「歌单」文字按钮

要求贴边悬停展开并删除文字按钮。若已改，可勾验收；以当前产品行为为准。

---

## 缺陷 3：音质菜单横向超出屏幕（本轮）

### 现象
- 点击底栏音质后，弹出层（标准 / 极高 / 无损 FLAC / Hi-Res）**横向拉得很宽**，右缘直接超出视口
- 菜单看起来「飞出屏幕」，与触发按钮不对齐，UI 乱、显示不全

### 期望
- 菜单宽度贴合文案（窄浮层，约百余 px），**不得**横向拉满或超出屏幕
- `fixed` 定位须相对按钮锚点，并用视口钳制（例如 `left` 保证 `left + width ≤ window.innerWidth - 8`；必要时改 `right` 对齐）
- 开/关菜单仍不得改变底栏高度

### 可疑位置
| 文件 | 说明 |
|------|------|
| `ai-radio-v1/src/components/bottom/BottomBar.tsx` | `openQualityMenu`：`left: r.right - 128`，`top` 按 4 行估算；菜单 `min-w-[128px]` 但**无 max-width、无视口 clamp** |
| 同文件菜单节点 | `fixed z-[60] ... min-w-[128px]`；检查 `liquid-glass` 是否导致异常变宽 |
| 定位策略 | 应用 `getBoundingClientRect` 后按菜单实测宽度反算，或 `right: window.innerWidth - r.right` 右对齐按钮 |

### 验收
- [ ] 任意窗口宽度下打开音质菜单，整框落在屏幕内
- [ ] 宽度紧凑，不横向拉长；底栏高度不变

---

## 缺陷 4：右侧栏（歌单/扫码登录）展开后不会自动收回（本轮）

### 现象
- 鼠标移到右侧展开歌单/扫码登录面板后，**移开鼠标面板仍常驻**，不会自动收起
- 扫码登录页（网易云/酷狗二维码）展开后尤其明显，一直挡在右侧

### 期望
- 鼠标离开右侧面板（及右缘热区）后，延迟约 1s **自动收起**（与左侧 AI 一致）
- 扫码登录（`view === 'bind'`）期间：允许短暂 pin 防抖，但离开面板后仍应能收回；或提供明确关闭，且离开热区不永久钉死
- 登录成功进入歌单列表后，离开同样自动收起

### 可疑位置（根因已较明确）
| 文件 | 说明 |
|------|------|
| `PlaylistColumn.tsx` | `onMouseLeave={() => { if (view !== 'bind') onBlur(); }}` —— **bind/扫码页故意不调 onBlur**，离开也不 unpin |
| 同文件 `startQrLogin` | 开头 `onFocus()` → `pin('right')`，钉死后 `useEdgePanels` 右缘 hover 不再 `scheduleHide` |
| `useEdgePanels.ts` | `pinned.right === true` 时跳过收起；需与 unpin 策略一致 |
| `SpatialLayout.tsx` | `handleRightFocus` = pin；`handleRightBlur` = unpin；bind 路径从不走到 blur |

### 验收
- [ ] 右侧展开后，鼠标移到屏幕中间/左侧，约 1s 内面板收回
- [ ] 扫码页同样会收回（或离开后收回，不会永久钉死）
- [ ] 鼠标回到右缘仍可再次展开

---

## 缺陷 5：音质按钮点不开 / 菜单与底栏不同步 / 切不了音质（加重）

### 现象（最新实测）
1. **点击底栏「标准」音质按钮完全没反应**——菜单打不开（比「能开不能选」更严重）
2. 历史：即便菜单曾打开，底栏收回后菜单仍悬浮；点选项也切不了音质；菜单曾横向超屏

### 期望
- 点击音质按钮 → 稳定弹出菜单（标准 / 极高 / 无损 / Hi-Res）
- 点选项 → `onQualityChange` 生效，标签更新
- 底栏 `visible === false` 时菜单同步关闭；宽度紧凑且落在视口内

### 可疑位置
| 文件 | 说明 |
|------|------|
| `BottomBar.tsx` | `openQualityMenu` / portal 菜单；查点击是否被挡住、`onMouseLeave={onUnpin}` 是否导致底栏在点击瞬间收回从而 `useEffect(!visible) closeQualityMenu` 立刻关掉 |
| 同文件 | 全局 `mousedown` 关菜单是否与按钮 click 竞态（按下就关、click 打不开） |
| `SpatialLayout` | 父级 `pointer-events-none`，确认底栏区域 `pointer-events-auto` 覆盖音质按钮 |
| portal / z-index | 菜单若挂 body，确认可点且不被其它层拦截 |

### 验收
- [ ] 点击「标准」必能打开菜单
- [ ] 点选各档可切换并关闭菜单
- [ ] 底栏收回 → 菜单消失；菜单不超屏、不过宽

---

## 缺陷 6：底栏上方音频波浪改为「正态包络」流动（中间高、两边低）

### 现象
- 播放条上方的音频波浪（黄绿发光波形）当前大致**整条高低起伏较均匀/偏平**，没有明显的中央鼓起
- 产品要求：视觉上像**正态分布**——**中间振幅高、向两侧逐渐变低**，并随音乐频谱/能量流动响应

### 期望
- 在现有随音乐跳动的前提下，对横向 bins 乘以（或叠加）高斯/正态窗：  
  `envelope(i) = exp(-0.5 * ((i - mid) / (sigma * N))^2)`，sigma 可调（约 0.22–0.35）
- 中间最高、左右贴近基线；仍跟 analyser / demo 频谱动，不要静态死曲线
- 不挡歌词/封面；颜色与现网 cover 取色逻辑可保留

### 可疑位置
| 文件 | 说明 |
|------|------|
| `ai-radio-v1/src/components/background/CoverPulseWave.tsx` | `drawWave` / `simulatedSpectrum` / `resampleFreq`：在算 `h` 前对 `bins[i]` 乘正态窗 |
| 挂载处 | App / 背景层里引用 `CoverPulseWave` 的位置（改绘制即可，未必动挂载） |

### 验收
- [ ] 播放时波形中间明显高于两侧，两侧自然衰减
- [ ] 鼓点/能量变化时包络内仍有流动，不是一条死的钟形线
- [ ] 暂停时行为合理（衰减/静止），不闪烁炸屏

---

## 缺陷 7：歌词糊成一坨；模式按钮悬空；仅「关歌词」有效（✅ 已解决 2026-08-03）

### 修复记录
1. **糊成一坨** → `parseLRC.ts` parseKRC：KRC 空格词条不再被 `trim()` 丢弃（`replace(/\s+/g,' ') === ' ' ? ' ' : wm[3]`），英文正常分词
2. **按钮悬空** → 删除 LyricLight 悬浮按钮，三态切换移入 `BottomBar.tsx`（时间/音量同级）
3. **三态不可辨** → 翻译行改**按时间匹配**（±1.5s 内最近 tlyric，非下标对齐）；`dual` 无翻译数据时灰态提示「暂无翻译」

---

## 缺陷 8：「暂无翻译」——调查结论（✅ 已解决 2026-08-03）

### 修复记录（5 个坏点全修）
1. **keyword 语序** → 前端统一传 `artist\t title`（tab 分隔，6 处调用全改）；后端按 tab 拆分 artist/title
2. **匹配过松 + 一击即停** → 标题全词匹配（≥4 字符包含/相等，禁 2 字符 includes）；无译**试完所有候选**才 miss 缓存（10 分钟）
3. **网易云源无二次借译** → `getLyric` 对 netease 源 tlyric 空时也走 fallback（第 4 参 searchKeyword）
4. **漏传 keyword** → 歌单播放路径补传 `${artist}\t${title}`
5. **搜索脏结果** → 搜索词改为 `title artist` 顺序 + 全词匹配过滤二创
- 验收：Freedom（Anthony Hamilton）网易云源 tlyric = 796 字真实译 ✅；无译曲保持空不误伤 ✅
- 探针：`ai-radio/server/test/tlyric-probe.mjs`（保留可复跑）

---

## Hermes 本轮优先

1. **缺陷 8** — 修好 tlyric 获取/借译（「暂无翻译」）  
2. **缺陷 7** — 歌词可读 + 模式控件进底栏 + 三态生效  
3. **缺陷 5** — 音质按钮要点得开、选得上  
4. **缺陷 6** — 波浪正态包络  
5. **缺陷 3 / 4** — 若尚未合入
