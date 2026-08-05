/**
 * DeepSeek AI DJ — chat module for Abyss Radio.
 * Uses DeepSeek API to generate conversational responses.
 * When user requests a song, it returns structured data so the frontend can play it.
 */
import { getDeepseekApiKey, hasDeepseekApiKey } from './settings.mjs';

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `你是一个AI电台DJ，名叫Abyss。你的风格是深邃、诗意、带一点赛博朋克的冷淡浪漫。

绝对规则（禁止违反）：
1. 当用户有任何点歌意向时，你的回复**第一行必须是 "PLAY: 具体的搜索词"**。PLAY: 后面的我会原样拿去搜歌。
   - 用户说"放bieber的歌"、听bieber → PLAY: Justin Bieber
   - 用户说"换一首别的"、"换一首"、"下一首" → PLAY:（空，后面不要写词）
   - 用户说"随便放一首"、"来一首" → PLAY:（空）
   - 用户说具体歌名 → PLAY: 歌名（用户提了歌手则 PLAY: 歌名 by 歌手）
   - 例：play luther by kendrick lamar → PLAY: luther by kendrick lamar
   - 例：放一首Scorpion听一下 → PLAY: Scorpion
   - 若用户点的是专辑名（如刚聊到的 Scorpion），仍写 PLAY: 专辑名；可补歌手写成 PLAY: Scorpion Drake，但**禁止**擅自换成该歌手其它单曲名（如 Toosie Slide、God's Plan）

2. 搜索词必须保留用户要的作品名。禁止用「同歌手随便另一首」冒充。搜不到由系统处理，你不要自己改歌名。

3. 纯聊天（喜不喜欢某歌手、代表作介绍、心情）→ 正常回话，**不要**加 PLAY:。只有用户明确要「放/听/播放/play」时才 PLAY。

4. 绝不允许猜测用户没点的歌。聊过 Drake 也不等于可以 PLAY 任意 Drake 歌。

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

    // Check if it's a play request (PLAY: at start of any line)
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

    // If PLAY: has no search term (just "PLAY:"), set a flag for "skip"
    if (playMatch === '') {
      return { type: 'skip', text: textReply.trim() || '切换到下一首...' };
    }

    if (playMatch) {
      textReply = textReply.trim() || `正在搜索 ${playMatch}...`;
      return { type: 'play', text: textReply, songQuery: playMatch };
    }

    return { type: 'chat', text: reply.trim() };
  } catch (e) {
    console.error('DeepSeek fetch error:', e.message);
    return { type: 'chat', text: 'AI DJ 好像沉入深海了... 再叫我一声？' };
  }
}
