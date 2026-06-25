const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const BASE_URL = 'http://localhost:4000';

describe('Abyss Radio API', () => {
  test('GET /api/health returns status ok', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  test('GET /api/health has correct name', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    assert.match(data.name, /abyss/i);
  });

  test('CORS headers are set', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.ok(res.headers.get('access-control-allow-origin'));
  });

  test('unknown route returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/nonexistent`);
    assert.strictEqual(res.status, 404);
  });

  test('search returns results', async () => {
    const res = await fetch(`${BASE_URL}/api/music/search?q=周杰伦`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.songs));
    assert.ok(data.songs.length > 0);
    assert.ok(data.songs[0].title);
    assert.ok(data.songs[0].source);
  });

  test('search requires query param', async () => {
    const res = await fetch(`${BASE_URL}/api/music/search`);
    assert.strictEqual(res.status, 400);
  });

  test('kugou search returns results', async () => {
    const res = await fetch(`${BASE_URL}/api/music/search?q=周杰伦&source=kugou`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    if (data.songs.length > 0) {
      assert.strictEqual(data.songs[0].source, 'kugou');
    }
  });

  test('url needs id param', async () => {
    const res = await fetch(`${BASE_URL}/api/music/url`);
    assert.strictEqual(res.status, 400);
  });

  test('lyric needs id param', async () => {
    const res = await fetch(`${BASE_URL}/api/music/lyric`);
    assert.strictEqual(res.status, 400);
  });
});
