// 폭포 계곡 외곽 테두리 테스트: node tests/test_wfborder.mjs  (그래픽 전용: 규칙·판정은 바뀌지 않는다)
import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';
import { drawMap, waterfallPlan } from '../js/renderer.js';
import { createGame, updateGame } from '../js/game.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const W = 15, H = 13;

const fakeImg = (w, h) => ({ complete: true, naturalWidth: w, naturalHeight: h });
const sprites = { tiles: fakeImg(224, 32), tilesWaterfall: fakeImg(320, 32), tilesMountain: fakeImg(224, 32), bordersWaterfall: fakeImg(160, 320) };
function fakeCtx(log) {
  return new Proxy({}, { get: (_, k) => (k === 'drawImage' ? (...a) => log.push(a) : () => {}), set: () => true });
}

// ---- 설정 분리 ----
t('폭포 계곡은 waterfall 외곽 설정, 깊은 숲은 없음, 바위산은 별도 mountain 설정', MAPS.waterfall.theme.borderStyle?.type === 'waterfall' && !MAPS.forest.theme.borderStyle && MAPS.mountain.theme.borderStyle?.type === 'mountain');
const m = loadMap(MAPS.waterfall, 7);
const plan = waterfallPlan(m);

// ---- 칸 배치 ----
const fallCols = []; for (let x = 0; x < W; x++) if (plan.cells[0][x].kind === 'fall') fallCols.push(x);
t('폭포는 위쪽 테두리 5칸 너비(3~5칸 범위)', fallCols.length === 5 && fallCols[0] === 5 && fallCols[4] === 9, fallCols.join(','));
t('폭포 왼쪽·오른쪽 끝은 가장자리 타일, 가운데는 변형', plan.cells[0][5].col === 0 && plan.cells[0][9].col === 3 && [6, 7, 8].every((x) => [1, 2].includes(plan.cells[0][x].col)));
t('위쪽 나머지는 암벽, 왼쪽은 암벽, 아래쪽은 수풀', plan.cells[0][2].row === 0 && plan.cells[5][0].row === 1 && plan.cells[H - 1][6].row === 2);
t('오른쪽 열은 계곡 물길(모서리 포함)', Array.from({ length: H }, (_, y) => plan.cells[y][W - 1].kind === 'stream').every(Boolean));
t('네 모서리는 전용 타일', plan.cells[0][0].col === 0 && plan.cells[0][0].row === 7 && plan.cells[H - 1][0].col === 2 && plan.cells[0][W - 1].over.col === 1 && plan.cells[H - 1][W - 1].over.col === 3);
const variants = (cells) => new Set(cells.map((c) => c.col)).size;
t('암벽·수풀 타일이 여러 변형으로 섞인다(반복 없음)', variants(plan.cells[0].slice(1, 5).concat(plan.cells[0].slice(10, 14))) >= 3 && variants(plan.cells.slice(1, H - 1).map((r) => r[0])) >= 3 && variants(plan.cells[H - 1].slice(1, W - 1)) >= 3);
const grasses = new Set(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) grasses.add(plan.cells[y][x].grass);
t('풀밭이 4종으로 섞인다', grasses.size === 4);
let foamOk = true, shoreOk = true;
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const c = plan.cells[y][x];
  if ((c.foam !== undefined) !== (y === 1 && x >= 5 && x <= 9)) foamOk = false;
  if ((c.shore !== undefined) !== (x === W - 2)) shoreOk = false;
}
t('물보라는 폭포 아래 5칸에만, 물가 경계는 오른쪽 안쪽 열에만', foamOk && shoreOk);
t('물 속 바위는 일부 칸에만(양 끝 제외)', plan.cells.filter((r) => r[W - 1].rock).length >= 1 && !plan.cells[1][W - 1].rock && !plan.cells[H - 2][W - 1].rock);

// ---- 시드 고정(프레임마다 바뀌지 않음) ----
const m1 = loadMap(MAPS.waterfall, 7), m2 = loadMap(MAPS.waterfall, 8);
t('같은 맵 객체는 계획이 그대로(매 프레임 불변)', waterfallPlan(m) === plan);
t('같은 시드는 같은 계획, 다른 시드는 달라질 수 있다', JSON.stringify(waterfallPlan(m1).cells) === JSON.stringify(plan.cells) && JSON.stringify(waterfallPlan(m2).cells) !== JSON.stringify(plan.cells));

// ---- 그리기: 판정 불변·오류 없음 ----
const before = JSON.stringify(m.grid);
const log0 = [], log1 = [];
let ok = true;
try { drawMap(fakeCtx(log0), m, sprites, 0); drawMap(fakeCtx(log1), m, sprites, 0.5); } catch (e) { ok = false; console.log(e); }
t('외곽 테두리를 그려도 오류가 없고 칸 정보는 그대로', ok && JSON.stringify(m.grid) === before && log0.length > 195);
t('시간에 따라 물길·폭포 그림이 바뀐다(애니메이션)', JSON.stringify(log0) !== JSON.stringify(log1));
t('외곽 칸은 여전히 이동 불가·폭발 차단(SOLID)', plan.cells.every((r, y) => r.every((c, x) => !(x === 0 || y === 0 || x === W - 1 || y === H - 1) || m.grid[y][x] === Tile.SOLID)));
const logOld = []; drawMap(fakeCtx(logOld), m, { ...sprites, bordersWaterfall: { complete: false, naturalWidth: 0 } }, 0);
t('테두리 시트가 없으면 예전 방식으로 대신 그린다', logOld.length > 100);
for (const id of ['forest', 'mountain']) {
  const log = []; let ok2 = true;
  try { drawMap(fakeCtx(log), loadMap(MAPS[id], 3), sprites, 1); } catch (e) { ok2 = false; }
  t(`${id} 맵은 영향이 없다`, ok2 && log.length > 100);
}

// ---- 게임 로직 영향 없음 ----
{
  const g = createGame(loadMap(MAPS.waterfall, 7), { countdown: 0, hazards: false });
  for (let i = 0; i < 60; i++) updateGame(g, [{ move: null, placeBomb: false }, { move: null, placeBomb: false }]);
  t('그래픽 변경 뒤에도 게임이 정상 진행', g.time > 0.9);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
