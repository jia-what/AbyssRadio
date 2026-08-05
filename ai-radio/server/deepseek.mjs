/**
 * DeepSeek AI DJ — chat module for Abyss Radio.
 * Uses DeepSeek API to generate conversational responses.
 * When user requests a song, it returns structured data so the frontend can play it.
 */
import { getDeepseekApiKey, hasDeepseekApiKey } from './settings.mjs';

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `你是一个AI电台DJ，名叫Abyss。你的风格是深邃、诗意、带一点赛博朋克的冷淡浪漫。

绝对规则（禁止违反）：
1. 当用户有任何点歌意向时，你的回复**第一行必须是 PLAY 指令**（下面四种之一）：
   - 单曲：PLAY: 歌名   或  PLAY: 歌名 by 歌手
   - 专辑：PLAY: album:专辑名 歌手   （用户要听「一张专辑里的歌」时用这个）
   - 歌手：PLAY: artist:歌手名   （用户说「放某某的歌」「听某人的歌」，只想听这个歌手、不指定歌名时用）
   - 切歌：PLAY:（空，后面不要写词）— 「换一首」「下一首」「随便来一首」

   例：
   - play luther by kendrick → PLAY: luther by kendrick lamar
   - 放一首Scorpion听一下（Scorpion 是专辑）→ PLAY: album:Scorpion Drake
   - 放 Drake 的 Scorpion 专辑 → PLAY: album:Scorpion Drake
   - 放 God's Plan → PLAY: God's Plan by Drake
   - 放bieber的歌 → PLAY: artist:Justin Bieber
   - 来点 The Weeknd → PLAY: artist:The Weeknd
   - 换一首 → PLAY:

2. 专辑 vs 单曲 vs 歌手：聊到专辑名、或用户说「这张专辑 / 专辑里的歌 / 放一张 xxx」→ 必须用 album: 前缀。禁止把专辑名擅自换成该专辑外的单曲（如 Scorpion → Toosie Slide）。用户只说歌手不点歌名（「放某某的歌」「听某人的歌」）→ 用 artist: 前缀。

3. 搜索词必须保留用户要的作品名。禁止用「同歌手随便另一首」冒充（歌手级点播由系统处理，你只管给 artist: 指令）。

4. 纯聊天（喜不喜欢、代表作介绍、心情）→ 正常回话，不要加 PLAY:。只有用户明确要「放/听/播放/play」时才 PLAY。

5. **意图边界（重要）**：用户问「XX 有哪些代表作 / 介绍一下 XX / 代表作 / 评价 / 推荐几首 XX 的歌 / 他/她唱过什么」→ 这是**介绍类聊天，不是点歌**，即使提到歌名/歌手也**禁止 PLAY:**，只正常回答。

6. 回复简短，PLAY: 行之外最多一两句。`;

/**
 * 无 Key 时的模板闲聊（第 8 项）：不装 AI，但至少有反应；点歌已由前端本地解析，
 * 这里只接纯聊天。关键词匹配几类常用话术，顺带引导导 Key。
 */
function templateReply(userMessage) {
  const msg = String(userMessage || '').trim().toLowerCase();
  const keyHint = '导入 DeepSeek Key 后，我才能陪你真正聊下去。';

  if (/你好|hi|hello|嗨|哈喽/.test(msg)) {
    return `你好呀。现在还没配 DeepSeek Key，我只能当个点歌台。${keyHint}`;
  }
  if (/好听|喜欢|爱了|上瘾|单曲循环/.test(msg)) {
    return '这首歌确实顶。想换点别的就说「放 歌名」，你的歌单里都能找。';
  }
  if (/不好听|难听|什么鬼|拉黑/.test(msg)) {
    return '哈哈哈哈换一首！说「放 歌名」或「换一首」都行。';
  }
  if (/为什么|怎么|啥|吗|呢|？|\?/.test(msg)) {
    return `这问题我得有脑子才能答。${keyHint} 不配 Key 时，直接说「放 歌名」我照样给你放。`;
  }
  if (/推荐|有什么歌|歌单/.test(msg)) {
    return '想听就说「放 歌名」，或者「放 XX 的歌 / 放 XX 专辑」，我都能从你的歌单里抽。';
  }
  return `信号收到了，但我现在没联网的脑子（没配 Key）。${keyHint} 点歌不受影响：说「放 歌名」就行。`;
}

/**
 * 上下文摘要（第 9 项）：从最近历史里提取「用户聊到的艺人/专辑」，注入 system，
 * 让模型记得用户的偏好，而不是全靠窗口里的原始消息。
 */
