// Trace checkKugouQr actual request + response
import { checkKugouQr } from '../kugouQr.mjs';

const origFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0]);
  if (url.includes('get_userinfo_qrcode')) {
    console.log('REQ URL:', url.slice(0, 300));
    const res = await origFetch(...args);
    const text = await res.clone().text();
    console.log('RESP status:', res.status, 'content-type:', res.headers.get('content-type'));
    console.log('RESP body head:', text.slice(0, 200));
    return res;
  }
  return origFetch(...args);
};

const res = await checkKugouQr('c97a79aa62b4da290c767a3d3f5b46e21014');
console.log('CHECK RESULT:', JSON.stringify(res).slice(0, 200));
