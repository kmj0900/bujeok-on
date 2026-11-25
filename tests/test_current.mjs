// 폭포 계곡 물살(밀어내기) 테스트: node tests/test_current.mjs
import { MAPS } from '../js/maps.js';
import { loadMap, Tile, validateDefinition } from '../js/map.js';
import { createGame, updateGame, pause, resume, Phase, STEP } from '../js/game.js';
import { PlayerState, MAX_HP, BOMB_DAMAGE } from '../js/player.js';
import { beginWarning, pathCells, pushStepsAt } from '../js/hazard.js';
import { placeBomb } from '../js/bomb.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

const NONE = { move: null, placeBomb: false };
const secs = (s) => Math.round(s / STEP);
const newGame = (seed = 1, opts = {}) => createGame(loadMap(MAPS.waterfall, seed), { countdown: 0, ...opts });
const step = (g, n = 1) => { for (let i = 0; i < n; i++) updateGame(g, [NONE, NONE]); };

// 안쪽이 전부 바닥인 폭포 계곡 판
// 경과 시간을 130초(3칸 단계)로 두고, 예약된 물살이 끼어들지 않게 막는다. 칸 수 자체를 시험하는 곳은 time을 직접 바꾼다.
function open(seed = 1, time = 130) {
  const g = newGame(seed);
  g.time = time;
  g.hazard.nextAt = 1e9;
  for (let y = 1; y <= 11; y++) for (let x = 1; x <= 13; x++) g.map.grid[y][x] = Tile.FLOOR;
  g.players[1].x = 13; g.players[1].y = 11;
  return g;
}
const ROW5 = { axis: 'row', index: 5, dir: 1 };   // 왼→오 흐름
const ROW5R = { axis: 'row', index: 5, dir: -1 }; // 오→왼
const COL7 = { axis: 'col', index: 7, dir: 1 };   // 위→아래

// ---- 설정·검증 ----
{
  const g = newGame(1);
  t('폭포 계곡 맵은 검증을 통과하고 물살 위협이 만들어진다', validateDefinition(MAPS.waterfall).length === 0 && g.hazard && g.hazard.cfg.type === 'current');
  t('물살 기본값: 예고 1.5초, 2초 흐름, 0.3초마다 한 칸, 경과 시간별 1·2·3칸', g.hazard.cfg.warnTime === 1.5 && g.hazard.cfg.flowDuration === 2 && g.hazard.cfg.pushInterval === 0.3 && JSON.stringify(g.hazard.cfg.pushSteps) === '[[0,1],[60,2],[120,3]]');
  t('물살 스케줄: 20초 뒤 시작, 20초 간격, 남은 60초부터 15초(수리검보다 잦다)', g.hazard.cfg.startDelay === 20 && g.hazard.cfg.interval === 20 && g.hazard.cfg.lateTimeLeft === 60 && g.hazard.cfg.lateInterval === 15);
  t('hazards:false면 물살도 없다', newGame(1, { hazards: false }).hazard === null);
  t('물살 값이 0 이하이면 맵 검증이 거른다', validateDefinition({ ...MAPS.waterfall, hazard: { type: 'current', warnTime: 0 } }).length > 0 && validateDefinition({ ...MAPS.waterfall, hazard: { type: 'current', pushInterval: -1 } }).length > 0);
  t('pushSteps가 잘못되면 맵 검증이 거른다(빈 목록·0칸·소수 칸)', [[], [[0, 0]], [[0, 1.5]], 'x'].every((ps) => validateDefinition({ ...MAPS.waterfall, hazard: { type: 'current', pushSteps: ps } }).length > 0));
  t('깊은 숲은 여전히 수리검이다', createGame(loadMap(MAPS.forest, 1), { countdown: 0 }).hazard.cfg.type === 'shuriken');
}

