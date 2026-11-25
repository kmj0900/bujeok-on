import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { createGame, updateGame, pause, resume } from '../js/game.js';
import { resolveDirection, createInput } from '../js/input.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const keys = { up: 'U', down: 'D', left: 'L', right: 'R' };
const none = { move: null, placeBomb: false };
const mv = (m) => ({ move: m, placeBomb: false });

t('상+하 동시 입력은 상쇄', resolveDirection(new Set(['U', 'D']), keys) === null);
t('좌+우 동시 입력은 상쇄', resolveDirection(new Set(['L', 'R']), keys) === null);
t('대각(위+왼쪽)은 위 우선', resolveDirection(new Set(['U', 'L']), keys) === 'up');
t('대각(아래+오른쪽)은 아래 우선', resolveDirection(new Set(['D', 'R']), keys) === 'down');
t('상+하+왼쪽은 수직 상쇄 후 왼쪽', resolveDirection(new Set(['U', 'D', 'L']), keys) === 'left');

const map = loadMap(MAPS.forest, 12345);
const g = createGame(map, { countdown: 0, hazards: false });
const [p1, p2] = g.players;
t('1P 스폰 (1,1), 2P 스폰 (13,11)', p1.x === 1 && p1.y === 1 && p2.x === 13 && p2.y === 11);
for (let i = 0; i < 60; i++) updateGame(g, [mv('up'), none]);
t('위쪽 외곽 벽 통과 불가', p1.y === 1);
for (let i = 0; i < 60; i++) updateGame(g, [mv('left'), none]);
t('왼쪽 외곽 벽 통과 불가', p1.x === 1);
updateGame(g, [mv('right'), none]);
t('첫 입력 즉시 1칸 이동', p1.x === 2);
let steps = 0;
while (p1.x === 2 && steps < 100) { updateGame(g, [mv('right'), none]); steps++; }
t('다음 이동까지 약 0.16초(9~11스텝)', steps >= 9 && steps <= 11);
p1.x = 2; p1.y = 1; p1.moveCooldown = 0;
updateGame(g, [mv('down'), none]);
t('고정 바위(2,2) 통과 불가', p1.x === 2 && p1.y === 1);
let crate = null;
outer: for (let y = 1; y < 12; y++) for (let x = 1; x < 14; x++) {
  if (map.grid[y][x] === Tile.BREAKABLE && map.grid[y][x - 1] === Tile.FLOOR) { crate = { x, y }; break outer; }
}
p1.x = crate.x - 1; p1.y = crate.y; p1.moveCooldown = 0;
updateGame(g, [mv('right'), none]);
t('상자 통과 불가', p1.x === crate.x - 1);

const g2 = createGame(map, { countdown: 0, hazards: false });
for (let i = 0; i < 20; i++) updateGame(g2, [mv('right'), mv('left')]);
t('1P·2P 동시 독립 이동', g2.players[0].x > 1 && g2.players[1].x < 13);
const g3 = createGame(map, { countdown: 0, hazards: false });
g3.players[1].x = 2; g3.players[1].y = 1;
updateGame(g3, [mv('right'), none]);
t('같은 칸에 두 닌자 가능', g3.players[0].x === 2 && g3.players[1].x === 2);

const g4 = createGame(map, { countdown: 0, hazards: false });
pause(g4);
const t0 = g4.time;
for (let i = 0; i < 30; i++) updateGame(g4, [mv('right'), none]);
t('PAUSED에서 시간·이동 정지', g4.time === t0 && g4.players[0].x === 1);
resume(g4);
updateGame(g4, [mv('right'), none]);
t('재개 후 이동 재개', g4.players[0].x === 2);

const listeners = {};
const target = { addEventListener: (n, f) => (listeners[n] = f), removeEventListener() {} };
const input = createInput(target);
let prevented = 0;
const ev = (code, repeat = false) => ({ code, repeat, preventDefault: () => prevented++ });
listeners.keydown(ev('KeyW')); listeners.keydown(ev('KeyD'));
t('W+D 동시 입력 → 위 우선', input.getAction(0).move === 'up');
listeners.keydown(ev('ArrowLeft'));
t('2P는 독립 입력', input.getAction(1).move === 'left' && input.getAction(0).move === 'up');
listeners.keydown(ev('Space'));
t('Space 최초 keydown 1회만 설치 액션', input.getAction(0).placeBomb === true && input.getAction(0).placeBomb === false);
listeners.keydown(ev('Space', true));
t('키 반복(repeat)은 설치 액션 없음', input.getAction(0).placeBomb === false);
listeners.keydown(ev('Enter'));
t('Enter도 2P 설치 1회', input.getAction(1).placeBomb === true && input.getAction(1).placeBomb === false);
t('게임 키는 preventDefault 호출', prevented >= 5);
const before = prevented; listeners.keydown(ev('KeyZ'));
t('게임 키가 아니면 건드리지 않음', prevented === before);
listeners.keydown(ev('KeyR'));
t('R 키 1회 소비', input.consumeRestart() === true && input.consumeRestart() === false);
input.clear();
t('clear 후 입력 모두 해제', input.getAction(0).move === null && input.getAction(1).move === null);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
