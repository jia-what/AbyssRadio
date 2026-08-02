/**
 * Server-side queue / player control plane for external callers (Jarvis etc.).
 * Actual audio still plays in the browser; this is the authoritative intent state.
 */

const state = {
  queue: [],
  index: -1,
  playing: false,
  sessionKey: null,
  updatedAt: Date.now(),
};

function touch() {
  state.updatedAt = Date.now();
}

export function getPlayerStatus() {
  const current = state.index >= 0 ? state.queue[state.index] || null : null;
  return {
    playing: state.playing,
    index: state.index,
    current,
    queue: state.queue.slice(),
    sessionKey: state.sessionKey,
    updatedAt: state.updatedAt,
  };
}

/**
 * Add a track (or list) to the queue.
 * @param {object|object[]} item
 * @param {{ sessionKey?: string }} [opts]
 */
export function queueAdd(item, opts = {}) {
  const items = Array.isArray(item) ? item : [item];
  for (const t of items) {
    if (!t || !t.id) throw new Error('missing track id');
    state.queue.push({
      id: String(t.id),
      source: t.source || 'netease',
      title: t.title || '',
      artist: t.artist || '',
      cover: t.cover || '',
      duration: t.duration || 0,
    });
  }
  if (opts.sessionKey) state.sessionKey = opts.sessionKey;
  if (state.index < 0 && state.queue.length) state.index = 0;
  touch();
  return getPlayerStatus();
}

/**
 * Play by queue index or by id (+ optional source).
 * @param {{ index?: number, id?: string, source?: string, sessionKey?: string }} cmd
 */
export function playerPlay(cmd = {}) {
  if (cmd.sessionKey) state.sessionKey = cmd.sessionKey;

  if (typeof cmd.index === 'number') {
    if (cmd.index < 0 || cmd.index >= state.queue.length) {
      throw new Error('index out of range');
    }
    state.index = cmd.index;
  } else if (cmd.id) {
    const src = cmd.source || null;
    let idx = state.queue.findIndex(
      (t) => t.id === String(cmd.id) && (!src || t.source === src),
    );
    if (idx < 0) {
      // Not in queue — append then play
      queueAdd({
        id: cmd.id,
        source: cmd.source || 'netease',
        title: cmd.title || '',
        artist: cmd.artist || '',
        cover: cmd.cover || '',
        duration: cmd.duration || 0,
      });
      idx = state.queue.length - 1;
    }
    state.index = idx;
  } else if (state.index < 0 && state.queue.length) {
    state.index = 0;
  }

  if (state.index < 0 || !state.queue[state.index]) {
    throw new Error('queue empty');
  }
  state.playing = true;
  touch();
  return getPlayerStatus();
}

export function playerPause() {
  state.playing = false;
  touch();
  return getPlayerStatus();
}

export function clearQueue() {
  state.queue = [];
  state.index = -1;
  state.playing = false;
  touch();
  return getPlayerStatus();
}
