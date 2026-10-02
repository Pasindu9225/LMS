const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);

/** The 11-character video id from a normal YouTube link, or null for anything else. */
export function parseYouTubeId(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (HOSTS.has(host)) {
    id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
  }
  return id && ID.test(id) ? id : null;
}