// ---- 한 번 흐르는 동안 ----
{
  const g = open();
  g.players[0].x = 3; g.players[0].y = 5;
  beginWarning(g, ROW5);
  step(g, secs(1.4));
  t('예고 중(1.4초)에는 밀리지 않고 상태가 warn', g.players[0].x === 3 && g.hazard.current.state === 'warn');
  step(g, secs(0.2) + 1);
  t('예고 1.5초 뒤 물이 흐르기 시작(flow)', g.hazard.current && g.hazard.current.state === 'flow' && g.events.some((e) => e.type === 'hazard-fire'));
  step(g, secs(0.3));
  t('흐르기 시작 후 0.3초에 한 칸 밀림', g.players[0].x === 4 && g.players[0].y === 5);
  step(g, secs(0.3));
  t('0.6초에 두 칸', g.players[0].x === 5);
  t('3칸 단계에서는 0.6초에 아직 물이 흐르는 중', g.hazard.current && g.hazard.current.state === 'flow' && g.hazard.current.steps === 3);
  step(g, secs(0.3) + 1);
  t('3칸 단계(130초)는 0.9초에 3칸(x 3→6) 밀리고, 물은 계속 흐른다', g.players[0].x === 6 && g.hazard.current && g.hazard.current.state === 'flow');
  step(g, secs(1.0));
  t('물은 흐르기 시작 후 2초가 되면 끝난다', g.hazard.current === null);
  t('밀려도 피해·무적·봉인이 없다', g.players[0].hp === MAX_HP && g.players[0].invincible === 0 && g.players[0].state === PlayerState.NORMAL);
  step(g, secs(2));
  t('끝난 뒤에는 더 밀리지 않는다', g.players[0].x === 6);
}

// ---- 경과 시간별 칸 수 ----
{
  t('칸 수 계산: 0·59.9초 1칸, 60·119.9초 2칸, 120초 이후 3칸',
    [[0, 1], [59.9, 1], [60, 2], [119.9, 2], [120, 3], [179, 3]].every(([tm, n]) => pushStepsAt(MAPS.waterfall.hazard, tm) === n));
  for (const [tm, n] of [[10, 1], [60, 2], [90, 2], [120, 3], [165, 3]]) {
    const g = open(1, tm);
    g.players[0].x = 3; g.players[0].y = 5;
    beginWarning(g, ROW5);
    step(g, secs(1.5) + secs(0.3 * n) + 3);
    const xAfter = g.players[0].x;
    step(g, secs(2.0));
    t(`경과 ${tm}초에 시작한 물살은 ${n}칸만 밀고, 물이 끝날 때까지 더 밀지 않는다`, xAfter === 3 + n && g.players[0].x === 3 + n && g.hazard.current === null);
  }
  const g = open(1, 59.9);
  beginWarning(g, ROW5);
  t('칸 수는 물살이 시작될 때의 경과 시간으로 정해져 흐르는 도중에 바뀌지 않는다', g.hazard.current.steps === 1);
}

// ---- 한 판의 빈도: 20·40·60·80·100·120·135·150·165초, 칸 수 1·1·2·2·2·3·3·3·3 ----
{
  const g = newGame(3);
  const warns = [], steps = [];
  for (let i = 0; i < secs(181) && g.phase === Phase.PLAYING; i++) {
    g.players.forEach((p) => { p.invincible = 999; });
    updateGame(g, [NONE, NONE]);
    for (const e of g.events) if (e.type === 'hazard-warn') { warns.push(g.time); steps.push(g.hazard.current.steps); }
    g.events.length = 0;
  }
  const expected = [20, 40, 60, 80, 100, 120, 135, 150, 165];
  t('예고 시각이 20·40·60·80·100·120·135·150·165초다', warns.length === 9 && warns.every((w, i) => Math.abs(w - expected[i]) < 0.05), warns.map((w) => w.toFixed(1)).join(','));
  t('칸 수는 1·1·2·2·2·3·3·3·3', steps.join() === '1,1,2,2,2,3,3,3,3', steps.join());
}

