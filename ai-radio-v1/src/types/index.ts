export interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
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
