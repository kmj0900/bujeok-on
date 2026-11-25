// 맵 로드·검증·타일 판정 (공통 규칙)
export const Tile = Object.freeze({ FLOOR: 0, SOLID: 1, BREAKABLE: 2 });

// 시드 가능한 난수 생성기 (mulberry32)
export function createRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inRange = (def, x, y) => x >= 0 && y >= 0 && x < def.width && y < def.height;
const key = (x, y) => `${x},${y}`;
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function buildSolidCells(def) {
  const cells = [];
  for (let y = 0; y < def.height; y++) {
    for (let x = 0; x < def.width; x++) {
      const border = x === 0 || y === 0 || x === def.width - 1 || y === def.height - 1;
      if (border) cells.push({ x, y });
    }
  }
  if (def.solidCells && def.solidCells.random) {
    // 랜덤 바위: 외곽 벽만 여기서 만들고, 내부 바위는 generate()가 시드로 배치한다
  } else if (def.solidCells === 'default-even-grid') {
    for (let y = 2; y <= def.height - 3; y += 2) {
      for (let x = 2; x <= def.width - 3; x += 2) cells.push({ x, y });
    }
  } else {
    cells.push(...def.solidCells);
  }
  return cells;
}

// 도달 가능한 칸 BFS (FLOOR만 통행)
function reachable(grid, start) {
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (grid[ny]?.[nx] !== Tile.FLOOR || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// 맵 정의 자체 검증. 오류 문자열 배열을 반환(빈 배열이면 통과).
export function validateDefinition(def) {
  const errors = [];
  if (def.width !== 15 || def.height !== 13 || def.tileSize !== 32) errors.push('맵 크기는 15x13, 타일 32px이어야 한다');
  const solid = buildSolidCells(def);
  const solidKeys = new Set();
  for (const c of solid) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || !inRange(def, c.x, c.y)) errors.push(`범위 밖 고정 장애물 (${c.x},${c.y})`);
    solidKeys.add(key(c.x, c.y));
  }
  for (const c of def.safeCells) {
    if (!inRange(def, c.x, c.y)) errors.push(`범위 밖 안전 칸 (${c.x},${c.y})`);
    if (solidKeys.has(key(c.x, c.y))) errors.push(`안전 칸이 고정 장애물과 겹침 (${c.x},${c.y})`);
  }
  for (const s of def.spawnPoints) {
    if (!def.safeCells.some((c) => c.x === s.x && c.y === s.y)) errors.push(`스폰이 안전 칸에 없음 (${s.x},${s.y})`);
  }
  if (def.solidCells && def.solidCells.random && !(Number.isInteger(def.solidCells.count) && def.solidCells.count >= 0)) errors.push('랜덤 바위 개수는 0 이상의 정수여야 한다');
  if (def.hazard) {
    if (!['shuriken', 'current', 'rockfall'].includes(def.hazard.type)) errors.push(`알 수 없는 맵 위협 종류 (${def.hazard.type})`);
    for (const k of ['startDelay', 'interval', 'lateTimeLeft', 'lateInterval', 'warnTime', 'speed', 'flowDuration', 'pushInterval', 'fallTime']) {
      if (def.hazard[k] !== undefined && !(def.hazard[k] > 0)) errors.push(`맵 위협 값은 양수여야 한다 (${k})`);
    }
  }
  if (def.hazard && def.hazard.pushSteps !== undefined) {
    const ps = def.hazard.pushSteps;
    if (!Array.isArray(ps) || !ps.length || ps.some((e) => !Array.isArray(e) || !(e[0] >= 0) || !Number.isInteger(e[1]) || e[1] < 1)) errors.push('pushSteps는 [시작 시간(0 이상), 칸 수(1 이상 정수)] 목록이어야 한다');
  }
  if (def.hazard && def.hazard.rockCounts !== undefined) {
    const rc = def.hazard.rockCounts;
    if (!Array.isArray(rc) || !rc.length || rc.some((e) => !Array.isArray(e) || !(e[0] >= 0) || !Number.isInteger(e[1]) || e[1] < 1)) errors.push('rockCounts는 [시작 시간(0 이상), 돌 개수(1 이상 정수)] 목록이어야 한다');
  }
  return errors;
}

