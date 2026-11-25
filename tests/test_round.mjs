import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { createGame, updateGame, pause, resume, Phase, STEP, ROUND_TIME } from '../js/game.js';
import { PlayerState, MAX_HP, BOMB_DAMAGE, INVINCIBLE_TIME, SEAL_TIME } from '../js/player.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const none = { move: null, placeBomb: false };
const mv = (m) => ({ move: m, placeBomb: false });
const bomb = { move: null, placeBomb: true };
const idle = [none, none];
const run = (g, n, acts = idle) => { for (let i = 0; i < n; i++) updateGame(g, acts); };
const until = (g, pred, max = 2000) => { let i = 0; while (!pred() && i < max) { updateGame(g, idle); i++; } return i; };

function blank() {
  const map = loadMap(MAPS.forest, 1);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
    map.grid[y][x] = (x === 0 || y === 0 || x === 14 || y === 12) ? Tile.SOLID : Tile.FLOOR;
  }
  const g = createGame(map, { countdown: 0, hazards: false });
  g.players[0].x = 5; g.players[0].y = 5;
  g.players[1].x = 11; g.players[1].y = 11;
  return g;
}
const hit = (g, x, y, remaining = 0.4) => g.explosions.push({ ownerId: 0, cells: [{ x, y }], remaining });
const [P1, P2] = [0, 1];

// ---------- 시작 상태·카운트다운
{
  const map = loadMap(MAPS.forest, 1);
  const g = createGame(map, { hazards: false });
  t('체력 최대(4, 하트 2개), 무적·봉인 타이머 0, 정상 상태로 시작', g.players.every((p) => p.hp === MAX_HP && p.invincible === 0 && p.sealTimer === 0 && p.state === PlayerState.NORMAL));
  t('시작 단계는 COUNTDOWN, 제한시간 180초', g.phase === Phase.COUNTDOWN && g.timeLeft === ROUND_TIME && ROUND_TIME === 180);
  run(g, 100, [mv('right'), bomb]);
  t('카운트다운 중에는 이동·설치·라운드 타이머가 진행되지 않음', g.players[0].x === 1 && g.bombs.length === 0 && g.timeLeft === ROUND_TIME && g.time === 0);
  run(g, 90);
  t('약 3초 뒤 PLAYING으로 전환', g.phase === Phase.PLAYING);
  const before = g.timeLeft;
  run(g, 60);
  t('PLAYING에서 1초에 1초씩 감소', Math.abs(before - g.timeLeft - 1) < 1e-6);
}

// ---------- 체력·무적
{
  const g = blank();
  hit(g, 5, 5);
  run(g, 1);
  const p = g.players[P1];
  t('첫 피격: 체력 1, 정상 상태 유지(봉인 아님)', p.hp === MAX_HP - BOMB_DAMAGE && p.state === PlayerState.NORMAL);
  t('첫 피격 후 무적 1.5초', Math.abs(p.invincible - (INVINCIBLE_TIME - STEP)) < 1e-6 && INVINCIBLE_TIME === 1.5);
  run(g, 30); // 같은 폭발(0.4초) 동안 계속 서 있어도 추가 피해 없음
  t('같은 폭발에 연속으로 두 번 맞지 않음', p.hp === MAX_HP - BOMB_DAMAGE && p.state === PlayerState.NORMAL);
  t('무적 시간(1.5)이 폭발 지속(0.4)보다 김', INVINCIBLE_TIME > 0.4);
}
{
  const g = blank();
  hit(g, 5, 5); hit(g, 5, 5); // 같은 칸에 폭발 두 개(연쇄) 겹침
  run(g, 1);
  t('겹친 폭발에도 한 틱 피해는 1회', g.players[P1].hp === MAX_HP - BOMB_DAMAGE);
}
{
  const g = blank();
  hit(g, 5, 5);
  run(g, 1);
  updateGame(g, [mv('right'), none]);
  t('무적 중에도 이동 가능', g.players[P1].x === 6);
  updateGame(g, [bomb, none]);
  t('무적 중에도 부적 설치 가능', g.bombs.length === 1);
}
{
  const g = blank();
  hit(g, 5, 5);
  run(g, 1);
  run(g, 100); // 무적(1.5초=90스텝) 경과
  t('무적 종료', g.players[P1].invincible === 0);
  hit(g, 5, 5);
  run(g, 1);
  t('무적 끝난 뒤 다시 맞으면 체력 0 → 봉인', g.players[P1].hp === 0 && g.players[P1].state === PlayerState.SEALED);
  t('봉인 타이머 2초', SEAL_TIME === 2 && g.players[P1].sealTimer > 1.9);
  const n = until(g, () => g.players[P1].state === PlayerState.ELIMINATED);
  t('봉인 약 2초(115~125스텝) 뒤 탈락', n >= 115 && n <= 125);
}
{
  const g = blank();
  g.players[P1].hp = 1;
  hit(g, 5, 5);
  run(g, 1);
  updateGame(g, [{ move: 'right', placeBomb: true }, none]);
  t('봉인 중 이동·설치 불가', g.players[P1].x === 5 && g.bombs.length === 0);
}

