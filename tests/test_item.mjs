// 능력 두루마리(아이템) 테스트: node tests/test_item.mjs
import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { createGame, updateGame } from '../js/game.js';
import { PlayerState, MOVE_COOLDOWN } from '../js/player.js';
import { placeBomb, FUSE_TIME, EXPLOSION_TIME } from '../js/bomb.js';
import { ItemType, canUpgrade, applyItem, maybeDrop, pickupItems, SPEED_INTERVALS, MAX_RANGE, MAX_BOMBS, MAX_SPEED_LEVEL } from '../js/item.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const none = { move: null, placeBomb: false };
const idle = [none, none];
const run = (g, n, acts = idle) => { for (let i = 0; i < n; i++) updateGame(g, acts); };
const seconds = (s) => Math.round(s * 60);

function blank(chance = 0, extra = []) {
  const map = loadMap(MAPS.forest, 1);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
    map.grid[y][x] = (x === 0 || y === 0 || x === 14 || y === 12) ? Tile.SOLID : Tile.FLOOR;
  }
  for (const e of extra) map.grid[e.y][e.x] = e.t;
  const g = createGame(map, { countdown: 0, itemDropChance: chance, hazards: false });
  g.players[0].x = 2; g.players[0].y = 2; g.players[0].fromX = 2; g.players[0].fromY = 2;
  g.players[1].x = 12; g.players[1].y = 10; g.players[1].fromX = 12; g.players[1].fromY = 10;
  return g;
}
const crateGame = (chance) => blank(chance, [{ x: 5, y: 5, t: Tile.BREAKABLE }]);
// (4,5)에서 부적을 터뜨려 (5,5) 상자를 부순다. 플레이어는 멀리 둔다.
function blowCrate(g) {
  g.players[0].x = 4; g.players[0].y = 5;
  placeBomb(g, g.players[0]);
  g.players[0].x = 2; g.players[0].y = 2;
  run(g, seconds(FUSE_TIME) + 2);
}

// ---------- 능력치·최대치
{
  const p = blank().players[0];
  t('시작 능력치: 속도 0단계 0.16초, 범위 2, 부적 1', p.speedLevel === 0 && p.moveInterval === MOVE_COOLDOWN && p.range === 2 && p.maxBombs === 1);
  for (let i = 1; i <= MAX_SPEED_LEVEL; i++) applyItem(p, ItemType.SPEED);
  t('경공술 3회: 0.16→0.14→0.12→0.10', p.speedLevel === 3 && p.moveInterval === SPEED_INTERVALS[3] && SPEED_INTERVALS[3] === 0.10);
  t('경공술은 3회가 최대', !canUpgrade(p, ItemType.SPEED) && applyItem(p, ItemType.SPEED) === false && p.speedLevel === 3);
  while (applyItem(p, ItemType.RANGE));
  t('화약 강화 최대 5칸', p.range === MAX_RANGE);
  while (applyItem(p, ItemType.BOMB));
  t('부적 두루마리 최대 4개', p.maxBombs === MAX_BOMBS);
}

// ---------- 드롭
{
  const g = crateGame(0);
  blowCrate(g);
  t('확률 0이면 아이템이 없다', g.items.length === 0 && g.map.grid[5][5] === Tile.FLOOR);
}
{
  const g = crateGame(1);
  g.players[0].x = 4; g.players[0].y = 5;
  placeBomb(g, g.players[0]);
  g.players[0].x = 2; g.players[0].y = 2;
  run(g, seconds(FUSE_TIME) + 1);
  const it = g.items[0];
  t('상자가 부서진 칸에 아이템이 생기지만 폭발 중에는 보이지 않는다', g.items.length === 1 && it.x === 5 && it.y === 5 && it.ready === false && g.explosions.length > 0);
  run(g, seconds(EXPLOSION_TIME) + 2);
  t('폭발이 끝나면 아이템이 나타난다', g.explosions.length === 0 && g.items[0].ready === true);
}
{
  const g = crateGame(1);
  blowCrate(g);
  t('같은 폭발에는 방금 생긴 아이템이 사라지지 않는다', g.items.length === 1);
}
{
  // 같은 시드는 같은 결과
  const a = crateGame(1), b = crateGame(1);
  blowCrate(a); blowCrate(b);
  t('같은 시드면 같은 종류가 나온다', a.items[0].type === b.items[0].type);
}
{
  // 분포: 속도 35 / 범위 35 / 부적 30
  const g = blank(1);
  const n = { speed: 0, range: 0, bomb: 0 };
  for (let i = 0; i < 3000; i++) { const it = maybeDrop(g, 3, 3); n[it.type]++; g.items.length = 0; }
  const f = (k) => n[k] / 3000;
  t('종류 분포가 가중치(35/35/30)에 가깝다', Math.abs(f('speed') - 0.35) < 0.04 && Math.abs(f('range') - 0.35) < 0.04 && Math.abs(f('bomb') - 0.30) < 0.04);
}
{
  // 확률 0.35
  const g = blank(0.35);
  let drops = 0;
  for (let i = 0; i < 3000; i++) { if (maybeDrop(g, 3, 3)) drops++; g.items.length = 0; }
  t('드롭 확률이 약 35%', Math.abs(drops / 3000 - 0.35) < 0.04);
}

