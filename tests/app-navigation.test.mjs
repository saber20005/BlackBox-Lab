import test from 'node:test';
import assert from 'node:assert/strict';
import {tracks} from '../data.js';
import {publicSearchItems} from '../assets/modules/navigation/app-navigation.js';

test('global discovery searches public track and stage metadata without private fields', () => {
  const injected = tracks.map(track => ({...track, notes:'PRIVATE_UNSEARCHABLE_MARKER', stages:track.stages.map(stage => ({...stage, result:'PRIVATE_UNSEARCHABLE_MARKER'}))}));
  assert.deepEqual(publicSearchItems(injected, 'PRIVATE_UNSEARCHABLE_MARKER'), []);
  const found = publicSearchItems(tracks, 'Nmap');
  assert(found.some(item => item.kind === 'track' && item.trackId === 'nmap'));
  assert(found.some(item => item.kind === 'stage' && item.trackId === 'nmap'));
  assert(found.every(item => !Object.hasOwn(item, 'notes') && !Object.hasOwn(item, 'result')));
});
test('category filters retain real routes and arbitrary query text is treated literally', () => {
  const found = publicSearchItems(tracks, '', 'stage');
  assert.equal(found.length, tracks.reduce((sum, track) => sum + track.stages.length, 0));
  assert(found.every(item => Number.isInteger(item.stageIndex) && tracks.find(track => track.id === item.trackId)?.stages[item.stageIndex]));
  assert(publicSearchItems(tracks, '', 'track').every(item => item.kind === 'track'));
  assert.deepEqual(publicSearchItems(tracks, '<img src=x onerror=alert(1)>'), []);
});
