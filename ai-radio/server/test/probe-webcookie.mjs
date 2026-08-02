// Test VIP song with Mineradio's REAL web cookie through our engine
import { readFileSync } from 'fs';
import * as kg from '../kugou.mjs';
import { kugouIdentity } from '../kugouSign.mjs';

const cookie = readFileSync('C:/Users/Lenovo/AppData/Roaming/Mineradio/.kugou-cookie', 'utf8').trim();

console.log('identity:', JSON.stringify(kugouIdentity(cookie)));

// VIP song: 晴天
const sid = 'b3a52a7a958bf0aed0ebfba2e9a818b7';
try {
  const url = await kg.getKugouPlayUrl(sid, cookie, null);
  console.log('晴天 (VIP) play URL:', url ? String(url).slice(0, 160) : 'NULL');
  if (url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Range: 'bytes=0-199999' } });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('DL:', buf.length, 'bytes, status', res.status, 'CR:', res.headers.get('content-range'));
    console.log('MAGIC:', buf.slice(0, 4).toString('ascii'));
  }
} catch (e) {
  console.log('ERR:', e.message.slice(0, 200));
}
