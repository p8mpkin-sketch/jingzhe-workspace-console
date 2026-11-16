// Shared helpers for the real-backend audits (real-read-audit.mjs, real-write-audit.mjs).
// The token is read from the environment or from a file that only its owner can read. It is never
// printed, never written to a result file, and is replaced by <redacted> wherever a URL carries it.
import fs from 'node:fs';

export function readToken() {
  if (process.env.JZ_TOKEN) return process.env.JZ_TOKEN.trim();
  const file = process.env.JZ_TOKEN_FILE;
  if (!file) fail('Set JZ_TOKEN, or JZ_TOKEN_FILE pointing at a file with mode 600 that holds the token.');
  const st = fs.statSync(file);
  if (st.mode & 0o077) fail(`${file} is readable by group or others. Run: chmod 600 ${file}`);
  return fs.readFileSync(file, 'utf8').trim();
}

export function fail(msg) { console.error(msg); process.exit(2); }

/** Remove the token from anything that is about to be logged or saved. */
export const redactor = (token) => (s) => String(s)
  .split(token).join('<redacted>')
  .replace(/([?&](?:token|access_token|key|password)=)[^&\s"]+/gi, '$1<redacted>')
  .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, '$1<redacted>');

/** Ids replaced by {id}, so a real log can be compared with the fixture baseline. */
export const normalise = (key) => key
  .replace(/([?&]token=)[^&]+/, '$1{token}')
  .replace(/\/\d+(?=\/|\?|$)/g, '/{id}')
  .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|\?|$)/gi, '/{id}')
  .replace(/\/a\d+(?=\/|\?|$)/g, '/{id}');

export const origin = () => new URL(process.env.BASE || 'http://localhost:4173/v2/').origin;

/** Plain API call with the bearer token. Returns { status, json } and never throws on HTTP errors. */
export async function call(token, method, path, body) {
  const res = await fetch(origin() + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text: json === null ? text.slice(0, 200) : undefined };
}

export const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };
