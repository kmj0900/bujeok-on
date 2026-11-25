// 맵 위협(수리검) 테스트: node tests/test_hazard.mjs  (수리검은 바위·상자에 막히지 않고 줄 전체를 지나간다)
import { MAPS } from '../js/maps.js';
import { loadMap, Tile, validateDefinition } from '../js/map.js';
import { createGame, updateGame, pause, resume, Phase, STEP } from '../js/game.js';
import { PlayerState, MAX_HP, SHURIKEN_DAMAGE } from '../js/player.js';
import { beginWarning, pathCells, pickLine } from '../js/hazard.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

const NONE = { move: null, placeBomb: false };
const ROW1 = { axis: 'row', index: 1, dir: 1 };
const newGame = (seed = 1, opts = {}) => createGame(loadMap(MAPS.forest, seed), { countdown: 0, ...opts });
const step = (g, n = 1) => { for (let i = 0; i < n; i++) updateGame(g, [NONE, NONE]); };
const secs = (s) => Math.round(s / STEP);

// 1번 줄(가로, y=1)을 깨끗한 바닥으로 만들고 두 닌자를 그 줄 밖으로 치운다.
function clearRow1(g) {
  for (let x = 1; x <= 13; x++) g.map.grid[1][x] = Tile.FLOOR;
  g.players[0].x = 1; g.players[0].y = 3;
  g.players[1].x = 13; g.players[1].y = 11;
}

// 닌자를 무적으로 유지하며 한 판을 돌려 예고·발사 시각과 줄을 기록한다.
function runAndRecord(seed) {
  const g = newGame(seed);
  const warns = [], fires = [], lines = [];
  for (let i = 0; i < secs(181) && g.phase === Phase.PLAYING; i++) {
    g.players.forEach((p) => { p.invincible = 999; });
    updateGame(g, [NONE, NONE]);
    for (const e of g.events) {
      if (e.type === 'hazard-warn') { warns.push(g.time); lines.push({ ...g.hazard.current.line, len: pathCells(g.map, g.hazard.current.line).length }); }
      if (e.type === 'hazard-fire') fires.push(g.time);
    }
    g.events.length = 0;
  }
  return { g, warns, fires, lines };
}

// ---- 설정·초기화 ----
{
  const g = newGame(1);
  t('깊은 숲에는 수리검 설정이 있고 위협이 만들어진다', !!MAPS.forest.hazard && g.hazard !== null && g.hazard.cfg.type === 'shuriken');
  t('확정 값: 시작 30초, 간격 30초, 남은 60초부터 20초, 예고 1.5초', g.hazard.cfg.startDelay === 30 && g.hazard.cfg.interval === 30 && g.hazard.cfg.lateTimeLeft === 60 && g.hazard.cfg.lateInterval === 20 && g.hazard.cfg.warnTime === 1.5);
  t('hazards:false면 위협이 없다', newGame(1, { hazards: false }).hazard === null);
  const noHaz = { ...MAPS.forest }; delete noHaz.hazard;
  t('hazard 설정이 없는 맵에는 위협이 없다', createGame(loadMap(noHaz, 1), { countdown: 0 }).hazard === null);
  t('맵 정의 검증이 올바른 hazard를 통과시킨다', validateDefinition(MAPS.forest).length === 0);
  t('맵 정의 검증이 알 수 없는 종류와 0 이하 값을 거른다', validateDefinition({ ...MAPS.forest, hazard: { type: 'ufo' } }).length > 0 && validateDefinition({ ...MAPS.forest, hazard: { type: 'shuriken', warnTime: 0 } }).length > 0);
}

// ---- 일정 ----
{
  const g = newGame(1);
  step(g, secs(29.8));
  t('시작 후 30초 전에는 예고가 없다', g.hazard.current === null && g.hazard.count === 0 && !g.events.some((e) => e.type === 'hazard-warn'));
}
for (const seed of [1, 2, 3]) {
  const { g, warns, fires } = runAndRecord(seed);
  const expected = [30, 60, 90, 120, 140, 160];
  t(`시드 ${seed}: 예고가 30·60·90·120·140·160초에 시작된다(30초 간격 → 남은 60초부터 20초 간격)`, warns.length === 6 && warns.every((w, i) => near(w, expected[i])));
  t(`시드 ${seed}: 발사는 예고 1.5초 뒤`, fires.length === 6 && fires.every((f, i) => near(f - warns[i], 1.5)));
  t(`시드 ${seed}: 판이 180초에 정상 종료된다`, g.phase === Phase.RESULT);
}