// ---- 닿으면 밀린다: 오래 흐름 · 막히면 재시도 · 중간에 들어와도 · 한 명당 정해진 칸까지 ----
{
  const g = open(1, 70); // 2칸 단계
  g.players[0].x = 3; g.players[0].y = 5;
  beginWarning(g, ROW5);
  step(g, secs(1.5) + secs(1.8));
  t('물은 흐르기 시작 후 1.8초에도 아직 흐르고 있다(눈에 보이는 시간)', g.hazard.current && g.hazard.current.state === 'flow');
  step(g, secs(0.3));
  t('흐르기 시작 후 2초가 지나면 끝난다', g.hazard.current === null);

  const m = open(1, 70); // 흐르는 중에 줄에 들어온 닌자도 밀린다
  m.players[0].x = 3; m.players[0].y = 4; // 줄 바로 옆
  beginWarning(m, ROW5);
  step(m, secs(1.5) + secs(1.0));
  m.players[0].y = 5; // 흐르는 중에 줄로 들어옴
  step(m, secs(0.7));
  t('흐르는 중에 줄에 들어온 닌자도 닿으면 2칸 밀린다(x 3→5)', m.players[0].x === 5);

  const b = open(1, 70); // 앞이 막혀 있으면 계속 시도하고, 길이 열리면 밀린다
  b.players[0].x = 3; b.players[0].y = 5; b.map.grid[5][4] = Tile.SOLID;
  beginWarning(b, ROW5);
  step(b, secs(1.5) + secs(1.0));
  t('앞이 막혀 있는 동안은 밀리지 않는다', b.players[0].x === 3);
  b.map.grid[5][4] = Tile.FLOOR; // 길이 열림
  step(b, secs(0.7));
  t('길이 열리면(물이 끝나기 전) 남은 칸만큼 밀린다(x 3→5)', b.players[0].x === 5);

  const r = open(1, 70); // 줄을 나갔다 다시 들어와도 칸이 늘지 않는다
  r.players[0].x = 3; r.players[0].y = 5;
  beginWarning(r, ROW5);
  step(r, secs(1.5) + secs(0.3) + 3);
  t('한 칸 밀린 뒤', r.players[0].x === 4);
  r.players[0].y = 4; step(r, secs(0.3)); // 줄 밖으로
  r.players[0].y = 5; step(r, secs(0.3) + 3); // 다시 줄 안으로
  t('줄 밖으로 나갔다 들어오면 남은 1칸만 더 밀린다(합계 2칸, x 5)', r.players[0].x === 5);
  step(r, secs(2.0));
  t('그 뒤로는 물이 끝날 때까지 더 밀리지 않는다', r.players[0].x === 5);
}

// ---- 경과 시간 앞당기기(?t=) ----
{
  const g = createGame(loadMap(MAPS.waterfall, 1), { countdown: 0, startTime: 100, hazardStart: 3 });
  t('startTime 100: 경과 100초·남은 80초에서 시작', g.time === 100 && g.timeLeft === 80);
  step(g, secs(2.8));
  t('첫 물살은 시작 지점에서 hazardStart(3초) 뒤에 예고된다', g.hazard.count === 0);
  step(g, secs(0.4));
  t('3초 뒤 예고가 시작되고 100초대라 2칸 단계', g.hazard.count === 1 && g.hazard.current.steps === 2);
  const h = createGame(loadMap(MAPS.waterfall, 1), { countdown: 0, startTime: 100 });
  t('startTime만 주면 첫 위협은 startTime + startDelay(20초)', h.hazard.nextAt === 120);
  t('startTime이 없으면 기존과 같다', createGame(loadMap(MAPS.waterfall, 1), { countdown: 0 }).time === 0);
}

// ---- 방향 ----
{
  const g = open();
  g.players[0].x = 10; g.players[0].y = 5;
  beginWarning(g, ROW5R);
  step(g, secs(2.8));
  t('오른쪽에서 왼쪽 흐름(dir -1): x 10→7', g.players[0].x === 7);
  const h = open();
  h.players[0].x = 7; h.players[0].y = 3;
  beginWarning(h, COL7);
  step(h, secs(2.8));
  t('세로 줄(위→아래): y 3→6, x는 그대로', h.players[0].x === 7 && h.players[0].y === 6);
}

// ---- 줄 밖·상태 ----
{
  const g = open();
  g.players[0].x = 3; g.players[0].y = 4; // 줄 바로 옆
  beginWarning(g, ROW5);
  step(g, secs(2.8));
  t('줄 밖에 있는 닌자는 밀리지 않는다', g.players[0].x === 3 && g.players[0].y === 4);
  const s = open();
  s.players[0].x = 3; s.players[0].y = 5;
  s.players[0].state = PlayerState.SEALED; s.players[0].sealTimer = 99;
  beginWarning(s, ROW5);
  step(s, secs(2.8));
  t('봉인된 닌자는 밀지 않는다', s.players[0].x === 3);
  const b = open();
  b.players[0].x = 3; b.players[0].y = 5; b.players[1].x = 6; b.players[1].y = 5;
  beginWarning(b, ROW5);
  step(b, secs(2.8));
  t('두 닌자 모두 같은 규칙으로 밀린다(6, 9)', b.players[0].x === 6 && b.players[1].x === 9);
}

