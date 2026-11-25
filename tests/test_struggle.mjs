import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { createGame, updateGame, Phase } from '../js/game.js';
import { PlayerState, MAX_HP, BOMB_DAMAGE, SHURIKEN_DAMAGE, ESCAPE_HP, STRUGGLE_STEPS, struggleNeeded, STRUGGLE_NEEDED, INVINCIBLE_TIME, SEAL_TIME, damagePlayer } from '../js/player.js';
import { createAI } from '../js/ai.js';
import { visualPos } from '../js/renderer.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const none = { move: null, placeBomb: false };
const press = { move: null, placeBomb: false, struggle: true };
const idle = [none, none];

function blank() {
  const map = loadMap(MAPS.forest, 1);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) map.grid[y][x] = (x === 0 || y === 0 || x === 14 || y === 12) ? Tile.SOLID : Tile.FLOOR;
  const g = createGame(map, { countdown: 0, hazards: false });
  g.players[0].x = 5; g.players[0].y = 5;
  g.players[1].x = 11; g.players[1].y = 11;
  return g;
}
function seal(g, i = 0) { const p = g.players[i]; p.hp = 1; damagePlayer(p); return p; }

// 연타 8회로 탈출: 체력 1, 무적, 정상 상태
{
  const g = blank(); const p = seal(g);
  t('봉인 직후 연타 횟수 0', p.state === PlayerState.SEALED && p.struggle === 0 && STRUGGLE_NEEDED === 8);
  for (let i = 0; i < STRUGGLE_NEEDED - 1; i++) updateGame(g, [press, none]);
  t('7회까지는 아직 봉인', p.state === PlayerState.SEALED && p.struggle === 7);
  updateGame(g, [press, none]);
  t('8회째 탈출: 정상 상태, 체력 1', p.state === PlayerState.NORMAL && p.hp === 1);
  t('탈출 후 무적 시간이 남음', p.invincible > INVINCIBLE_TIME - 0.1);
  t('탈출 후 라운드가 계속됨(승패 확정 안 됨)', g.phase === Phase.PLAYING && g.result === null);
  for (let i = 0; i < 300; i++) updateGame(g, idle);
  t('탈출했으면 봉인 시간이 지나도 탈락하지 않음', p.state === PlayerState.NORMAL);
}
// 누르지 않으면 기존대로 탈락
{
  const g = blank(); const p = seal(g);
  for (let i = 0; i < 130; i++) updateGame(g, idle);
  t('연타 없이는 약 2초 뒤 탈락', p.state === PlayerState.ELIMINATED);
}
// 횟수 부족, 시간 안에 못 채우면 탈락
{
  const g = blank(); const p = seal(g);
  for (let i = 0; i < 5; i++) updateGame(g, [press, none]);
  for (let i = 0; i < 130; i++) updateGame(g, idle);
  t('5회만 누르면 탈출 못 하고 탈락', p.state === PlayerState.ELIMINATED);
}
// 봉인 중 이동은 여전히 불가, 정상 상태 연타는 무시
{
  const g = blank(); const p = seal(g);
  updateGame(g, [{ move: 'right', placeBomb: true, struggle: true }, none]);
  t('봉인 중 이동·설치 불가', p.x === 5 && g.bombs.length === 0);
  const g2 = blank();
  for (let i = 0; i < 20; i++) updateGame(g2, [press, none]);
  t('정상 상태의 연타는 무시', g2.players[0].struggle === 0 && g2.players[0].hp === MAX_HP);
}
// 다시 봉인되면 횟수 초기화
{
  const g = blank(); const p = seal(g);
  for (let i = 0; i < 3; i++) updateGame(g, [press, none]);
  p.state = PlayerState.NORMAL; p.invincible = 0; p.hp = 1; damagePlayer(p);
  t('다시 봉인되면 연타 횟수 초기화', p.struggle === 0 && p.sealTimer === SEAL_TIME);
}
// 일시정지 중에는 연타가 쌓이지 않음(updateGame이 PLAYING일 때만 처리)
{
  const g = blank(); const p = seal(g);
  g.phase = Phase.PAUSED;
  for (let i = 0; i < 10; i++) updateGame(g, [press, none]);
  t('일시정지 중 연타 무시', p.struggle === 0 && p.state === PlayerState.SEALED);
}
// AI도 봉인에서 탈출한다
{
  const g = blank(); const ai = createAI(1, () => 0.5);
  const p = seal(g, 1);
  for (let i = 0; i < 100; i++) updateGame(g, [none, ai.getAction(g, 1 / 60)]);
  t('AI도 연타로 봉인에서 탈출', p.state === PlayerState.NORMAL && p.hp === 1);
}
// 물살 보간: 밀린 직후 이전 칸에서 시작해 0.3초에 걸쳐 등속으로 이동
{
  const g = blank(); const p = g.players[0];
  p.fromX = 5; p.fromY = 5; p.x = 6; p.y = 5; p.slide = p.slideDur = 0.3;
  t('밀린 직후 화면 위치는 이전 칸', Math.abs(visualPos(p).x - 5) < 1e-9);
  p.slide = 0.15;
  t('절반 지나면 중간 위치', Math.abs(visualPos(p).x - 5.5) < 1e-9);
  p.slide = 0;
  t('끝나면 도착 칸', visualPos(p).x === 6);
}