function buildContextSummary(messageHistory) {
  const recent = (messageHistory || []).slice(-16);
  const artists = [];
  const albums = [];
  for (const m of recent) {
    if (m?.role !== 'user') continue;
    const text = String(m.text || '');
    // album:X Y / X 的专辑
    let am = text.match(/album:\s*([^,，。]+?)(?:\s+[A-Za-z][\w .'-]*)?$/i);
    if (am) albums.push(am[1].trim());
    // artist:X / X 的歌 / 放 X
    let ar = text.match(/artist:\s*([^,，。]+)/i);
    if (ar) artists.push(ar[1].trim());
    ar = text.match(/(?:放|听|点歌|来点)\s*([\w .'-]{2,30})(?:的(?:歌|专辑))?/i);
    if (ar && !/^(?:什么|哪些|哪个|谁|一首|一下|album|artist)\b/i.test(ar[1].trim())) artists.push(ar[1].trim());
  }
  const parts = [];
  if (artists.length) parts.push(`用户最近聊到的艺人：${[...new Set(artists)].slice(-4).join(' / ')}`);
  if (albums.length) parts.push(`用户最近聊到的专辑：${[...new Set(albums)].slice(-2).join(' / ')}`);
  if (!parts.length) return '';
  return `【会话摘要】${parts.join('；')}。聊到这些艺人/专辑时，如果用户没有明确说「放」，只介绍不播放。`;
}

/**
 * 别名/口语规范化（老板反馈：别名靠手工表永远追不上 AI 的知识）。
 * 本地 miss 时调用：把「火星哥的talking to the moon」→ "Talking to the Moon by Bruno Mars"。
 * 返回规范化 query 或 null（无 Key / 模型没给有效结果）。
 * 注意：结果只是「搜索词」，前端仍走艺人硬过滤打分，不会因规范化而瞎播。
 */
export async function normalizeSongQuery(rawQuery) {
  if (!hasDeepseekApiKey()) return null;
  const q = String(rawQuery || '').trim();
  if (!q) return null;

  const apiKey = getDeepseekApiKey();
  const prompt = `把用户点歌口语转成标准搜索词，只输出一行，不要解释、不要加引号、不要输出其它内容。

规则：
- 中文歌手绰号/译名转英文标准名（公鸭→Drake，火星哥→Bruno Mars，盆栽→The Weeknd，姆爷→Eminem，侃爷→Kanye West，霉霉→Taylor Swift，黄老板→Ed Sheeran，断眉→Charlie Puth）
- 格式：歌名 by 歌手（歌名在前），歌手不确定就只给歌名
- 中文歌名保留中文
- 不要编造歌名：用户给了歌名就用原歌名（纠正拼写/大小写即可）

输入：${q}
输出：`;

  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.1,
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = String(data.choices?.[0]?.message?.content || '').trim();
    if (!out || out.length > 80) return null;
    return out;
  } catch {
    return null;
  }
}

/**
 * Send a message to DeepSeek and get AI DJ response.
 */
export async function chatWithDeepSeek(userMessage, messageHistory, currentTrack, opts = {}) {
  if (!hasDeepseekApiKey()) {
    return {
      type: 'nokey',
      text: templateReply(userMessage),
      template: true,
    };
  }

  const apiKey = getDeepseekApiKey();
  const nowPlaying = currentTrack
    ? `当前正在播放: "${currentTrack.title}" - ${currentTrack.artist}`
    : '当前没有播放任何歌曲';
  const loginState = opts.loggedIn
    ? '用户已登录音乐账号（可从歌单点歌）。'
    : '用户当前未登录音乐账号（无法从歌单点歌）。如果用户问登录状态，如实回答未登录。';

  const summary = buildContextSummary(messageHistory);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: nowPlaying },
    { role: 'system', content: loginState },
    ...(summary ? [{ role: 'system', content: summary }] : []),
    ...messageHistory.slice(-16).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: userMessage }
  ];

  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 200,
        temperature: 0.55,
        stream: false
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('DeepSeek error:', res.status, err);
      if (res.status === 401 || res.status === 403) {
        return { type: 'nokey', text: 'API Key 无效或已失效，请重新导入 DeepSeek Key。' };
      }
      if (res.status === 402) {
        return { type: 'chat', text: 'DeepSeek 余额不足，请先在开平台充值后再试。' };
      }
      return { type: 'chat', text: 'AI DJ 暂时信号不好，等会儿再试试？' };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '...';

    const lines = reply.split('\n');
    let playMatch = null;
    let textReply = '';

    for (const line of lines) {
      const trimmed = line.trim();
      const m = trimmed.match(/^PLAY:\s*(.*)/i);
      if (m) {
        playMatch = m[1].trim();
      } else {
        textReply += line + '\n';
      }
    }

    if (playMatch === '') {
      return { type: 'skip', text: textReply.trim() || '切换到下一首...' };
    }

    // 意图护栏（第 7 项）：用户原话没有点歌动词（放/play/听/点歌/来点/换/下一首），
    // 模型即使输出 PLAY: 也当作闲聊误触发，降级为纯聊天——绝不误播。
    const intentVerbs = /(?:放|播放|play|听|点歌|来点|来一首|换|下一首|切歌|随便)/i;
    if (playMatch && !intentVerbs.test(userMessage)) {
      return {
        type: 'chat',
        text: (textReply.trim() || `关于「${playMatch}」，${userMessage}—— 想听的话跟我说「放 ${playMatch}」。`),
        droppedPlay: playMatch,
      };
    }

    if (playMatch) {
      const album = playMatch.match(/^album:\s*(.+)$/i);
      if (album) {
        const albumQuery = album[1].trim();
        textReply = textReply.trim() || `正在从专辑「${albumQuery}」抽一首...`;
        return { type: 'album', text: textReply, albumQuery, songQuery: albumQuery };
      }
      const artist = playMatch.match(/^artist:\s*(.+)$/i);
      if (artist) {
        const artistQuery = artist[1].trim();
        textReply = textReply.trim() || `正在从 ${artistQuery} 的歌里抽一首...`;
        return { type: 'artist', text: textReply, artistQuery, songQuery: artistQuery };
      }
      textReply = textReply.trim() || `正在搜索 ${playMatch}...`;
      return { type: 'play', text: textReply, songQuery: playMatch };
    }

    return { type: 'chat', text: reply.trim() };
  } catch (e) {
    console.error('DeepSeek fetch error:', e.message);
    return { type: 'chat', text: 'AI DJ 好像沉入深海了... 再叫我一声？' };
  }
}