// ---- 줄 선택 ----
{
  let fullLine = true, noRepeat = true;
  for (let seed = 1; seed <= 6; seed++) {
    const { lines } = runAndRecord(seed);
    fullLine = fullLine && lines.every((l) => l.len === (l.axis === 'row' ? 13 : 11));
    noRepeat = noRepeat && lines.every((l, i) => i === 0 || !(l.axis === lines[i - 1].axis && l.index === lines[i - 1].index));
  }
  t('고른 줄의 경로는 바위·상자와 상관없이 줄 전체다(가로 13칸·세로 11칸)', fullLine);
  t('직전과 같은 줄은 연속으로 뽑지 않는다', noRepeat);
  const a = runAndRecord(4).lines.map((l) => `${l.axis}${l.index}${l.dir}`).join();
  const b = runAndRecord(4).lines.map((l) => `${l.axis}${l.index}${l.dir}`).join();
  const c = runAndRecord(5).lines.map((l) => `${l.axis}${l.index}${l.dir}`).join();
  t('같은 시드는 같은 줄 순서, 다른 시드는 다르다', a === b && a !== c);
  const kinds = new Set();
  for (let seed = 1; seed <= 6; seed++) runAndRecord(seed).lines.forEach((l) => kinds.add(l.axis + (l.dir === 1 ? '+' : '-')));
  t('가로·세로, 양쪽 방향이 모두 나온다', kinds.size === 4);
}

// ---- 예고·발사·피해 ----
{
  const g = newGame(1);
  clearRow1(g);
  g.players[0].x = 4; g.players[0].y = 1;
  beginWarning(g, ROW1);
  step(g, secs(1.4));
  t('예고 중에는 피해가 없다', g.players[0].hp === MAX_HP && g.hazard.current.state === 'warn');
  step(g, secs(0.15));
  t('예고 1.5초가 지나면 발사된다', g.hazard.current === null || g.hazard.current.state === 'fly');
  step(g, secs(0.3));
  const p0 = g.players[0], p1 = g.players[1];
  t('줄 위의 닌자는 수리검 피해(반 칸)와 무적 1.5초를 받는다(봉인은 아님)', p0.hp === MAX_HP - SHURIKEN_DAMAGE && p0.state === PlayerState.NORMAL && p0.invincible > 1);
  t('줄 밖의 닌자는 피해가 없다', p1.hp === MAX_HP && p1.invincible === 0);
}
{
  const g = newGame(1);
  clearRow1(g);
  g.players[0].x = 4; g.players[0].y = 1;
  g.players[1].x = 9; g.players[1].y = 1;
  beginWarning(g, ROW1);
  step(g, secs(2.5));
  t('두 닌자에게 똑같이 적용된다', g.players[0].hp === MAX_HP - SHURIKEN_DAMAGE && g.players[1].hp === MAX_HP - SHURIKEN_DAMAGE);
}
{
  const g = newGame(1);
  clearRow1(g);
  g.players[0].x = 4; g.players[0].y = 1;
  g.players[0].invincible = 5;
  beginWarning(g, ROW1);
  step(g, secs(2.5));
  t('무적 중에는 피해가 없다', g.players[0].hp === MAX_HP);
}
{
  const g = newGame(1);
  clearRow1(g);
  g.players[0].x = 4; g.players[0].y = 1;
  g.players[0].hp = 1;
  beginWarning(g, ROW1);
  step(g, secs(2.5));
  t('마지막 체력에서 맞으면 봉인된다', g.players[0].state === PlayerState.SEALED || g.players[0].state === PlayerState.ELIMINATED || g.phase === Phase.RESULT);
}
{
  const g = newGame(1);
  clearRow1(g);
  g.players[0].x = 4; g.players[0].y = 1;
  g.players[0].state = PlayerState.SEALED; g.players[0].sealTimer = 99; g.players[0].hp = 0;
  beginWarning(g, ROW1);
  step(g, secs(2.5));
  t('이미 봉인된 닌자는 추가 피해를 받지 않는다', g.players[0].hp === 0);
}

