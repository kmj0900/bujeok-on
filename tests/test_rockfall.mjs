// 바위산 낙석 테스트: node tests/test_rockfall.mjs
import { MAPS } from '../js/maps.js';
import { loadMap, Tile, validateDefinition, createRng } from '../js/map.js';
import { createGame, updateGame, pause, resume, Phase, STEP } from '../js/game.js';
import { PlayerState, MAX_HP, ROCK_DAMAGE } from '../js/player.js';
import { beginWarning, pickRockCells, rockCountAt } from '../js/hazard.js';
import { createAI } from '../js/ai.js';
import { drawHazardWarning, drawRockfall } from '../js/renderer.js';
import { MAP_CHOICES, SCREENS } from '../js/ui.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const NONE = { move: null, placeBomb: false };
const newGame = (seed = 1, opts = {}) => createGame(loadMap(MAPS.mountain, seed), { countdown: 0, ...opts });
const step = (g, n = 1) => { for (let i = 0; i < n; i++) updateGame(g, [NONE, NONE]); };
const secs = (s) => Math.round(s / STEP);

// ---- 설정 ----
{
  const g = newGame(1);
  t('바위산 맵 정의가 검증을 통과', validateDefinition(MAPS.mountain).length === 0);
  t('바위산에는 낙석 위협이 만들어진다', g.hazard && g.hazard.cfg.type === 'rockfall');
  const c = g.hazard.cfg;
  t('확정 값: 시작 25초, 간격 25초, 남은 60초부터 15초, 예고 1.5초', c.startDelay === 25 && c.interval === 25 && c.lateTimeLeft === 60 && c.lateInterval === 15 && c.warnTime === 1.5);
  t('돌 개수는 경과 시간 단계: 3→5→7', rockCountAt(c, 0) === 3 && rockCountAt(c, 59.9) === 3 && rockCountAt(c, 60) === 5 && rockCountAt(c, 119.9) === 5 && rockCountAt(c, 120) === 7);
  t('잘못된 rockCounts는 거른다', validateDefinition({ ...MAPS.mountain, hazard: { type: 'rockfall', rockCounts: [[0, 0]] } }).length > 0);
  t('맵 선택에 바위산이 있고 버튼 수가 맞다', MAP_CHOICES.some((m) => m.id === 'mountain') && SCREENS.map.items.length === MAP_CHOICES.length + 1);
  t('바위산 맵도 랜덤 바위·상자가 만들어진다', loadMap(MAPS.mountain, 3).grid.flat().filter((v) => v === Tile.SOLID).length > 40);
}

// ---- 칸 선택 ----
{
  const g = newGame(2);
  let ok = true;
  for (let i = 0; i < 100; i++) {
    const cells = pickRockCells(g, 4);
    const keys = new Set(cells.map((c) => c.x + ',' + c.y));
    if (cells.length !== 4 || keys.size !== 4 || cells.some((c) => g.map.grid[c.y][c.x] !== Tile.FLOOR || c.x < 1 || c.y < 1 || c.x > 13 || c.y > 11)) ok = false;
  }
  t('낙석 칸은 서로 다른 안쪽 바닥 칸(바위·상자 칸 제외)', ok);
}

// ---- 일정 ----
{
  const g = newGame(1);
  g.players.forEach((p) => { p.invincible = 999; });
  step(g, secs(24.8));
  t('시작 후 25초 전에는 예고가 없다', g.hazard.current === null && g.hazard.count === 0);
  step(g, secs(0.5));
  t('25초에 첫 예고', g.hazard.current && g.hazard.current.state === 'warn' && g.hazard.current.cells.length === 3);
}
{
  const warns = [], counts = [];
  const g = newGame(1);
  for (let i = 0; i < secs(181) && g.phase === Phase.PLAYING; i++) {
    g.players.forEach((p) => { p.invincible = 999; });
    updateGame(g, [NONE, NONE]);
    for (const e of g.events) if (e.type === 'hazard-warn') { warns.push(g.time); counts.push(g.hazard.current.cells.length); }
    g.events.length = 0;
  }
  t('한 판에 7~9번 낙석', warns.length >= 7 && warns.length <= 9, `${warns.length}번: ${warns.map((w) => w.toFixed(0)).join(',')}`);
  t('돌 개수가 경과 시간에 따라 3→5→7', counts[0] === 3 && counts[counts.length - 1] === 7 && counts.every((c, i) => i === 0 || c >= counts[i - 1]), counts.join(','));
}

