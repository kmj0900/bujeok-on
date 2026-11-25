// AI의 수리검 회피 테스트: node tests/test_ai_hazard.mjs
import { MAPS } from '../js/maps.js';
import { loadMap, createRng, Tile } from '../js/map.js';
import { createGame, updateGame, Phase, STEP } from '../js/game.js';
import { PlayerState, MAX_HP } from '../js/player.js';
import { beginWarning } from '../js/hazard.js';
import { createAI } from '../js/ai.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const none = { move: null, placeBomb: false };

// 안쪽이 전부 바닥인 맵(수리검은 켜 둔다)
function blank(seed = 1) {
  const map = loadMap(MAPS.forest, seed);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
    map.grid[y][x] = (x === 0 || y === 0 || x === 14 || y === 12) ? Tile.SOLID : Tile.FLOOR;
  }
  return createGame(map, { countdown: 0 });
}

// AI(0번)를 (x,y)에 두고 그 줄로 예고를 시작해 4초 돌린 뒤 피격 횟수를 센다.
function trial(g, x, y, line, seed) {
  g.players[0].x = x; g.players[0].y = y;
  g.players[1].x = x === 13 ? 1 : 13; g.players[1].y = y === 11 ? 1 : 11;
  g.players[1].invincible = 999; // 상대는 신경 쓰지 않는다
  const ai = createAI(0, createRng(seed));
  beginWarning(g, line);
  let hits = 0, hp = g.players[0].hp;
  for (let i = 0; i < Math.round(4 / STEP) && g.phase === Phase.PLAYING; i++) {
    updateGame(g, [ai.getAction(g, STEP), none]);
    g.events.length = 0;
    if (g.players[0].hp < hp) { hits++; hp = g.players[0].hp; }
  }
  return hits;
}

// ---------- 1) 빈 맵: 모든 줄·방향에서 줄 위에 있던 AI가 맞지 않는다
{
  let total = 0, hit = 0;
  for (const axis of ['row', 'col']) {
    const n = axis === 'row' ? 11 : 13;
    for (let index = 1; index <= n; index++) for (const dir of [1, -1]) {
      for (const along of [1, 5, 9]) {
        const x = axis === 'row' ? Math.min(along, 13) : index;
        const y = axis === 'row' ? index : Math.min(along, 11);
        total++;
        if (trial(blank(index), x, y, { axis, index, dir }, total) > 0) hit++;
      }
    }
  }
  t('빈 맵에서 예고된 줄 위에 있던 AI가 맞은 경우 0', hit === 0, `${hit}/${total}`);
}

// 줄 밖의 바닥 칸으로 갈 수 있는가(상자·바위에 갇혀 줄 안에서만 움직이면 부적 없이는 탈출 불가)
function canLeaveLine(map, c, line) {
  const inLine = (x, y) => (line.axis === 'row' ? y === line.index : x === line.index);
  const q = [c], seen = new Set([c.x + ',' + c.y]);
  while (q.length) {
    const n = q.shift();
    if (!inLine(n.x, n.y)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = n.x + dx, ny = n.y + dy, k = nx + ',' + ny;
      if (map.grid[ny]?.[nx] === Tile.FLOOR && !seen.has(k)) { seen.add(k); q.push({ x: nx, y: ny }); }
    }
  }
  return false;
}

// ---------- 2) 실제 맵: 시드 40개에서 AI가 선 칸을 지나는 줄로 예고. 줄 밖으로 나갈 길이 있는 배치만 센다
{
  let total = 0, hit = 0, trapped = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rng = createRng(seed * 31);
    const map = loadMap(MAPS.forest, seed);
    const floors = [];
    for (let y = 1; y <= 11; y++) for (let x = 1; x <= 13; x++) if (map.grid[y][x] === Tile.FLOOR) floors.push({ x, y });
    for (let k = 0; k < 6; k++) {
      const c = floors[Math.floor(rng() * floors.length)];
      const axis = rng() < 0.5 ? 'row' : 'col';
      const line = { axis, index: axis === 'row' ? c.y : c.x, dir: rng() < 0.5 ? 1 : -1 };
      if (!canLeaveLine(map, c, line)) { trapped++; continue; }
      const g = createGame(loadMap(MAPS.forest, seed), { countdown: 0 });
      total++;
      if (trial(g, c.x, c.y, line, seed * 7 + k) > 0) hit++;
    }
  }
  t('실제 맵(랜덤 바위)에서 줄 밖으로 나갈 길이 있는 배치는 AI 피격이 드묾(0.9% 이하)', hit <= 2 && total >= 150, `${hit}/${total}, 갇힌 배치 ${trapped}개 제외`);
}