// ---------- 일시정지: 무적·봉인·라운드 시간 정지
{
  const g = blank();
  hit(g, 5, 5); run(g, 1);
  pause(g);
  const s = [g.players[P1].invincible, g.timeLeft];
  run(g, 200);
  t('일시정지 중 무적·라운드 시간 정지', g.players[P1].invincible === s[0] && g.timeLeft === s[1]);
  const g2 = blank();
  g2.players[P1].hp = 1; hit(g2, 5, 5); run(g2, 1);
  pause(g2);
  const st = g2.players[P1].sealTimer;
  run(g2, 200);
  t('일시정지 중 봉인 타이머 정지', g2.players[P1].sealTimer === st && g2.players[P1].state === PlayerState.SEALED);
  resume(g2);
  run(g2, 1);
  t('재개 후 봉인 타이머 진행', g2.players[P1].sealTimer < st);
}

// ---------- 승패 정산
{
  const g = blank();
  g.players[P1].hp = 1; hit(g, 5, 5);
  run(g, 60);
  t('봉인·폭발 진행 중에는 승패를 확정하지 않음', g.phase === Phase.PLAYING && g.players[P1].state === PlayerState.SEALED);
  const n = until(g, () => g.phase === Phase.RESULT);
  t('상대 탈락 확정 후 RESULT, 생존자 승리', g.result.type === 'win' && g.result.winnerId === P2 && g.result.reason === 'elimination');
  t('탈락은 봉인 시간이 끝난 뒤에 확정(약 2초)', n + 60 >= 115);
}
{
  const g = blank();
  g.players.forEach((p) => { p.hp = 1; });
  g.players[P2].x = 5; g.players[P2].y = 5; // 같은 칸
  hit(g, 5, 5);
  run(g, 1);
  until(g, () => g.phase === Phase.RESULT);
  t('같은 폭발에 동시 탈락 → 무승부', g.result.type === 'draw');
}
{
  const g = blank();
  g.players.forEach((p) => { p.hp = 1; });
  hit(g, 5, 5); run(g, 1);        // 1P 봉인
  run(g, 60);
  hit(g, 11, 11); run(g, 1);      // 1초 뒤 2P도 봉인(1P는 아직 봉인 중)
  run(g, 70);                     // 1P 탈락 시점 부근
  t('한 명이 먼저 탈락해도 봉인 중인 상대가 있으면 확정 보류', g.phase === Phase.PLAYING);
  until(g, () => g.phase === Phase.RESULT);
  t('봉인 중 상대도 탈락하면 무승부', g.result.type === 'draw');
}
{
  const g = blank();
  g.players[P1].hp = 1;
  hit(g, 5, 5); run(g, 1);        // 1P 봉인
  run(g, 30);
  hit(g, 11, 11); run(g, 1);      // 2P는 체력 4 → 2, 무적
  until(g, () => g.phase === Phase.RESULT);
  t('봉인 중 2P가 비치명 피격이면 2P 승리', g.result.type === 'win' && g.result.winnerId === P2 && g.players[P2].hp === MAX_HP - BOMB_DAMAGE);
}

