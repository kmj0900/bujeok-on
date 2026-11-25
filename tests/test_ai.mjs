import { MAPS } from '../js/maps.js';
import { loadMap, createRng, Tile } from '../js/map.js';
import { createGame, updateGame, Phase, STEP } from '../js/game.js';
import { PlayerState, MAX_HP } from '../js/player.js';
import { createAI } from '../js/ai.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const none = { move: null, placeBomb: false };

function blank(fill = Tile.FLOOR) {
  const map = loadMap(MAPS.forest, 1);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
    map.grid[y][x] = (x === 0 || y === 0 || x === 14 || y === 12) ? Tile.SOLID : fill;
  }
  const g = createGame(map, { countdown: 0, hazards: false });
  return g;
}

// ---------- 1) AI끼리 전체 판 완주: 벽 통과 없음, 예외 없음, 판이 끝남
{
  let allFloor = true, finished = 0, placedMin = Infinity, hits = 0, results = { win: 0, draw: 0 };
  const t0 = Date.now();
  for (let seed = 1; seed <= 20; seed++) {
    const map = loadMap(MAPS.forest, seed);
    const g = createGame(map, { countdown: 0, hazardStart: 10 }); // 수리검을 켠 채로
    const ais = [createAI(0, createRng(seed * 11)), createAI(1, createRng(seed * 13))];
    let hp = [MAX_HP, MAX_HP];
    for (let i = 0; i < 12000 && g.phase === Phase.PLAYING; i++) {
      updateGame(g, [ais[0].getAction(g, STEP), ais[1].getAction(g, STEP)]);
      for (const p of g.players) if (p.state !== PlayerState.ELIMINATED && map.grid[p.y][p.x] !== Tile.FLOOR) allFloor = false;
      g.players.forEach((p, k) => { if (p.hp < hp[k]) { hits++; hp[k] = p.hp; } });
    }
    if (g.phase === Phase.RESULT) { finished++; results[g.result.type]++; }
    placedMin = Math.min(placedMin, g.nextBombId - 1);
  }
  t('AI끼리 20판 모두 끝까지 완주(RESULT 도달)', finished === 20, `승 ${results.win} / 무 ${results.draw}, 총 피격 ${hits}, ${Date.now() - t0}ms`);
  t('AI는 어떤 판에서도 벽·바위·상자 칸에 들어가지 않음', allFloor);
  t('모든 판에서 AI가 부적을 최소 1회 설치', placedMin >= 1, `최소 설치 수 ${placedMin}`);
}

// ---------- 2) 위험 회피: 도망칠 시간이 있으면 맞지 않는다
{
  const rng = createRng(4242);
  let total = 0, hurt = 0;
  for (let n = 0; n < 80; n++) {
    const g = blank();
    // 내부에 고정 바위를 일부 둔다(좁은 지형에서도 회피해야 함)
    for (let y = 2; y <= 10; y += 2) for (let x = 2; x <= 12; x += 2) g.map.grid[y][x] = Tile.SOLID;
    const open = [];
    for (let y = 1; y < 12; y++) for (let x = 1; x < 14; x++) if (g.map.grid[y][x] === Tile.FLOOR) open.push({ x, y });
    const me = open[Math.floor(rng() * open.length)];
    g.players[0].x = me.x; g.players[0].y = me.y;
    g.players[1].x = 13; g.players[1].y = 11; if (me.x > 10 && me.y > 8) { g.players[1].x = 1; g.players[1].y = 1; }
    // 내 칸 또는 이웃 칸에 상대 부적(퓨즈 1.6~2.4초)
    const spots = open.filter((c) => Math.abs(c.x - me.x) + Math.abs(c.y - me.y) <= 2);
    const b = spots[Math.floor(rng() * spots.length)];
    g.bombs.push({ id: 1, ownerId: 1, x: b.x, y: b.y, fuse: 1.6 + rng() * 0.8, range: 2 });
    g.nextBombId = 2;
    const ai = createAI(0, createRng(n + 1));
    for (let i = 0; i < 200; i++) updateGame(g, [ai.getAction(g, STEP), none]);
    total++;
    if (g.players[0].hp < MAX_HP) hurt++;
  }
  t('폭발 위험 회피: 80개 배치(퓨즈 1.6~2.4초)에서 피격 0회', hurt === 0, `피격 ${hurt}/${total}`);
}
{
  // 연쇄 폭발 위험: 두 부적이 이어져 있어 앞쪽 부적이 먼저 터지며 뒤 부적을 유폭시키는 경우
  let hurt = 0;
  for (let n = 0; n < 20; n++) {
    const g = blank();
    g.players[0].x = 6; g.players[0].y = 5; g.players[1].x = 13; g.players[1].y = 11;
    g.bombs.push({ id: 1, ownerId: 1, x: 5, y: 5, fuse: 1.8, range: 2 });
    g.bombs.push({ id: 2, ownerId: 1, x: 7, y: 6, fuse: 2.4, range: 3 }); // 연쇄 폭발 범위에 들어옴
    g.nextBombId = 3;
    const ai = createAI(0, createRng(n + 100));
    for (let i = 0; i < 200; i++) updateGame(g, [ai.getAction(g, STEP), none]);
    if (g.players[0].hp < MAX_HP) hurt++;
  }
  t('연쇄 폭발 시각을 고려해 회피(20회 피격 0)', hurt === 0, `피격 ${hurt}/20`);
}
{
  // 이미 터지고 있는 폭발 칸으로 걸어 들어가지 않는다
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5; g.players[1].x = 13; g.players[1].y = 11;
  g.explosions.push({ ownerId: 1, cells: [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 5, y: 5 }].slice(1), remaining: 0.4 });
  const ai = createAI(0, createRng(5));
  for (let i = 0; i < 60; i++) updateGame(g, [ai.getAction(g, STEP), none]);
  t('활성 폭발 칸에 들어가지 않음', g.players[0].hp === MAX_HP);
}

