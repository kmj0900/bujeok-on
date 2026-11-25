import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { createGame, updateGame, pause, STEP } from '../js/game.js';
import { PlayerState } from '../js/player.js';
import { placeBomb, bombAt, FUSE_TIME, EXPLOSION_TIME } from '../js/bomb.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const none = { move: null, placeBomb: false };
const mv = (m) => ({ move: m, placeBomb: false });
const bomb = { move: null, placeBomb: true };
const idle = [none, none];
const run = (g, steps, acts = idle) => { for (let i = 0; i < steps; i++) updateGame(g, acts); };

// 빈 맵: 외곽만 SOLID, 내부 전부 FLOOR. extra는 {x,y,t} 목록
function blank(extra = []) {
  const map = loadMap(MAPS.forest, 1);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
    map.grid[y][x] = (x === 0 || y === 0 || x === 14 || y === 12) ? Tile.SOLID : Tile.FLOOR;
  }
  for (const e of extra) map.grid[e.y][e.x] = e.t;
  const g = createGame(map, { countdown: 0, hazards: false });
  g.players.forEach((p) => { p.hp = 1; }); // 이 파일의 판정 테스트는 '한 번 맞으면 봉인'을 기준으로 한다(체력 규칙은 test_round.mjs)
  g.players[0].x = 5; g.players[0].y = 5;
  g.players[1].x = 11; g.players[1].y = 11;
  return g;
}
const S = Tile.SOLID, B = Tile.BREAKABLE, F = Tile.FLOOR;
const cellSet = (g) => new Set(g.explosions.flatMap((e) => e.cells.map((c) => c.x + ',' + c.y)));

// ---------- 설치 규칙
{
  const g = blank();
  updateGame(g, [bomb, none]);
  t('부적 설치됨(현재 칸)', g.bombs.length === 1 && g.bombs[0].x === 5 && g.bombs[0].y === 5);
  updateGame(g, [bomb, none]);
  t('동시 설치 한도 1개', g.bombs.length === 1);
  const g2 = blank();
  g2.players[0].maxBombs = 3;
  updateGame(g2, [bomb, none]); updateGame(g2, [bomb, none]);
  t('같은 칸에 중복 설치 불가', g2.bombs.length === 1);
  const g3 = blank();
  g3.players[0].state = PlayerState.SEALED;
  updateGame(g3, [bomb, none]);
  t('봉인 상태에서는 설치 불가', g3.bombs.length === 0);
}

// ---------- 퓨즈·폭발 시간
{
  const g = blank();
  updateGame(g, [bomb, none]);           // 설치(퓨즈 감소 시작은 같은 틱부터)
  run(g, 140);
  t('2.5초 전에는 폭발하지 않음', g.bombs.length === 1 && g.explosions.length === 0);
  run(g, 15);
  t('약 2.5초 뒤 폭발(부적 제거, 폭발 생성)', g.bombs.length === 0 && g.explosions.length === 1);
  // 폭발이 활성인 스텝 수를 직접 센다(이미 7스텝(150~156틱) 진행된 상태)
  let activeSteps = 7;
  while (g.explosions.length && activeSteps < 100) { run(g, 1); if (g.explosions.length) activeSteps++; }
  t('폭발 지속 24스텝(0.4초)', activeSteps === 24);
  t('0.4초 뒤 폭발 사라짐', g.explosions.length === 0);
}

// ---------- 십자 범위와 차단
{
  const g = blank([{ x: 5, y: 3, t: S }, { x: 7, y: 5, t: B }, { x: 3, y: 5, t: B }]);
  g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]); run(g, 155);
  const c = cellSet(g);
  t('중심 칸 포함', c.has('5,5'));
  t('아래 2칸 도달', c.has('5,6') && c.has('5,7') && !c.has('5,8'));
  t('위쪽 SOLID(5,3) 차단: 5,4만 도달', c.has('5,4') && !c.has('5,3') && !c.has('5,2'));
  t('SOLID는 파괴되지 않음', g.map.grid[3][5] === S);
  t('오른쪽 상자(7,5)에서 멈추고 파괴', c.has('6,5') && c.has('7,5') && !c.has('8,5') && g.map.grid[5][7] === F);
  t('왼쪽 상자(3,5)도 파괴, 뒤(2,5)로 전파 안 됨', g.map.grid[5][3] === F && !c.has('2,5'));
}
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]); run(g, 155);
  t('범위 정확히 십자 2칸(9칸)', g.explosions[0].cells.length === 9);
}

// ---------- 연쇄 폭발
{
  // A(5,5)가 먼저 설치되고, B(7,5)는 A 범위 안. B는 나중에 설치되어 아직 퓨즈가 남음.
  const g = blank();
  g.bombs.push({ id: 1, ownerId: 0, x: 5, y: 5, fuse: 0.01, range: 2 });
  g.bombs.push({ id: 2, ownerId: 1, x: 7, y: 5, fuse: 2.0, range: 2 });
  g.bombs.push({ id: 3, ownerId: 1, x: 9, y: 5, fuse: 2.0, range: 2 }); // B의 범위 안 → 2단 연쇄
  g.nextBombId = 4;
  run(g, 2);
  t('연쇄 폭발: 3개 부적 모두 같은 틱에 폭발', g.bombs.length === 0 && g.explosions.length === 3);
  const ids = g.explosions.length;
  run(g, 3);
  t('연쇄 폭발이 중복 실행되지 않음', g.explosions.length === ids);
  t('연쇄로 늘어난 범위(11,5)까지 도달', cellSet(g).has('11,5'));
}

