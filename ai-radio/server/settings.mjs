/**
 * Runtime settings — DeepSeek API key hot-reload + .env persistence.
 * Packaged Electron writes to ABYSS_DATA_DIR/.env (userData);
 * dev falls back to the server directory.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ABYSS_DATA_DIR || __dirname;
const ENV_FILE = path.join(DATA_DIR, '.env');

let runtimeDeepseekKey = String(process.env.DEEPSEEK_API_KEY || '').trim();

export function getDeepseekApiKey() {
  return runtimeDeepseekKey;
}

export function hasDeepseekApiKey() {
  const k = runtimeDeepseekKey;
  return !!(k && k !== 'sk-placeholder-key');
}

/** Mask for UI: sk-....xxxx */
export function deepseekKeyHint() {
  const k = runtimeDeepseekKey;
  if (!hasDeepseekApiKey()) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function upsertEnvLine(envText, key, value) {
  const escaped = String(value).replace(/\r|\n/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const line = `${key}="${escaped}"`;
  if (new RegExp(`^${key}=.*$`, 'm').test(envText)) {
    return envText.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  }
  return (envText ? envText.replace(/\s*$/, '\n') : '') + line + '\n';
}

function persistDeepseekKey(key) {
  try {
    fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
    let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    if (key) {
      env = upsertEnvLine(env, 'DEEPSEEK_API_KEY', key);
    } else if (/^DEEPSEEK_API_KEY=.*$/m.test(env)) {
      env = env.replace(/^DEEPSEEK_API_KEY=.*$/m, '');
    }
    fs.writeFileSync(ENV_FILE, env, 'utf8');
    return true;
  } catch (e) {
    console.warn('[abyss] persist DEEPSEEK_API_KEY failed:', e.message);
    return false;
  }
}

/** Hot-set key in memory + process.env + .env. Empty string clears. */
export function setDeepseekApiKey(raw) {
  const key = String(raw || '').trim();
  runtimeDeepseekKey = key;
  if (key) process.env.DEEPSEEK_API_KEY = key;
  else delete process.env.DEEPSEEK_API_KEY;
  const saved = persistDeepseekKey(key);
  return { ok: true, configured: hasDeepseekApiKey(), hint: deepseekKeyHint(), saved };
}

export function getDeepseekStatus() {
  return {
    configured: hasDeepseekApiKey(),
    hint: deepseekKeyHint(),
    platformUrl: 'https://platform.deepseek.com',
    apiKeysUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com',
  };
}

/**
 * 第 14 项：保存前 ping 一次 DeepSeek API 验证 Key 有效。
 * 用极小的 max_tokens 请求探测 401/403；返回 { valid, status }。
 */
export async function pingDeepseekKey(key) {
  const apiKey = String(key || '').trim();
  if (!apiKey) return { valid: false, status: 'empty' };
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (res.ok) return { valid: true, status: res.status };
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: res.status, reason: 'Key 无效或已失效' };
    }
    // 402 余额不足等：Key 本身有效，但被限额
    if (res.status === 402) {
      return { valid: true, status: res.status, reason: 'Key 有效但余额不足' };
    }
    return { valid: false, status: res.status, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { valid: false, status: 'error', reason: e.message };
  }
}