// ---------- 최대치 재추첨
{
  const g = blank(1);
  g.players.forEach((p) => { while (applyItem(p, ItemType.SPEED)); });
  let sawSpeed = false, sawOther = 0;
  for (let i = 0; i < 300; i++) { const it = maybeDrop(g, 3, 3); if (it.type === ItemType.SPEED) sawSpeed = true; else sawOther++; g.items.length = 0; }
  t('둘 다 경공술 최대면 경공술은 나오지 않고 다른 아이템이 나온다', !sawSpeed && sawOther === 300);
}
{
  const g = blank(1);
  g.players[0].speedLevel = MAX_SPEED_LEVEL;
  let sawSpeed = false;
  for (let i = 0; i < 300; i++) { const it = maybeDrop(g, 3, 3); if (it.type === ItemType.SPEED) sawSpeed = true; g.items.length = 0; }
  t('한 명만 최대면 아직 강화할 수 있는 상대를 위해 나올 수 있다', sawSpeed);
}
{
  const g = blank(1);
  g.players.forEach((p) => { while (applyItem(p, ItemType.SPEED)); while (applyItem(p, ItemType.RANGE)); while (applyItem(p, ItemType.BOMB)); });
  t('둘 다 모든 능력이 최대면 아이템이 나오지 않는다', maybeDrop(g, 3, 3) === null && g.items.length === 0);
}
{
  const g = blank(1);
  g.players[1].state = PlayerState.ELIMINATED;
  while (applyItem(g.players[0], ItemType.RANGE));
  let sawRange = false;
  for (let i = 0; i < 200; i++) { const it = maybeDrop(g, 3, 3); if (it.type === ItemType.RANGE) sawRange = true; g.items.length = 0; }
  t('탈락한 플레이어는 기준에서 제외된다', !sawRange);
}

// ---------- 폭발과 아이템
{
  const g = blank(0);
  g.items.push({ x: 8, y: 5, type: ItemType.RANGE, ready: true });
  g.players[0].x = 8; g.players[0].y = 4; // 부적을 (8,4)에 놓는다 → 십자가 (8,5)를 덮는다
  g.players[0].hp = 2;
  placeBomb(g, g.players[0]);
  g.players[0].x = 2; g.players[0].y = 2;
  run(g, seconds(FUSE_TIME) + 2);
  t('폭발이 닿으면 바닥의 아이템이 사라진다', g.items.length === 0);
}
{
  const g = blank(0);
  g.items.push({ x: 9, y: 9, type: ItemType.RANGE, ready: false });
  g.players[0].x = 9; g.players[0].y = 9;
  pickupItems(g);
  t('아직 나타나지 않은 아이템은 주울 수 없다', g.items.length === 1 && g.players[0].range === 2);
}

// ---------- 습득
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.RANGE, ready: true });
  run(g, 1, [{ move: 'right', placeBomb: false }, none]);
  t('아이템 칸으로 들어가면 자동으로 먹고 능력치가 오른다', g.items.length === 0 && g.players[0].range === 3);
}
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.BOMB, ready: true });
  g.players[0].x = 3; g.players[0].state = PlayerState.SEALED; g.players[0].sealTimer = 2;
  pickupItems(g);
  t('봉인된 플레이어는 줍지 못한다', g.items.length === 1 && g.players[0].maxBombs === 1);
}
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.RANGE, ready: true });
  while (applyItem(g.players[0], ItemType.RANGE));
  g.players[0].x = 3;
  pickupItems(g);
  t('이미 최대인 종류는 주울 수 없고 칸에 남는다', g.items.length === 1 && g.players[0].range === MAX_RANGE);
}
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.RANGE, ready: true });
  g.players[0].x = 3; g.players[1].x = 3; g.players[1].y = 2;
  pickupItems(g);
  t('같은 칸에 둘이 있으면 한 명만(번호가 빠른 쪽) 먹는다', g.items.length === 0 && g.players[0].range === 3 && g.players[1].range === 2);
}
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.RANGE, ready: true });
  while (applyItem(g.players[0], ItemType.RANGE));
  g.players[0].x = 3; g.players[1].x = 3; g.players[1].y = 2;
  pickupItems(g);
  t('앞 번호가 최대치면 다음 플레이어가 먹는다', g.items.length === 0 && g.players[1].range === 3);
}