// ---------- 시간 종료
const timeoutGame = () => { const g = blank(); g.timeLeft = STEP; return g; };
{
  const g = timeoutGame(); g.players[P1].hp = 2; g.players[P2].hp = 1;
  run(g, 1);
  t('시간 종료: 정상 둘 → 체력 많은 쪽 승리', g.phase === Phase.RESULT && g.result.type === 'win' && g.result.winnerId === P1 && g.result.reason === 'timeout-hp');
}
{
  const g = timeoutGame();
  run(g, 1);
  t('시간 종료: 체력 같으면 무승부', g.result.type === 'draw');
}
{
  const g = timeoutGame(); g.players[P2].state = PlayerState.SEALED; g.players[P2].sealTimer = 1;
  run(g, 1);
  t('시간 종료: 한 명만 봉인 중이면 봉인 안 된 쪽 승리', g.result.type === 'win' && g.result.winnerId === P1 && g.result.reason === 'timeout');
}
{
  const g = timeoutGame();
  g.players.forEach((p) => { p.state = PlayerState.SEALED; p.sealTimer = 1; });
  run(g, 1);
  t('시간 종료: 둘 다 봉인 중이면 무승부', g.result.type === 'draw');
}
{
  const g = timeoutGame();
  g.players[P2].hp = 1;
  g.bombs.push({ id: 1, ownerId: 1, x: 11, y: 11, fuse: 0.001, range: 2 });
  g.nextBombId = 2;
  run(g, 1);
  t('시간 종료 틱의 폭발 피해가 먼저 반영됨', g.players[P2].state === PlayerState.SEALED && g.result.winnerId === P1);
}
{
  const g = timeoutGame();
  updateGame(g, [bomb, none]);
  t('시간 종료 틱에는 새 부적 설치를 받지 않음', g.bombs.length === 0 && g.phase === Phase.RESULT);
}

// ---------- 결과 확정 후
{
  const g = timeoutGame();
  run(g, 1);
  const snap = JSON.stringify([g.players, g.bombs, g.explosions, g.timeLeft]);
  hit(g, 5, 5);
  const snap2 = JSON.stringify(g.players);
  run(g, 100, [mv('right'), bomb]);
  t('결과 확정 뒤 입력·이동·설치·피해 무시', JSON.stringify(g.players) === snap2 && g.bombs.length === 0 && g.phase === Phase.RESULT);
}

// ---------- 재대결 초기화
{
  const map1 = loadMap(MAPS.forest, 1);
  const g1 = createGame(map1, { countdown: 0, hazards: false });
  g1.players[P1].hp = 0; g1.players[P1].state = PlayerState.ELIMINATED;
  g1.bombs.push({ id: 9 }); g1.explosions.push({ cells: [] }); g1.timeLeft = 3; g1.result = { type: 'draw' };
  const map2 = loadMap(MAPS.forest, 2);
  const g2 = createGame(map2, { hazards: false });
  t('새 판은 체력·상태·부적·폭발·타이머·결과가 모두 초기화', g2.players.every((p) => p.hp === MAX_HP && p.state === PlayerState.NORMAL && p.invincible === 0)
    && g2.bombs.length === 0 && g2.explosions.length === 0 && g2.timeLeft === ROUND_TIME && g2.result === null && g2.phase === Phase.COUNTDOWN);
  t('이전 판의 상태 객체를 공유하지 않음', g1.bombs !== g2.bombs && g1.explosions !== g2.explosions && g1.players !== g2.players);
  t('새 맵은 상자가 다시 생성됨', map2.grid.flat().filter((v) => v === Tile.BREAKABLE).length === map2.crateCount && map2.crateCount > 25);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
