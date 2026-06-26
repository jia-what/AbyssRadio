/**
 * Wrap a remote cover URL through the backend image proxy so platform
 * hotlink protection / mixed-content does not break the image.
 * Handles full http(s) URLs and protocol-relative URLs ("//host/path").
 * Non-url values (e.g. local gradient specs like "#1a0a2e-#16213e") pass through.
 */
function normalize(raw?: string | null): string {
  if (!raw) return '';
  let u = raw.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  return u;
}

export function coverUrl(raw?: string | null): string {
  const u = normalize(raw);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return `/api/img?url=${encodeURIComponent(u)}`;
  return u;
}

/** True when the value resolves to a usable remote image source. */
export function isImageUrl(raw?: string | null): boolean {
  const u = normalize(raw);
  return /^https?:\/\//i.test(u);
}
