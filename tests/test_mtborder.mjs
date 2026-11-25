// 바위산 외곽 테두리 테스트: node tests/test_mtborder.mjs  (그래픽 전용: 규칙·판정은 바뀌지 않는다)
import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { drawMap, borderPlan } from '../js/renderer.js';
import { createGame, updateGame } from '../js/game.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const W = 15, H = 13;
const fakeImg = (w, h) => ({ complete: true, naturalWidth: w, naturalHeight: h });
const sprites = { tiles: fakeImg(224, 32), tilesWaterfall: fakeImg(320, 32), tilesMountain: fakeImg(224, 32), bordersWaterfall: fakeImg(160, 320), bordersMountain: fakeImg(160, 320) };
const fakeCtx = (log) => new Proxy({}, { get: (_, k) => (k === 'drawImage' ? (...a) => log.push(a) : () => {}), set: () => true });

t('바위산에만 바위산 외곽 설정이 있다', MAPS.mountain.theme.borderStyle?.type === 'mountain' && MAPS.forest.theme.borderStyle === undefined && MAPS.waterfall.theme.borderStyle?.type === 'waterfall');
const m = loadMap(MAPS.mountain, 7);
const plan = borderPlan(m);
const col = (f) => plan.cells.map(f);
const kinds = (arr) => new Set(arr.map((c) => c.col)).size;

t('왼쪽은 자연 암벽 4종이 섞인다(벽돌 반복 없음)', kinds(col((r) => r[0]).slice(1, H - 1)) >= 3 && col((r) => r[0]).slice(1, H - 1).every((c) => c.row === 1));
t('위쪽도 절벽 가장자리 + 반대로 흐르는 구름(여러 변형)', plan.cells[0].slice(1, W - 1).every((c) => c.kind === 'sky' && c.lip.row === 8 && c.clouds.every((k) => k.speed < 0)) && kinds(plan.cells[0].slice(1, W - 1).map((c) => c.lip)) >= 3);
const right = col((r) => r[W - 1]).slice(1, H - 1);
t('오른쪽은 암벽 + 붉은 깃발 2곳 + 석등 1곳', right.filter((c) => c.row === 3 && c.col < 2).length === 2 && right.filter((c) => c.row === 3 && c.col >= 2).length === 1 && right.filter((c) => c.row === 2).length === right.length - 3);
const bottom = plan.cells[H - 1];
t('아래쪽은 절벽 가장자리 + 하늘·구름 층(여러 변형)', bottom.slice(1, W - 1).every((c) => c.kind === 'sky' && c.lip && c.clouds.length === 2) && kinds(bottom.slice(1, W - 1).map((c) => c.lip)) >= 3);
t('모서리 4곳 전용 타일(모두 하늘 위에 겹치는 오버레이)', plan.cells[0][0].over.row === 9 && plan.cells[0][0].over.col === 0 && plan.cells[0][W - 1].over.col === 1 && bottom[0].over.col === 2 && bottom[W - 1].over.col === 3);
const grasses = new Set(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) grasses.add(plan.cells[y][x].grass);
t('바닥 암석이 4종으로 섞이고 폭포용 장식은 없다', grasses.size === 4 && plan.cells[1][6].foam === undefined && plan.cells[5][W - 2].shore === undefined);

t('같은 맵 객체는 계획 불변, 같은 시드는 같고 다른 시드는 달라질 수 있다', borderPlan(m) === plan && JSON.stringify(borderPlan(loadMap(MAPS.mountain, 7)).cells) === JSON.stringify(plan.cells) && JSON.stringify(borderPlan(loadMap(MAPS.mountain, 8)).cells) !== JSON.stringify(plan.cells));

const before = JSON.stringify(m.grid);
const l0 = [], l1 = [];
let ok = true;
try { drawMap(fakeCtx(l0), m, sprites, 0); drawMap(fakeCtx(l1), m, sprites, 1.3); } catch (e) { ok = false; console.log(e); }
t('그려도 오류가 없고 칸 정보는 그대로', ok && JSON.stringify(m.grid) === before && l0.length > 195);
t('시간에 따라 구름이 옆으로 흐른다', JSON.stringify(l0) !== JSON.stringify(l1));
t('외곽 칸은 여전히 이동 불가·폭발 차단(SOLID)', plan.cells.every((r, y) => r.every((c, x) => !(x === 0 || y === 0 || x === W - 1 || y === H - 1) || m.grid[y][x] === Tile.SOLID)));
const lo = []; drawMap(fakeCtx(lo), m, { ...sprites, bordersMountain: { complete: false, naturalWidth: 0 } }, 0);
t('테두리 시트가 없으면 예전 방식으로 대신 그린다', lo.length > 100);
for (const id of ['forest', 'waterfall']) {
  const log = []; let ok2 = true;
  try { drawMap(fakeCtx(log), loadMap(MAPS[id], 3), sprites, 1); } catch (e) { ok2 = false; }
  t(`${id} 맵은 영향이 없다`, ok2 && log.length > 100);
}
{
  const g = createGame(loadMap(MAPS.mountain, 7), { countdown: 0, hazards: false });
  for (let i = 0; i < 60; i++) updateGame(g, [{ move: null, placeBomb: false }, { move: null, placeBomb: false }]);
  t('그래픽 변경 뒤에도 게임이 정상 진행', g.time > 0.9);
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