// 생성된 grid 검증: 스폰 출구 2방향 + 접근 가능한 상자
function validateGrid(def, grid) {
  for (const s of def.spawnPoints) {
    const exits = DIRS.filter(([dx, dy]) => grid[s.y + dy]?.[s.x + dx] === Tile.FLOOR).length;
    if (exits < 2) return false;
    const seen = reachable(grid, s);
    let crateReachable = false;
    for (const k of seen) {
      const [x, y] = k.split(',').map(Number);
      if (DIRS.some(([dx, dy]) => grid[y + dy]?.[x + dx] === Tile.BREAKABLE)) { crateReachable = true; break; }
    }
    if (!crateReachable) return false;
  }
  return true;
}

// 랜덤 바위: 180도 회전 대칭(1P·2P 쪽이 같은 모양)으로 count개(짝수로 내림)를 놓는다.
// 시작 안전 칸과 한가운데 칸은 비우고, 바위 아닌 모든 칸이 서로 이어지지 않으면 다시 뽑는다(상자는 부술 수 있으니 통로로 본다).
function placeRandomRocks(def, grid, safe, rng) {
  const W = def.width, H = def.height;
  const pairs = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const mx = W - 1 - x, my = H - 1 - y;
      if (y * W + x >= my * W + mx) continue; // 쌍의 앞쪽 칸만 대표로 (한가운데 칸도 여기서 빠진다)
      if (safe.has(key(x, y)) || safe.has(key(mx, my))) continue;
      pairs.push([{ x, y }, { x: mx, y: my }]);
    }
  }
  const want = Math.floor(def.solidCells.count / 2);
  const spawn = def.spawnPoints[0];
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    const trial = grid.map((row) => row.slice());
    for (const pair of pairs.slice(0, want)) for (const c of pair) trial[c.y][c.x] = Tile.SOLID;
    const seen = reachable(trial, spawn);
    let open = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (trial[y][x] === Tile.FLOOR) open++;
    if (seen.size === open) {
      for (let y = 0; y < H; y++) grid[y] = trial[y];
      return;
    }
  }
  throw new Error('랜덤 바위 배치를 찾지 못했다');
}

function generate(def, seed) {
  const grid = Array.from({ length: def.height }, () => Array(def.width).fill(Tile.FLOOR));
  for (const c of buildSolidCells(def)) grid[c.y][c.x] = Tile.SOLID;

  const safe = new Set(def.safeCells.map((c) => key(c.x, c.y)));
  const rng = createRng(seed);
  if (def.solidCells && def.solidCells.random) placeRandomRocks(def, grid, safe, rng);
  const candidates = [];
  for (let y = 0; y < def.height; y++) {
    for (let x = 0; x < def.width; x++) {
      if (grid[y][x] === Tile.FLOOR && !safe.has(key(x, y))) candidates.push({ x, y });
    }
  }
  // 상자는 후보 칸에만 적용 (전체 칸 수가 아님)
  const crateCount = Math.round(candidates.length * def.crateSpawnRate);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const c of candidates.slice(0, crateCount)) grid[c.y][c.x] = Tile.BREAKABLE;
  return { grid, candidateCount: candidates.length, crateCount };
}

// 검증을 통과할 때까지 시드를 바꿔 재생성한다.
export function loadMap(def, seed = Date.now() >>> 0) {
  const errors = validateDefinition(def);
  if (errors.length) throw new Error('맵 정의 오류: ' + errors.join(' / '));
  for (let attempt = 0; attempt < 50; attempt++) {
    const useSeed = (seed + attempt) >>> 0;
    const result = generate(def, useSeed);
    if (validateGrid(def, result.grid)) return { def, ...result, seed: useSeed };
  }
  throw new Error('유효한 맵 배치를 찾지 못했다');
}

export const tileAt = (map, x, y) => (inRange(map.def, x, y) ? map.grid[y][x] : Tile.SOLID);
