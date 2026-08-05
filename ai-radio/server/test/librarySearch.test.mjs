import assert from 'node:assert/strict';
import { scoreTrack, parseSongQuery } from '../librarySearch.mjs';

const luther = {
  id: '1',
  title: 'Luther',
  artist: 'Kendrick Lamar, SZA',
};
const pray = {
  id: '2',
  title: 'Pray For Me (Clean)',
  artist: 'The Weeknd, Kendrick Lamar',
};
const baby = {
  id: '3',
  title: 'Baby',
  artist: 'Justin Bieber',
};

assert.equal(parseSongQuery('luther by kendrick lamar').titlePart, 'luther');
assert.equal(parseSongQuery('luther by kendrick lamar').artistPart, 'kendrick lamar');

assert.ok(scoreTrack(luther, 'luther') >= 50, 'plain title should hit');
assert.ok(scoreTrack(luther, 'play luther') >= 50);
assert.ok(scoreTrack(luther, 'luther by kendrick lamar') >= 50);
assert.ok(scoreTrack(luther, 'luther Kendrick Lamar SZA') >= 50);

assert.equal(scoreTrack(pray, 'luther'), 0, 'artist-only must not match');
assert.equal(scoreTrack(pray, 'luther by kendrick lamar'), 0);
assert.equal(scoreTrack(pray, 'luther Kendrick Lamar SZA'), 0);

assert.ok(scoreTrack(pray, 'pray for me') >= 50);
assert.ok(scoreTrack(baby, 'baby justin bieber') >= 50);
assert.ok(scoreTrack(luther, 'luther by the weeknd') < scoreTrack(luther, 'luther by kendrick lamar'));

console.log('librarySearch.test.mjs OK');