// ---------- 틱 시작 스냅샷: 같은 틱에 파괴된 상자 뒤로 관통 금지
{
  const g = blank([{ x: 6, y: 5, t: B }]);
  // A(5,5) 와 B(7,5) 가 같은 틱에 만료. 사이의 상자(6,5)를 둘 다 때림.
  g.bombs.push({ id: 1, ownerId: 0, x: 5, y: 5, fuse: 0.01, range: 2 });
  g.bombs.push({ id: 2, ownerId: 1, x: 7, y: 5, fuse: 0.01, range: 2 });
  g.nextBombId = 3;
  g.players[0].x = 2; g.players[0].y = 2; g.players[1].x = 11; g.players[1].y = 11;
  run(g, 2);
  const c = cellSet(g);
  t('상자는 한 번만 파괴(바닥으로)', g.map.grid[5][6] === F);
  t('A 폭발이 상자 뒤(7,5 너머)로 관통 안 함: 8,5는 B 범위로만', c.has('7,5') && c.has('8,5') && c.has('9,5'));
  // 위의 8,5·9,5는 B 자신의 범위. 핵심은 A 쪽이 상자에서 멈췄는지 → A 단독 폭발 칸 수 확인
  const exA = g.explosions.find((e) => e.ownerId === 0);
  t('A 폭발은 상자(6,5)에서 멈춤(7,5 미포함)', exA.cells.some((q) => q.x === 6 && q.y === 5) && !exA.cells.some((q) => q.x === 7 && q.y === 5));
}

// ---------- 봉인(피해) 판정
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]);
  run(g, 155);
  t('자기 부적의 중심 칸에 서 있으면 봉인', g.players[0].state === PlayerState.SEALED);
  t('멀리 있는 2P는 정상', g.players[1].state === PlayerState.NORMAL);
}
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5; g.players[1].x = 7; g.players[1].y = 5;
  g.bombs.push({ id: 1, ownerId: 0, x: 6, y: 5, fuse: 0.01, range: 2 });
  g.nextBombId = 2;
  run(g, 2);
  t('같은 폭발이 두 플레이어에게 동일 적용', g.players[0].state === PlayerState.SEALED && g.players[1].state === PlayerState.SEALED);
}
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]);
  run(g, 5, [mv('right'), none]); // 2칸 이상 이동
  run(g, 150);
  t('폭발 칸 범위 밖으로 빠져나가면 안전하지 않음(2칸 이동은 아직 범위 안)', g.players[0].state === PlayerState.SEALED || g.players[0].x - 5 > 2);
}
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]);
  // 오른쪽으로 계속 이동해 범위(2칸) 밖인 x=8까지 이동
  for (let i = 0; i < 80 && g.players[0].x < 8; i++) updateGame(g, [mv('right'), none]);
  t('설치 후 오른쪽으로 3칸 도망', g.players[0].x === 8);
  run(g, 150);
  t('범위 밖에서는 봉인되지 않음', g.players[0].state === PlayerState.NORMAL);
}
{
  const g = blank();
  g.players[1].x = 8; g.players[1].y = 5; g.players[0].x = 5; g.players[0].y = 11;
  g.explosions.push({ ownerId: 0, cells: [{ x: 9, y: 5 }], remaining: 0.4 });
  for (let i = 0; i < 20; i++) updateGame(g, [none, mv('right')]);
  t('활성 폭발 칸에 걸어 들어가면 봉인', g.players[1].state === PlayerState.SEALED);
}
{
  const g = blank();
  g.players[0].state = PlayerState.SEALED; g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [mv('right'), none]);
  t('봉인 상태는 이동 불가', g.players[0].x === 5);
}
{
  // 소유자가 봉인 중일 때(탈락 전) 남은 부적은 정상 폭발한다.
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]);
  g.bombs[0].fuse = 0.5;                      // 곧 폭발
  g.players[0].state = PlayerState.SEALED;    // 소유자 봉인(2초)
  g.players[0].sealTimer = 2;
  g.players[1].x = 6; g.players[1].y = 5;
  run(g, 40);
  t('소유자가 봉인 중이어도 남은 부적은 정상 폭발', g.bombs.length === 0 && g.players[1].state === PlayerState.SEALED);
}

// ---------- 겹침 탈출·재진입
{
  const g = blank();
  g.players[0].x = 5; g.players[0].y = 5; g.players[1].x = 5; g.players[1].y = 5;
  updateGame(g, [bomb, none]);
  updateGame(g, [mv('right'), mv('left')]);
  t('같은 칸의 두 닌자 모두 설치 칸을 빠져나갈 수 있음', g.players[0].x === 6 && g.players[1].x === 4);
  run(g, 12);
  updateGame(g, [mv('left'), mv('right')]);
  t('빠져나간 뒤 두 사람 모두 재진입 불가', g.players[0].x === 6 && g.players[1].x === 4);
}
{
  const g = blank();
  g.players[1].x = 6; g.players[1].y = 5; g.players[0].x = 5; g.players[0].y = 5;
  updateGame(g, [bomb, none]);
  updateGame(g, [none, mv('left')]);
  t('설치 칸에 없던 상대는 부적 칸에 들어갈 수 없음', g.players[1].x === 6);
}

// ---------- 일시정지
{
  const g = blank();
  updateGame(g, [bomb, none]);
  pause(g);
  const f = g.bombs[0].fuse;
  run(g, 200);
  t('일시정지 중 퓨즈가 줄지 않음', g.bombs[0].fuse === f && g.explosions.length === 0);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
