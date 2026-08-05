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
