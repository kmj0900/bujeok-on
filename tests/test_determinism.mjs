// M1 결정성 테스트: 같은 맵·시드·입력 기록이면 몇 번을 돌려도 같은 상태가 되는가.
// 온라인 대전(입력만 주고받는 락스텝)이 성립하는지 확인하는 첫 관문이다.
import { MAPS } from '../js/maps.js';
import { loadMap, createRng } from '../js/map.js';
import { createGame, updateGame } from '../js/game.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ' ' + extra)); };

const DIRS = ['up', 'down', 'left', 'right', null];

// 입력 기록 생성: 맵 시드와 별개의 난수로 만든다. 한 번 만들어 두고 그대로 재생한다.
function makeInputs(seed, steps) {
  const rng = createRng(seed * 7919 + 1);
  const log = [[], []];
  const cur = [null, null];
  for (let i = 0; i < steps; i++) {
    for (let p = 0; p < 2; p++) {
      if (rng() < 0.15) cur[p] = DIRS[Math.floor(rng() * DIRS.length)];
      log[p].push({ move: cur[p], placeBomb: rng() < 0.04, struggle: rng() < 0.25 });
    }
  }
  return log;
}

// 상태 해시: 화면 전용(events, popups)과 정적 맵 정의는 제외한다.
function snapshot(g) {
  const { events, popups, map, ...rest } = g;
  return JSON.stringify({ ...rest, grid: map.grid, mapSeed: map.seed });
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

function make(mapId, seed, opts) { return createGame(loadMap(MAPS[mapId], seed), opts); }
function stepGame(g, log, i) { updateGame(g, [log[0][i], log[1][i]]); g.events.length = 0; } // 화면이 하는 것처럼 events는 비운다

function runAll(mapId, seed, steps, opts) {
  const g = make(mapId, seed, opts), log = makeInputs(seed, steps), hashes = [];
  for (let i = 0; i < steps; i++) { stepGame(g, log, i); if (i % 60 === 59) hashes.push(hash(snapshot(g))); }
  return { g, hashes };
}

const STEPS = 6000; // 100초: 카운트다운 3초 + 수리검·낙석·물살 첫 발동을 모두 지난다
const mapIds = Object.keys(MAPS);
const seeds = [1, 2, 3, 42, 777, 20260101];
let interesting = 0;

for (const mapId of mapIds) {
  for (const seed of seeds) {
    const a = runAll(mapId, seed, STEPS), b = runAll(mapId, seed, STEPS);
    const bad = a.hashes.findIndex((h, i) => h !== b.hashes[i]);
    t(`${mapId} seed ${seed}: 두 번 돌려 매초 상태 해시 동일`, bad === -1, `(${bad}초에서 어긋남)`);
    if (a.g.bombs.length + a.g.explosions.length + a.g.items.length > 0 || a.g.players.some((p) => p.hp < 4)) interesting++;
  }
}
t('시험이 실제로 부적·피해를 일으킴(입력이 의미 있음)', interesting > 0);

// 늦은 구간(남은 60초 이후 위협 주기)도 확인
for (const mapId of mapIds) {
  const o = { startTime: 100 };
  const a = runAll(mapId, 5, 3000, o), b = runAll(mapId, 5, 3000, o);
  t(`${mapId}: 후반(startTime 100) 구간 동일`, a.hashes.every((h, i) => h === b.hashes[i]));
}

// 전역 상태 점검: 두 판을 한 스텝씩 번갈아 돌려도 단독으로 돌린 결과와 같아야 한다.
for (const mapId of mapIds) {
  const alone = runAll(mapId, 9, 3000).hashes;
  const g1 = make(mapId, 9), g2 = make(mapId, 9), l1 = makeInputs(9, 3000), l2 = makeInputs(9, 3000);
  const other = make(mapId, 31337), lo = makeInputs(31337, 3000), mixed = [];
  for (let i = 0; i < 3000; i++) {
    stepGame(g1, l1, i); stepGame(other, lo, i); stepGame(g2, l2, i);
    if (i % 60 === 59) { const h1 = hash(snapshot(g1)), h2 = hash(snapshot(g2)); mixed.push(h1 === h2 ? h1 : -1); }
  }
  t(`${mapId}: 다른 판과 번갈아 돌려도 단독 결과와 동일(전역 상태 없음)`, mixed.every((h, i) => h === alone[i]));
}

// 시드가 다르면 실제로 다른 결과가 나와야 한다(해시가 늘 같은 값이 아님을 확인)
{
  const a = runAll('forest', 1, 600).hashes.at(-1), b = runAll('forest', 2, 600).hashes.at(-1);
  t('시드가 다르면 상태도 다름(해시가 의미 있음)', a !== b);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
