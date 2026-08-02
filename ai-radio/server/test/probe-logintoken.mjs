// Test login_by_token with upstream's exact param shape (mid=undefined, dfid='-')
import { signatureAndroidParams, randomDfid } from '../kugouSign.mjs';
import { buildLoginByTokenBody } from '../kugouCrypto.mjs';
import { md5, calculateMid } from '../kugouSign.mjs';

const userid = '1084302272';
const token = 'a5e121b14c69025acd5675eeaf8fd8e0674c2b62f00d421de06c28a7c10f5564';

// Replicate upstream cookie: only token + userid, NO KUGOU_API_MID
const pool = {
  token,
  userid,
  KugooID: userid,
  t: token,
  dfid: '-',
  KUGOU_API_MID: undefined,
  KUGOU_API_GUID: undefined,
  KUGOU_API_DEV: undefined,
  KUGOU_API_MAC: '02:00:00:00:00:00',
  mid: undefined,
};

const { body, encryptKey } = buildLoginByTokenBody(pool);
const bodyStr = JSON.stringify(body);
const clienttime = Math.floor(Date.now() / 1000);

// Upstream param shape: dfid='-', mid=String(cookie.KUGOU_API_MID)='undefined'
const params = {
  dfid: '-',
  mid: 'undefined',
  uuid: '-',
  appid: 1005,
  clientver: 20489,
  clienttime,
  token,
  userid: String(userid),
};
params.signature = signatureAndroidParams(params, bodyStr);

const qs = new URLSearchParams();
for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
const query = qs.toString();

const cookieStr = `token=${token};userid=${userid}`;
const res = await fetch('http://login.user.kugou.com/v5/login_by_token?' + query, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
    Cookie: cookieStr,
    dfid: '-',
    mid: 'undefined',
    clienttime: String(clienttime),
  },
  body: bodyStr,
});
const j = await res.json();
console.log('TEST mid=undefined dfid=- :', JSON.stringify(j).slice(0, 200));
if (j.status === 1 && j.data) {
  console.log('SUCCESS! vip_type:', j.data.vip_type, 'is_vip:', j.data.is_vip, 'has vip_token:', !!j.data.vip_token);
}