// ---------- 3) AI끼리 수리검을 켠 채 20판 완주, 수리검 피격 기록
{
  let finished = 0, shurikenHits = 0, fired = 0, allFloor = true;
  for (let seed = 1; seed <= 20; seed++) {
    const map = loadMap(MAPS.forest, seed);
    const g = createGame(map, { countdown: 0, hazardStart: 5 });
    const ais = [createAI(0, createRng(seed * 11)), createAI(1, createRng(seed * 13))];
    for (let i = 0; i < 12000 && g.phase === Phase.PLAYING; i++) {
      updateGame(g, [ais[0].getAction(g, STEP), ais[1].getAction(g, STEP)]);
      for (const e of g.events) { if (e.type === 'hazard-hit') shurikenHits++; if (e.type === 'hazard-fire') fired++; }
      g.events.length = 0;
      for (const p of g.players) if (p.state !== PlayerState.ELIMINATED && map.grid[p.y][p.x] !== Tile.FLOOR) allFloor = false;
    }
    if (g.phase === Phase.RESULT) finished++;
  }
  t('수리검을 켠 AI끼리 20판 모두 완주', finished === 20, `완주 ${finished}`);
  t('그 판들에서 수리검이 실제로 여러 번 발사됨', fired >= 40, `발사 ${fired}`);
  t('AI는 수리검을 피하는 중에도 벽·바위·상자 칸에 들어가지 않음', allFloor);
  t('AI끼리 판에서 수리검 피격이 발사 횟수의 일부 이하', shurikenHits <= fired * 0.1, `피격 ${shurikenHits}/발사 ${fired}`);
}

// ---------- 4) 폭포 계곡 물살: 줄 위의 AI는 물이 흐르기 전에 줄 밖으로 나간다
{
  let total = 0, caught = 0;
  for (const axis of ['row', 'col']) {
    const n = axis === 'row' ? 11 : 13;
    for (let index = 1; index <= n; index += 2) for (const dir of [1, -1]) for (const along of [3, 7]) {
      const map = loadMap(MAPS.waterfall, index);
      for (let y = 1; y <= 11; y++) for (let x = 1; x <= 13; x++) map.grid[y][x] = Tile.FLOOR;
      const g = createGame(map, { countdown: 0 });
      const x = axis === 'row' ? along : index, y = axis === 'row' ? index : Math.min(along, 11);
      g.players[0].x = x; g.players[0].y = y; g.players[1].x = x === 13 ? 1 : 13; g.players[1].y = y === 11 ? 1 : 11;
      const ai = createAI(0, createRng(index * 5 + along));
      const line = { axis, index, dir };
      beginWarning(g, line);
      total++;
      let inWater = false;
      for (let i = 0; i < Math.round(4 / STEP); i++) {
        updateGame(g, [ai.getAction(g, STEP), none]);
        g.events.length = 0;
        const cur = g.hazard.current;
        if (cur && cur.state === 'flow' && cur.path.some((c) => c.x === g.players[0].x && c.y === g.players[0].y)) inWater = true;
      }
      if (inWater) caught++;
    }
  }
  t('폭포 계곡: 예고된 물살 줄 위에 있던 AI가 물이 흐를 때 줄 밖에 있다', caught === 0, `${caught}/${total}`);
}
{
  let finished = 0, pushes = 0, fired = 0, selfHits = 0, allFloor = true;
  for (let seed = 1; seed <= 20; seed++) {
    const map = loadMap(MAPS.waterfall, seed);
    const g = createGame(map, { countdown: 0, hazardStart: 5 });
    const ais = [createAI(0, createRng(seed * 11)), createAI(1, createRng(seed * 13))];
    for (let i = 0; i < 12000 && g.phase === Phase.PLAYING; i++) {
      updateGame(g, [ais[0].getAction(g, STEP), ais[1].getAction(g, STEP)]);
      for (const e of g.events) { if (e.type === 'hazard-push') pushes++; if (e.type === 'hazard-fire') fired++; }
      g.events.length = 0;
      for (const p of g.players) if (p.state !== PlayerState.ELIMINATED && map.grid[p.y][p.x] !== Tile.FLOOR) allFloor = false;
    }
    if (g.phase === Phase.RESULT) finished++;
  }
  t('폭포 계곡에서 AI끼리 20판 모두 완주, 닌자는 항상 바닥 칸', finished === 20 && allFloor, `완주 ${finished}`);
  t('그 판들에서 물살이 여러 번 흐르고 AI가 밀린 횟수는 적다', fired >= 40 && pushes <= fired, `흐름 ${fired}번, 밀림 ${pushes}회`);
}

console.log(`\n통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
