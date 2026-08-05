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

5. 回复简短，PLAY: 行之外最多一两句。`;

/**
 * Send a message to DeepSeek and get AI DJ response.
 */
export async function chatWithDeepSeek(userMessage, messageHistory, currentTrack) {
  if (!hasDeepseekApiKey()) {
    return {
      type: 'nokey',
      text: '还没有配置 DeepSeek API Key。点左侧「导入 Key」粘贴后即可畅聊；不配 Key 也能点歌，但需先登录，且只会在你的歌单里找。',
    };
  }

  const apiKey = getDeepseekApiKey();
  const nowPlaying = currentTrack
    ? `当前正在播放: "${currentTrack.title}" - ${currentTrack.artist}`
    : '当前没有播放任何歌曲';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: nowPlaying },
    ...messageHistory.slice(-6).map(m => ({
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
