import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { signatureAndroidParams, md5, kugouIdentity, calculateMid, safeDecodeURIComponent } from '../kugouSign.mjs';
import { normalizeKugouFilename } from '../kugou.mjs';

describe('kugouSign', () => {
  test('md5 produces 32-char hex', () => {
    const h = md5('hello');
    assert.match(h, /^[a-f0-9]{32}$/);
    assert.equal(h, '5d41402abc4b2a76b9719d911017c592');
  });

  test('signatureAndroidParams is deterministic', () => {
    const params = {
      appid: 1005,
      clienttime: 1643368936,
      clientver: 10889,
      dfid: '1bHOPF2BFRqk3UpxUx1hzf53',
      mid: '232539908206342312896345662088253784255',
      uuid: 'ed42ee74c48dd921427f2729a68787a7',
    };
    const body = '{"plat":0}';
    const a = signatureAndroidParams(params, body);
    const b = signatureAndroidParams(params, body);
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{32}$/);
  });

  test('kugouIdentity parses browser cookie fields', () => {
    const cookie = 'KugooID=12345; t=abc123token; kg_mid=deadbeef0123456789abcdef01234567';
    const id = kugouIdentity(cookie);
    assert.equal(id.userid, '12345');
    assert.equal(id.token, 'abc123token');
    assert.match(id.mid, /^\d{15,}$/);
  });

  test('calculateMid returns decimal string from seed', () => {
    const mid = calculateMid('test-guid');
    assert.match(mid, /^\d+$/);
    assert.equal(mid, calculateMid('test-guid'));
  });

  test('kugouIdentity rejects missing token', () => {
    assert.throws(() => kugouIdentity('KugooID=1'), /无效/);
  });

  test('safeDecodeURIComponent handles malformed percent sequences', () => {
    const bad = 'NickName=%u4F60%u597D%ZZ';
    assert.doesNotThrow(() => safeDecodeURIComponent(bad));
  });

  test('buildKugouCookiePool accepts KuGoo with %u nickname without throwing', () => {
    const cookie = 'KugooID=99; t=abc; kg_mid=deadbeef0123456789abcdef01234567; KuGoo=NickName=%u4F60%u597D%ZZ&t=abc';
    const id = kugouIdentity(cookie);
    assert.equal(id.userid, '99');
    assert.equal(id.token, 'abc');
  });

  test('normalizeKugouFilename strips extension and splits artist', () => {
    const r = normalizeKugouFilename('AWOLNATION - Jailbreak.mp3');
    assert.equal(r.artist, 'AWOLNATION');
    assert.equal(r.title, 'Jailbreak');
  });
});