// ---------- 효과 반영
{
  const g = blank(0);
  applyItem(g.players[0], ItemType.SPEED);
  run(g, 1, [{ move: 'right', placeBomb: false }, none]);
  t('경공술 1단계: 이동 후 대기 시간이 0.14초', Math.abs(g.players[0].moveCooldown - 0.14) < 1e-9);
}
{
  const g = blank(0);
  applyItem(g.players[0], ItemType.RANGE); applyItem(g.players[0], ItemType.RANGE);
  g.players[0].x = 7; g.players[0].y = 6; g.players[0].fromX = 7; g.players[0].fromY = 6;
  placeBomb(g, g.players[0]);
  g.players[0].x = 1; g.players[0].y = 1;
  run(g, seconds(FUSE_TIME) + 2);
  const cells = new Set(g.explosions.flatMap((e) => e.cells.map((c) => c.x + ',' + c.y)));
  t('화약 강화: 범위 4칸까지 폭발', cells.has('11,6') && cells.has('3,6') && !cells.has('12,6'));
}
{
  const g = blank(0);
  applyItem(g.players[0], ItemType.BOMB);
  updateGame(g, [{ move: null, placeBomb: true }, none]);
  g.players[0].x = 3; g.players[0].y = 2;
  updateGame(g, [{ move: null, placeBomb: true }, none]);
  t('부적 두루마리: 동시에 2개 설치', g.bombs.length === 2);
}
{
  const g = createGame(loadMap(MAPS.forest, 3), { countdown: 0, hazards: false });
  t('새 판은 아이템·능력치가 초기화된다', g.items.length === 0 && g.players.every((p) => p.speedLevel === 0 && p.range === 2 && p.maxBombs === 1));
}

// ---------- 중복 방지·시드 재현
{
  // 두 부적이 같은 틱에 같은 상자를 부수면 아이템도 한 번만 나온다.
  const g = blank(1, [{ x: 7, y: 5, t: Tile.BREAKABLE }]);
  g.players[0].x = 5; g.players[0].y = 5; placeBomb(g, g.players[0]);
  g.players[0].x = 9; g.players[0].y = 5; g.bombs.push({ id: 99, ownerId: 1, x: 9, y: 5, fuse: g.bombs[0].fuse, range: 2 });
  g.players[0].x = 2; g.players[0].y = 2;
  run(g, seconds(FUSE_TIME) + 2);
  t('같은 틱에 두 폭발이 같은 상자를 맞혀도 아이템은 한 번만 나온다', g.map.grid[5][7] === Tile.FLOOR && g.items.length === 1);
}
{
  const a = loadMap(MAPS.forest, 5), b = loadMap(MAPS.forest, 5), c = loadMap(MAPS.forest, 6);
  const sig = (m) => m.grid.map((r) => r.join('')).join('|');
  t('같은 시드는 같은 상자 배치, 다른 시드는 다른 배치', sig(a) === sig(b) && sig(a) !== sig(c));
}

// ---------- 획득 연출(머리 위 표시·소리 이벤트)
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.SPEED, ready: true });
  run(g, 1, [{ move: 'right', placeBomb: false }, none]);
  t('먹으면 머리 위 표시가 생긴다', g.popups.length === 1 && g.popups[0].playerId === 0 && g.popups[0].itemType === ItemType.SPEED);
  t('먹으면 소리 이벤트가 쌓인다', g.events.length === 1 && g.events[0].type === 'pickup' && g.events[0].itemType === ItemType.SPEED);
  run(g, 30);
  t('0.5초 뒤에도 표시가 남아 있다', g.popups.length === 1 && g.popups[0].age > 0.4 && g.popups[0].age < 0.6);
  run(g, 40);
  t('1초가 지나면 표시가 사라진다', g.popups.length === 0);
}
{
  const g = blank(0);
  g.items.push({ x: 3, y: 2, type: ItemType.RANGE, ready: true });
  while (applyItem(g.players[0], ItemType.RANGE));
  g.players[0].x = 3;
  run(g, 1);
  t('못 주우면 표시도 소리도 없다', g.popups.length === 0 && g.events.length === 0);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
