export interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
  /** 第 4 项：true=歌单里的原曲 id；false/undefined=全网源（试听/音质可能不同） */
  fromLibrary?: boolean;
  /** 第 10 项：AI 插播曲——播完/切走后从队列清除，不留残留 */
  ephemeral?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface RadioState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  chatMessages: ChatMessage[];
  isPortaling: boolean;
}
