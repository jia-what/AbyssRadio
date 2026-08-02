/**
 * KuGou login_by_token crypto (standard Android app, non-lite).
 */
import crypto from 'crypto';
import forge from 'node-forge';
import { md5 } from './kugouSign.mjs';

const AES_KEY = '90b8382a1bb4ccdcf063102053fd75b8';
const AES_IV = 'f063102053fd75b8';

const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIAG7QOELSYoIJvTFJhMpe1s/g
bjDJX51HBNnEl5HXqTW6lQ7LC8jr9fWZTwusknp+sVGzwd40MwP6U5yDE27M/X1+UR4
tvOGOqp94TJtQ1EPnWGWXngpeIW5GxoQGao1rmYWAu6oi1z9XkChrsUdC6DJE5E221
wf/4WLFxwAtRQIDAQAB
-----END PUBLIC KEY-----`;

function randomString(len = 16) {
  const chars = '1234567890abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function aesEncryptHex(data, keyStr, ivStr) {
  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const key = Buffer.from(keyStr, 'utf8');
  const iv = Buffer.from(ivStr, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('hex');
}

function aesEncryptRandom(data) {
  const tempKey = randomString(16).toLowerCase();
  const derived = md5(tempKey);
  const key = Buffer.from(derived.substring(0, 32), 'utf8');
  const iv = Buffer.from(derived.substring(16, 32), 'utf8');
  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const hex = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('hex');
  return { str: hex, key: tempKey };
}

function aesDecryptWithKey(hex, tempKey) {
  const derived = md5(tempKey);
  const key = Buffer.from(derived.substring(0, 32), 'utf8');
  const iv = Buffer.from(derived.substring(16, 32), 'utf8');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const text = Buffer.concat([
    decipher.update(Buffer.from(hex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Raw RSA encrypt (zero-pad to key size), matching KuGou Android client. */
function rsaEncryptHex(payload) {
  const publicKey = forge.pki.publicKeyFromPem(RSA_PUBLIC_KEY);
  const json = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
  const bytes = Buffer.from(json, 'utf8');
  const keyLen = Math.ceil(publicKey.n.bitLength() / 8);
  const padded = Buffer.alloc(keyLen);
  if (bytes.length > keyLen) throw new Error('RSA payload too large');
  // Left-aligned zero padding (data at offset 0, zeros at tail) — matches upstream
  // KuGouMusicApi rsaRawEncrypt (padded.set(buffer)) and what the server expects.
  bytes.copy(padded, 0);
  const bigInt = new forge.jsbn.BigInteger(padded.toString('hex'), 16);
  const encrypted = bigInt.modPow(publicKey.e, publicKey.n);
  return encrypted.toString(16).padStart(keyLen * 2, '0');
}

export function buildLoginByTokenBody(pool) {
  const dateNow = Date.now();
  const clienttime = Math.floor(dateNow / 1000);
  const p3 = aesEncryptHex({ clienttime, token: pool.token }, AES_KEY, AES_IV);
  const encryptParams = aesEncryptRandom({});
  const pk = rsaEncryptHex({ clienttime_ms: dateNow, key: encryptParams.key });

  return {
    body: {
      dfid: pool.dfid || '-',
      p3,
      plat: 1,
      t1: 0,
      t2: 0,
      t3: 'MCwwLDAsMCwwLDAsMCwwLDA=',
      pk,
      params: encryptParams.str,
      userid: pool.userid,
      clienttime_ms: dateNow,
    },
    encryptKey: encryptParams.key,
  };
}

export function parseLoginByTokenResponse(body, encryptKey) {
  if (!body || body.status !== 1) {
    const msg = body?.error_msg || body?.msg || `error_code=${body?.error_code ?? 'unknown'}`;
    throw new Error(`酷狗 token 刷新失败：${msg}`);
  }
  const data = body.data || {};
  let token = data.token;
  if (data.secu_params) {
    const decrypted = aesDecryptWithKey(data.secu_params, encryptKey);
    if (typeof decrypted === 'object' && decrypted.token) {
      token = decrypted.token;
      Object.assign(data, decrypted);
    } else if (typeof decrypted === 'string') {
      token = decrypted;
    }
  }
  if (!token) throw new Error('酷狗 token 刷新失败：响应中无 token');
  return {
    token,
    userid: String(data.userid || ''),
    vip_type: data.vip_type,
    vip_token: data.vip_token,
    t1: data.t1,
  };
}
