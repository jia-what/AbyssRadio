import assert from 'node:assert/strict';
import {
  parseAlbumQuery,
  pickAlbumTrack,
  trackMatchesAlbum,
  albumClarifySuggestions,
  findAlbumHint,
} from '../albumPlay.mjs';

assert.ok(findAlbumHint('Scorpion'));
assert.equal(parseAlbumQuery('album:Scorpion Drake').album.toLowerCase(), 'scorpion');

const god = {
  id: '1',
  title: "God's Plan",
  artist: 'Drake',
  album: 'Scorpion',
};
const toosie = {
  id: '2',
  title: 'Toosie Slide',
  artist: 'Drake',
  album: 'Dark Lane Demo Tapes',
};
const nonstop = {
  id: '3',
  title: 'Nonstop',
  artist: 'Drake',
  album: '',
};

assert.ok(trackMatchesAlbum(god, 'Scorpion', 'Drake').score >= 80);
assert.ok(trackMatchesAlbum(toosie, 'Scorpion', 'Drake').score < 80);
assert.ok(trackMatchesAlbum(nonstop, 'Scorpion', 'Drake').score >= 80, 'hint track without album field');

const picked = pickAlbumTrack([toosie, god, nonstop], 'Scorpion', 'Drake');
assert.ok(picked);
assert.notEqual(picked.title, 'Toosie Slide');

const tips = albumClarifySuggestions('Scorpion', 'Drake');
assert.ok(tips.includes("God's Plan") || tips.includes('Nonstop'));

console.log('albumPlay.test.mjs OK');
