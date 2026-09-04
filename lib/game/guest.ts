// A browser keeps its anonymous profile through an opaque, HttpOnly cookie.
// Only a hash of the secret token is used as the database key.
const COOKIE = 'bristol_guest';
export async function guest(request: Request, create = false) {
  let token = request.headers.get('cookie')?.split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const fresh = !token || !/^[a-f0-9]{64}$/.test(token);
  if (fresh && !create) return null;
  if (fresh) token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bristol-guest:' + token));
  const id = 'guest:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {id, cookie: fresh ? `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` : undefined};
}
