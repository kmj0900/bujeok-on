// 랜덤 바위 배치 테스트: node tests/test_rocks.mjs
import { MAPS } from '../js/maps.js';
import { loadMap, Tile } from '../js/map.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const W = 15, H = 13;
const innerRocks = (m) => { let n = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (m.grid[y][x] === Tile.SOLID) n++; return n; };

for (const id of ['forest', 'waterfall']) {
  let sym = true, count = true, safe = true, conn = true, spawnExits = true, differ = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const m = loadMap(MAPS[id], seed);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = m.grid[y][x] === Tile.SOLID, b = m.grid[H - 1 - y][W - 1 - x] === Tile.SOLID;
      if (a !== b) sym = false;
    }
    if (innerRocks(m) !== 22) count = false;
    for (const c of MAPS[id].safeCells) if (m.grid[c.y][c.x] !== Tile.FLOOR) safe = false;
    // 바위 아닌 모든 칸이 스폰에서 이어진다(상자는 통로로 본다)
    const seen = new Set(['1,1']); const q = [[1, 1]];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (m.grid[ny]?.[nx] !== undefined && m.grid[ny][nx] !== Tile.SOLID && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
    let open = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (m.grid[y][x] !== Tile.SOLID) open++;
    if (seen.size !== open) conn = false;
    differ.add(m.grid.map((r) => r.join('')).join('|'));
  }
  t(`${id}: 200개 시드 모두 180도 대칭`, sym);
  t(`${id}: 안쪽 바위가 항상 22개`, count);
  t(`${id}: 안전 칸에는 바위·상자가 없음`, safe);
  t(`${id}: 바위 아닌 모든 칸이 서로 이어짐`, conn);
  t(`${id}: 시드마다 배치가 다양함`, differ.size > 150, `${differ.size}/200`);
}
{
  const a = loadMap(MAPS.forest, 7), b = loadMap(MAPS.forest, 7);
  t('같은 시드는 같은 맵', JSON.stringify(a.grid) === JSON.stringify(b.grid));
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
