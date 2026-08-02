/**
 * Lightweight in-process counters for playback / URL resolution observability.
 */

const counters = {
  urlOk: 0,
  urlFail: 0,
  playOk: 0,
  playFail: 0,
  startedAt: Date.now(),
};

export function recordUrlResult(ok) {
  if (ok) counters.urlOk += 1;
  else counters.urlFail += 1;
}

export function recordPlayResult(ok) {
  if (ok) counters.playOk += 1;
  else counters.playFail += 1;
}

export function getMetrics() {
  const urlTotal = counters.urlOk + counters.urlFail;
  const playTotal = counters.playOk + counters.playFail;
  return {
    ...counters,
    urlSuccessRate: urlTotal ? counters.urlOk / urlTotal : null,
    playSuccessRate: playTotal ? counters.playOk / playTotal : null,
    uptimeMs: Date.now() - counters.startedAt,
  };
}
