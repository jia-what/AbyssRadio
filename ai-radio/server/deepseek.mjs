/**
 * DeepSeek AI DJ — chat module for Abyss Radio.
 * Uses DeepSeek API to generate conversational responses.
 * When user requests a song, it returns structured data so the frontend can play it.
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `你是一个AI电台DJ，名叫Abyss。你的风格是深邃、诗意、带一点赛博朋克的冷淡浪漫。

绝对规则（禁止违反）：
1. 当用户有任何点歌意向时，你的回复**第一行必须是 "PLAY: 具体的搜索词"**。PLAY: 后面的我会拿去搜歌，所以必须写对用户有用的搜索词。
   - 用户说"放bieber的歌"、听bieber、bieber的 → 你应该回复 PLAY: Justin Bieber
   - 用户说"换一首别的"、"换一首" → PLAY: （空，不要写任何词）
   - 用户说"随便放一首"、"来一首" → PLAY: （空）
   - 用户说具体歌名"Baby"、"Peaches" → PLAY: 歌名 歌手
   - 用户的准确歌词关键词必须保留，不要自己改

2. 绝不允许猜测用户没说出口的歌手。用户说"bieber"就写 Justin Bieber，不要换成别人。

3. 纯聊天（心情、日常、夸你、骂你）才正常回话，不加PLAY:。

4. 回复简短，一两句足够。`;

/**
 * Send a message to DeepSeek and get AI DJ response.
 */
export async function chatWithDeepSeek(userMessage, messageHistory, currentTrack) {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-placeholder-key') {
    return {
      type: 'chat',
      text: 'AI DJ 好像沉入深海了... 再叫我一声？'
    };
  }

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
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 200,
        temperature: 0.8,
        stream: false
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('DeepSeek error:', res.status, err);
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