// ---- 줄 전체 통과(바위·상자에 막히지 않는다) ----
for (const [name, tile] of [['바위', Tile.SOLID], ['상자', Tile.BREAKABLE]]) {
  const g = newGame(1);
  clearRow1(g);
  g.map.grid[1][5] = tile;
  g.players[0].x = 4; g.players[0].y = 1;
  g.players[1].x = 6; g.players[1].y = 1;
  beginWarning(g, ROW1);
  t(`${name}가 있어도 경로는 줄 전체(13칸)다`, pathCells(g.map, ROW1).length === 13);
  step(g, secs(2.5));
  t(`${name} 앞쪽·뒤쪽 닌자가 똑같이 맞는다`, g.players[0].hp === MAX_HP - SHURIKEN_DAMAGE && g.players[1].hp === MAX_HP - SHURIKEN_DAMAGE);
  t(`수리검은 ${name}를 부수지 않는다`, g.map.grid[1][5] === tile);
}
{
  // 바위가 줄지어 있는 짝수 행(y=2)도 처음부터 끝까지 지나간다
  const g = newGame(1);
  clearRow1(g);
  const row2 = { axis: 'row', index: 2, dir: 1 };
  g.map.grid[2][3] = Tile.FLOOR;
  g.players[0].x = 3; g.players[0].y = 2;
  g.players[1].x = 13; g.players[1].y = 2; // 줄의 맨 끝 칸
  g.map.grid[2][13] = Tile.FLOOR;
  beginWarning(g, row2);
  step(g, secs(2.5));
  t('바위가 늘어선 행에서도 줄 양 끝 닌자가 모두 맞는다', pathCells(g.map, row2).length === 13 && g.players[0].hp === MAX_HP - SHURIKEN_DAMAGE && g.players[1].hp === MAX_HP - SHURIKEN_DAMAGE);
}
{
  const g = newGame(1);
  clearRow1(g);
  g.players[0].x = 13; g.players[0].y = 1; // 줄의 맨 끝 칸
  beginWarning(g, ROW1);
  step(g, secs(1.5 + 0.3));
  const early = g.players[0].hp;
  step(g, secs(0.5));
  t('수리검은 날아가는 시간이 있다(끝 칸은 발사 직후가 아니라 조금 뒤에 맞는다)', early === MAX_HP && g.players[0].hp === MAX_HP - SHURIKEN_DAMAGE);
  t('줄 끝까지 가면 사라진다', g.hazard.current === null);
}
{
  const g = newGame(1);
  clearRow1(g);
  const rev = { axis: 'row', index: 1, dir: -1 };
  g.players[0].x = 2; g.players[0].y = 1;
  beginWarning(g, rev);
  t('반대 방향 줄은 오른쪽 끝에서 출발한다', pathCells(g.map, rev)[0].x === 13);
  step(g, secs(2.5));
  t('세로·반대 방향 줄도 같은 규칙(오른쪽에서 출발해 왼쪽 끝 칸까지)', g.players[0].hp === MAX_HP - SHURIKEN_DAMAGE);
  const col = { axis: 'col', index: 1, dir: 1 };
  const cells = pathCells(g.map, col);
  t('세로줄은 위에서 아래로 11칸 전부다', cells.length === 11 && cells.every((c) => c.x === 1) && cells[0].y === 1 && cells[10].y === 11);
}

// ---- 일시정지·카운트다운·재대결·시간 종료 ----
{
  const g = newGame(1);
  g.players.forEach((p) => { p.invincible = 999; });
  step(g, secs(29.9));
  pause(g);
  const tm = g.time;
  for (let i = 0; i < 600; i++) updateGame(g, [NONE, NONE]);
  t('일시정지 중에는 위협 시계가 멈춘다', g.time === tm && g.hazard.current === null && g.hazard.count === 0);
  resume(g);
  g.players.forEach((p) => { p.invincible = 999; });
  step(g, secs(0.3));
  t('재개하면 이어서 30초에 예고가 시작된다', g.hazard.count === 1);
}
{
  const g = createGame(loadMap(MAPS.forest, 1)); // 카운트다운 3초
  for (let i = 0; i < secs(2.9); i++) updateGame(g, [NONE, NONE]);
  t('카운트다운 중에는 위협 시계가 흐르지 않는다', g.time === 0 && g.hazard.count === 0);
}
{
  const g = newGame(1);
  g.players.forEach((p) => { p.invincible = 999; });
  g.hazard.nextAt = 0;     // 지금 바로 나올 차례
  g.timeLeft = STEP / 2;   // 이번 틱이 시간 종료
  step(g, 1);
  t('시간 종료 틱에는 새 예고를 시작하지 않는다', g.hazard.count === 0 && g.phase === Phase.RESULT);
}
{
  const g1 = newGame(1);
  g1.players.forEach((p) => { p.invincible = 999; });
  step(g1, secs(31));
  const g2 = newGame(1);
  t('재대결(새 게임)에서는 위협이 처음 상태로 초기화된다', g1.hazard.count >= 1 && g2.hazard.count === 0 && g2.hazard.current === null && g2.hazard.nextAt === 30);
}
{
  const g = newGame(1);
  const before = g.map.grid.map((r) => r.slice());
  g.players.forEach((p) => { p.invincible = 999; });
  step(g, secs(35));
  t('수리검이 날아가도 바닥 타일은 바뀌지 않는다(상자·바위 유지)', JSON.stringify(before) === JSON.stringify(g.map.grid));
  t('pickLine은 후보가 있으면 줄을 돌려준다', pickLine(g) !== null);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