// ---- 막힘 ----
{
  const g = open();
  g.players[0].x = 3; g.players[0].y = 5; g.map.grid[5][5] = Tile.SOLID;
  beginWarning(g, ROW5);
  step(g, secs(2.8));
  t('바위에 막히면 그 앞에서 멈춘다(x=4)', g.players[0].x === 4);
  const c = open();
  c.players[0].x = 3; c.players[0].y = 5; c.map.grid[5][6] = Tile.BREAKABLE;
  beginWarning(c, ROW5);
  step(c, secs(2.8));
  t('상자에 막히면 멈추고 상자는 부서지지 않는다', c.players[0].x === 5 && c.map.grid[5][6] === Tile.BREAKABLE);
  const w = open();
  w.players[0].x = 12; w.players[0].y = 5;
  beginWarning(w, ROW5);
  step(w, secs(2.8));
  t('바깥 벽에서 멈춘다(x=13, 벽 밖으로 안 나간다)', w.players[0].x === 13);
  const bm = open();
  bm.players[0].x = 3; bm.players[0].y = 5;
  placeBomb(bm, bm.players[1]);
  bm.bombs[0].x = 5; bm.bombs[0].y = 5; bm.bombs[0].fuse = 99;
  beginWarning(bm, ROW5);
  step(bm, secs(2.8));
  t('부적이 있는 칸으로는 밀리지 않는다(x=4)', bm.players[0].x === 4);
}

// ---- 폭발·아이템 연계 ----
{
  const g = open();
  g.players[0].x = 3; g.players[0].y = 5;
  g.explosions.push({ ownerId: 1, cells: [{ x: 5, y: 5 }], remaining: 99 });
  beginWarning(g, ROW5);
  step(g, secs(1.5) + secs(0.6) + 3);
  t('밀려서 폭발 칸에 들어가면 폭발 피해를 받는다', g.players[0].x >= 5 && g.players[0].hp === MAX_HP - BOMB_DAMAGE);
  const it = open();
  it.players[0].x = 3; it.players[0].y = 5;
  it.items.push({ x: 4, y: 5, type: 'range', ready: true });
  beginWarning(it, ROW5);
  step(it, secs(1.5) + secs(0.3) + 3);
  t('밀려서 아이템 칸에 닿으면 주워진다', it.items.length === 0 && it.players[0].range === 3);
}

// ---- 일정·일시정지·재대결·시드 ----
{
  const g = newGame(1);
  step(g, secs(19.8));
  t('시작 후 20초 전에는 물살 예고가 없다', g.hazard.current === null && g.hazard.count === 0);
  step(g, secs(0.4));
  t('20초에 첫 예고가 시작된다(1칸 단계)', g.hazard.count === 1 && g.hazard.current && g.hazard.current.state === 'warn' && g.hazard.current.steps === 1);
  const p = open();
  p.players[0].x = 3; p.players[0].y = 5;
  beginWarning(p, ROW5);
  step(p, secs(1.5) + secs(0.3) + 3);
  pause(p);
  const before = { x: p.players[0].x, ft: p.hazard.current.flowTime };
  for (let i = 0; i < 300; i++) updateGame(p, [NONE, NONE]);
  t('일시정지 중에는 물살이 멈춘다', p.players[0].x === before.x && p.hazard.current.flowTime === before.ft);
  resume(p);
  step(p, secs(1));
  t('재개하면 이어서 흐른다', p.players[0].x > before.x);
  t('재대결(새 게임)에서는 물살이 초기화된다', newGame(1).hazard.current === null && newGame(1).hazard.count === 0);
  const lineOf = (seed) => { const q = newGame(seed); step(q, secs(20.1)); const l = q.hazard.current.line; return `${l.axis}${l.index}${l.dir}`; };
  t('같은 시드는 같은 줄, 다른 시드는 다른 줄', lineOf(4) === lineOf(4) && lineOf(4) !== lineOf(5));
}

// ---- 한 판 완주: 물살이 켜진 상태에서 180초가 정상 종료, 닌자는 항상 바닥 칸 ----
{
  const g = newGame(2);
  let okTile = true;
  for (let i = 0; i < secs(181) && g.phase === Phase.PLAYING; i++) {
    updateGame(g, [NONE, NONE]);
    g.events.length = 0;
    for (const p of g.players) if (g.map.grid[p.y][p.x] !== Tile.FLOOR) okTile = false;
  }
  t('물살이 9번 흐른 한 판이 180초에 종료되고 닌자는 항상 바닥 칸에 있다', g.phase === Phase.RESULT && g.hazard.count === 9 && okTile, `예고 ${g.hazard.count}번`);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
