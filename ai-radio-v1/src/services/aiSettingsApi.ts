export interface DeepseekStatus {
  configured: boolean;
  hint: string;
  platformUrl?: string;
  apiKeysUrl?: string;
  docsUrl?: string;
}

export async function fetchDeepseekStatus(): Promise<DeepseekStatus> {
  const res = await fetch('/api/settings/deepseek');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '无法读取 Key 状态');
  return data as DeepseekStatus;
}

export async function saveDeepseekKey(key: string): Promise<{
  ok: boolean;
  configured: boolean;
  hint: string;
  saved: boolean;
}> {
  const res = await fetch('/api/settings/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '保存失败');
  return data;
}

export interface LibrarySearchResult {
  track: {
    id: string;
    title: string;
    artist: string;
    cover: string;
    duration: number;
    source: string;
    album?: string;
  } | null;
  matches: Array<{
    id: string;
    title: string;
    artist: string;
    cover: string;
    duration: number;
    source: string;
    album?: string;
  }>;
  message: string;
  suggestions?: string[];
  clarify?: boolean;
  error?: string;
}

export async function searchLibrary(
  sessionKey: string,
  query: string,
  mode: 'song' | 'album' = 'song',
): Promise<LibrarySearchResult> {
  const res = await fetch('/api/library/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: sessionKey, q: query, mode }),
  });
  const data = await res.json();
  if (!res.ok && !data.message) throw new Error(data.error || '歌单搜索失败');
  return data as LibrarySearchResult;
}
