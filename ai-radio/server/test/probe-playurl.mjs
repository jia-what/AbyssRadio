// Probe privilege_lite with full response body
import { md5, calculateMid, randomDfid } from '../kugouSign.mjs';
import * as kg from '../kugou.mjs';

const userid = '1084302272';
const token = 'a5e121b14c69025acd5675eeaf8fd8e0674c2b62f00d421de06c28a7c10f5564';
const kgMid = md5('kugou-qr:' + userid + ':' + token);
const guid = md5('kugou-qr-guid:' + userid + ':' + token);
const apiMid = calculateMid(guid);
const dfid = randomDfid();
const cookie = [
  'token=' + token, 'userid=' + userid, 'KugooID=' + userid, 't=' + token,
  'kg_mid=' + kgMid, 'KUGOU_API_MID=' + apiMid, 'KUGOU_API_GUID=' + guid,
  'dfid=' + dfid, 'mid=' + apiMid,
].join('; ');

const songId = '15ab60617d9720066b40d6f73500e57b|1153648';

// show full body of privilege response
const origFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0]);
  if (/get_res_privilege/.test(url)) {
    const res = await origFetch(...args);
    const clone = res.clone();
    const text = await clone.text();
    console.log('PRIVILEGE RESP:', text.slice(0, 1200));
    return res;
  }
  return origFetch(...args);
};

try {
  const url = await kg.getKugouPlayUrl(songId, cookie, null);
  console.log('FINAL URL:', url ? String(url).slice(0, 200) : 'NULL');
} catch (e) {
  console.log('ERR:', e.message.slice(0, 300));
}
