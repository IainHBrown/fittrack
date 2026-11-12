// Web Push for Cloudflare Workers, using only WebCrypto.
//   - message encryption: RFC 8291 (aes128gcm content coding, RFC 8188)
//   - sender identification: VAPID, RFC 8292 (an ES256 JWT)
// iOS 16.4+ delivers these to a web app that is installed on the Home Screen.

const enc = new TextEncoder();

export const b64u = {
  encode(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

/**
 * Encrypt a message for one push subscription.
 * @param {Uint8Array} plaintext
 * @param {{p256dh:string, auth:string}} keys   from the browser's subscription
 * @param {object} [fixed]  { salt, serverKeys } only for tests with known answers
 * @returns {Promise<Uint8Array>} the request body
 */
export async function encryptPayload(plaintext, keys, fixed = {}) {
  const uaPublic = b64u.decode(keys.p256dh);   // the phone's public key, 65 bytes
  const authSecret = b64u.decode(keys.auth);   // 16 bytes
  const salt = fixed.salt || crypto.getRandomValues(new Uint8Array(16));
  const server = fixed.serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));

  // RFC 8291 section 3.4: combine the shared secret with the auth secret
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, serverPublic, new Uint8Array([1])));
  // RFC 8188: derive the content key and nonce from the salt
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the end of the last (only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  // header: salt (16) | record size (4, big-endian) | key id length (1) | key id (the server public key)
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([serverPublic.length]), serverPublic);
  return concat(header, cipher);
}

/** "vapid t=<jwt>, k=<public key>" for the Authorization header. */
export async function vapidAuthorization(endpoint, { publicKey, privateJwk, subject }, now = Date.now()) {
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${publicKey}`;
}

/**
 * Send one notification.
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} subscription
 * @param {object} message   e.g. { title, body, tag }
 * @param {object} vapid     { publicKey, privateJwk, subject }
 * @returns {Promise<{ok:boolean, status:number, gone:boolean}>} gone = the subscription no longer exists
 */
export async function sendPush(subscription, message, vapid, fetcher = fetch) {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), subscription.keys);
  const res = await fetcher(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '43200',
      Urgency: 'normal',
    },
    body,
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}