// 체력 4(반 칸 단위): 폭발 -2, 수리검 -1, 탈출 후 1
{
  t('체력 4, 폭발 2·수리검 1', MAX_HP === 4 && BOMB_DAMAGE === 2 && SHURIKEN_DAMAGE === 1 && ESCAPE_HP === 1);
  const g = blank(); const p = g.players[0];
  damagePlayer(p, SHURIKEN_DAMAGE);
  t('수리검 한 방은 체력 3, 봉인 아님', p.hp === 3 && p.state === PlayerState.NORMAL && p.invincible > 0);
  p.invincible = 0; damagePlayer(p, SHURIKEN_DAMAGE); p.invincible = 0; damagePlayer(p, SHURIKEN_DAMAGE); p.invincible = 0;
  t('수리검 세 방이면 체력 1', p.hp === 1 && p.state === PlayerState.NORMAL);
  damagePlayer(p, SHURIKEN_DAMAGE);
  t('수리검 네 방이면 봉인', p.state === PlayerState.SEALED && p.sealCount === 1);
  const g2 = blank(); const q = g2.players[0];
  damagePlayer(q); q.invincible = 0; damagePlayer(q);
  t('폭발 두 방이면 봉인(기존과 같은 밸런스)', q.state === PlayerState.SEALED && q.hp === 0);
}
// 봉인될 때마다 필요한 연타가 늘어난다(8 → 12 → 16)
{
  t('연타 횟수 단계 8·12·16', STRUGGLE_STEPS.join() === '8,12,16');
  const g = blank(); const p = g.players[0];
  const sealAndEscape = (need) => {
    p.hp = 1; p.invincible = 0; damagePlayer(p);
    t(`${p.sealCount}번째 봉인: 필요 ${need}회`, struggleNeeded(p) === need);
    for (let i = 0; i < need - 1; i++) updateGame(g, [press, none]);
    const stillSealed = p.state === PlayerState.SEALED;
    updateGame(g, [press, none]);
    return stillSealed && p.state === PlayerState.NORMAL;
  };
  t('첫 봉인은 8회에 탈출', sealAndEscape(8));
  t('두 번째 봉인은 12회에 탈출', sealAndEscape(12));
  t('세 번째 봉인은 16회에 탈출(이후에도 16회)', sealAndEscape(16));
  p.hp = 1; p.invincible = 0; damagePlayer(p);
  t('네 번째 봉인도 16회', struggleNeeded(p) === 16 && p.sealCount === 4);
}
// 랜덤 바위 배치
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