// ---- 피해 ----
function setup() {
  const g = newGame(1);
  g.players[0].x = 5; g.players[0].y = 5;
  g.players[1].x = 11; g.players[1].y = 9;
  return g;
}
{
  const g = setup();
  g.map.grid[5][5] = Tile.FLOOR; g.map.grid[5][6] = Tile.FLOOR; g.map.grid[9][11] = Tile.FLOOR;
  beginWarning(g, [{ x: 5, y: 5 }, { x: 3, y: 3 }]);
  step(g, secs(1.4));
  t('예고 중에는 피해가 없다', g.players[0].hp === MAX_HP && g.hazard.current.state === 'warn');
  step(g, secs(0.2));
  t('떨어진 칸의 닌자는 피해(하트 1개)와 무적', g.players[0].hp === MAX_HP - ROCK_DAMAGE && g.players[0].state === PlayerState.NORMAL && g.players[0].invincible > 1);
  t('다른 칸의 닌자는 피해 없음', g.players[1].hp === MAX_HP);
  t('떨어진 뒤 fall 상태로 먼지 연출', g.hazard.current && g.hazard.current.state === 'fall');
  step(g, secs(0.5));
  t('연출이 끝나면 위협이 사라지고 돌은 남지 않는다', g.hazard.current === null && g.map.grid[5][5] === Tile.FLOOR);
}
{
  const g = setup();
  g.players[0].invincible = 5;
  beginWarning(g, [{ x: 5, y: 5 }]);
  step(g, secs(1.7));
  t('무적이면 맞아도 피해 없음', g.players[0].hp === MAX_HP);
}
{
  const g = setup();
  g.players[0].hp = 1;
  beginWarning(g, [{ x: 5, y: 5 }]);
  step(g, secs(1.7));
  t('체력 1에서 맞으면 봉인', g.players[0].state === PlayerState.SEALED);
  const g2 = setup(); g2.players[0].state = PlayerState.SEALED; g2.players[0].sealTimer = 9; g2.players[0].hp = 0;
  beginWarning(g2, [{ x: 5, y: 5 }]);
  step(g2, secs(1.7));
  t('봉인 중인 닌자는 추가 피해 없음', g2.players[0].hp === 0);
  const g3 = setup();
  beginWarning(g3, [{ x: 5, y: 5 }, { x: 11, y: 9 }]);
  step(g3, secs(1.7));
  t('두 닌자에게 똑같이 적용', g3.players[0].hp === MAX_HP - ROCK_DAMAGE && g3.players[1].hp === MAX_HP - ROCK_DAMAGE);
}
{
  const g = setup();
  beginWarning(g, [{ x: 5, y: 5 }]);
  step(g, secs(1.0));
  pause(g);
  const timer = g.hazard.current.timer;
  for (let i = 0; i < 120; i++) updateGame(g, [NONE, NONE]);
  t('일시정지 중에는 낙석 타이머가 멈춘다', g.hazard.current.timer === timer && g.players[0].hp === MAX_HP);
  resume(g);
  step(g, secs(0.7));
  t('재개 후 진행되어 떨어진다', g.players[0].hp === MAX_HP - ROCK_DAMAGE);
}

// ---- AI: 예고된 칸을 피한다 ----
{
  let total = 0, hit = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const rng = createRng(seed * 17);
    const g0 = newGame(seed);
    const floors = [];
    for (let y = 1; y <= 11; y++) for (let x = 1; x <= 13; x++) if (g0.map.grid[y][x] === Tile.FLOOR && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => g0.map.grid[y + dy][x + dx] === Tile.FLOOR)) floors.push({ x, y }); // 사방이 막힌 칸은 피할 수 없으니 제외
    for (let k = 0; k < 5; k++) {
      const g = newGame(seed);
      const c = floors[Math.floor(rng() * floors.length)];
      g.players[0].x = c.x; g.players[0].y = c.y;
      g.players[1].x = c.x === 13 ? 1 : 13; g.players[1].y = c.y === 11 ? 1 : 11; g.players[1].invincible = 999;
      const ai = createAI(0, createRng(seed * 7 + k));
      beginWarning(g, [c, ...pickRockCells(g, 3).filter((q) => q.x !== c.x || q.y !== c.y).slice(0, 2)]);
      total++;
      for (let i = 0; i < secs(4) && g.phase === Phase.PLAYING; i++) {
        updateGame(g, [ai.getAction(g, STEP), NONE]);
        g.events.length = 0;
      }
      if (g.players[0].hp < MAX_HP) hit++;
    }
  }
  t('AI는 자기 칸에 예고된 낙석을 피한다(피격 0.7% 이하)', hit <= Math.ceil(total * 0.007), `${hit}/${total}`);
}
{
  let done = 0, rocks = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = newGame(seed);
    const ais = [createAI(0, createRng(seed)), createAI(1, createRng(seed + 99))];
    for (let i = 0; i < secs(185) && g.phase === Phase.PLAYING; i++) {
      updateGame(g, ais.map((a) => a.getAction(g, STEP)));
      for (const e of g.events) if (e.type === 'hazard-fire') rocks++;
      g.events.length = 0;
    }
    if (g.phase === Phase.RESULT) done++;
  }
  t('낙석을 켠 AI끼리 20판 모두 완주', done === 20, `완주 ${done}`);
  t('그 판들에서 낙석이 실제로 떨어짐', rocks > 20, `낙하 ${rocks}`);
}

// ---- 화면 ----
{
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? { width: 480, height: 416 } : (...a) => calls.push([k, a])), set: () => true });
  const g = setup();
  beginWarning(g, [{ x: 5, y: 5 }, { x: 7, y: 7 }]);
  let ok = true;
  try {
    drawHazardWarning(ctx, g); drawRockfall(ctx, g, null);
    step(g, secs(1.3)); drawHazardWarning(ctx, g); drawRockfall(ctx, g, null);
    step(g, secs(0.25)); drawRockfall(ctx, g, null);
    step(g, 20); drawRockfall(ctx, g, null);
  } catch (e) { ok = false; console.log(e); }
  t('낙석 예고·낙하·먼지를 그려도 오류가 없다(스프라이트 없이도)', ok && calls.length > 0);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