// ---------- 3) 탈출로가 없는 곳에서는 부적을 설치하지 않는다
{
  const g = blank(Tile.SOLID);
  g.map.grid[5][5] = Tile.FLOOR; g.map.grid[5][6] = Tile.FLOOR; g.map.grid[5][7] = Tile.BREAKABLE;
  g.players[0].x = 5; g.players[0].y = 5; g.players[1].x = 13; g.players[1].y = 11;
  const ai = createAI(0, createRng(9));
  for (let i = 0; i < 1500; i++) updateGame(g, [ai.getAction(g, STEP), none]);
  t('막다른 2칸 통로에서는 부적을 설치하지 않음', g.nextBombId === 1 && g.players[0].hp === MAX_HP);
}

// ---------- 4) 상자를 부수며 스스로 맞지 않고 최소 1회 안전 설치
{
  let selfHits = 0, noBomb = 0, maxIdle = 0, wins = 0, games = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const map = loadMap(MAPS.forest, seed);
    const g = createGame(map, { countdown: 0, hazardStart: 10 }); // 수리검을 켠 채로
    const ai = createAI(1, createRng(seed));
    let idle = 0, lastX = -1, lastY = -1;
    for (let i = 0; i < 3600 && g.phase === Phase.PLAYING; i++) {
      updateGame(g, [none, ai.getAction(g, STEP)]);
      const p = g.players[1];
      if (p.x === lastX && p.y === lastY) idle++; else { idle = 0; lastX = p.x; lastY = p.y; }
      maxIdle = Math.max(maxIdle, idle);
    }
    games++;
    if (g.players[1].hp < MAX_HP) selfHits++;
    if (g.nextBombId === 1) noBomb++;
    if (g.result?.type === 'win' && g.result.winnerId === 1) wins++;
  }
  t('혼자 60초씩 15판: AI가 스스로 맞은 판 0', selfHits === 0, `피격 판 ${selfHits}/${games}`);
  t('15판 모두 AI가 부적을 최소 1회 설치', noBomb === 0, `미설치 판 ${noBomb}`);
  t('제자리에 멈춰 있는 최대 시간이 10초 미만(무한 제자리 방지)', maxIdle / 60 < 10, `최대 정지 ${(maxIdle / 60).toFixed(1)}초`);
  console.log(`  (참고) 가만히 서 있는 상대를 60초 안에 이긴 판: ${wins}/${games}`);
}

// ---------- 5) 봉인·탈락·일시정지에서는 행동하지 않는다
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5; g.players[1].x = 6; g.players[1].y = 5;
  const ai = createAI(0, createRng(3));
  g.players[0].state = PlayerState.SEALED;
  let moved = false;
  for (let i = 0; i < 120; i++) { const a = ai.getAction(g, STEP); if (a.move || a.placeBomb) moved = true; }
  t('봉인 중에는 입력이 중단됨', !moved);
  g.players[0].state = PlayerState.ELIMINATED;
  for (let i = 0; i < 60; i++) { const a = ai.getAction(g, STEP); if (a.move || a.placeBomb) moved = true; }
  t('탈락 후에는 입력이 중단됨', !moved);
  g.players[0].state = PlayerState.NORMAL; g.phase = Phase.PAUSED;
  for (let i = 0; i < 60; i++) { const a = ai.getAction(g, STEP); if (a.move || a.placeBomb) moved = true; }
  t('일시정지 중에는 입력이 중단됨', !moved);
}

// ---------- 6) 사람과 같은 API만 사용: AI가 상태를 직접 바꾸지 않는다
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5; g.players[1].x = 9; g.players[1].y = 5;
  const ai = createAI(0, createRng(1));
  const before = JSON.stringify([g.players, g.bombs, g.explosions, g.map.grid]);
  for (let i = 0; i < 30; i++) ai.getAction(g, STEP); // updateGame 없이 호출만
  t('getAction은 게임 상태를 변경하지 않음(액션만 반환)', JSON.stringify([g.players, g.bombs, g.explosions, g.map.grid]) === before);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
