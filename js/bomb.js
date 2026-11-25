import { Tile, tileAt } from './map.js';
import { PlayerState, damagePlayer } from './player.js';
import { maybeDrop, destroyItems, revealItems } from './item.js';

export const FUSE_TIME = 2.5;       // 설치 후 폭발까지(초)
export const EXPLOSION_TIME = 0.4;  // 폭발 지속(초)
export const DEFAULT_RANGE = 2;     // 십자 각 방향 칸 수
export const DEFAULT_MAX_BOMBS = 1; // 소유자별 동시 설치 한도

const EPS = 1e-9; // 부동소수점 누적 오차 허용
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const key = (x, y) => `${x},${y}`;

export const bombAt = (game, x, y) => game.bombs.find((b) => b.x === x && b.y === y) ?? null;

// 현재 칸에 부적 설치. 정상 상태 + 한도 미만 + 현재 칸에 부적 없음일 때만 성공.
export function placeBomb(game, player) {
  if (player.state !== PlayerState.NORMAL) return false;
  const active = game.bombs.filter((b) => b.ownerId === player.id).length;
  if (active >= player.maxBombs) return false;
  if (bombAt(game, player.x, player.y)) return false;
  game.bombs.push({ id: game.nextBombId++, ownerId: player.id, x: player.x, y: player.y, fuse: FUSE_TIME, range: player.range });
  return true;
}

// 폭발 범위 계산. 반드시 "틱 시작 시점의 타일 스냅샷"으로 판정한다.
// SOLID: 도달 불가·차단 / BREAKABLE: 그 칸에서 파괴되고 전파 중단 / FLOOR: 통과
export function blastCells(snapshot, bomb) {
  const cells = [{ x: bomb.x, y: bomb.y }];
  const crates = [];
  for (const [dx, dy] of DIRS) {
    for (let i = 1; i <= bomb.range; i++) {
      const x = bomb.x + dx * i, y = bomb.y + dy * i;
      const t = snapshot[y]?.[x] ?? Tile.SOLID;
      if (t === Tile.SOLID) break;
      cells.push({ x, y });
      if (t === Tile.BREAKABLE) { crates.push({ x, y }); break; }
    }
  }
  return { cells, crates };
}

export function activeExplosionKeys(game) {
  const set = new Set();
  for (const ex of game.explosions) for (const c of ex.cells) set.add(key(c.x, c.y));
  return set;
}

// 활성 폭발 칸 위에 있는 정상 상태 플레이어에게 피해를 준다. 두 플레이어에게 동일하게 적용.
// 칸 집합으로 검사하므로 한 틱에 같은 플레이어에게 피해는 한 번만 들어가고, 이후는 무적이 막는다.
function applyExplosionDamage(game) {
  if (!game.explosions.length) return;
  const active = activeExplosionKeys(game);
  for (const p of game.players) {
    if (p.state === PlayerState.NORMAL && active.has(key(p.x, p.y))) damagePlayer(p);
  }
}

export function updateBombs(game, dt) {
  // 1) 기존 폭발 지속시간 감소 및 만료 제거
  for (const ex of game.explosions) ex.remaining -= dt;
  game.explosions = game.explosions.filter((ex) => ex.remaining > EPS);

  // 2) 부적 퓨즈 감소, 만료된 부적 수집
  for (const b of game.bombs) b.fuse -= dt;
  const due = game.bombs.filter((b) => b.fuse <= EPS);

  if (due.length) {
    // 3) 틱 시작 장애물 스냅샷으로 모든 연쇄 폭발 범위 계산
    const snapshot = game.map.grid.map((row) => row.slice());
    const queue = [...due];
    const exploded = new Set();     // 같은 부적을 두 번 터뜨리지 않는다
    const destroyed = new Map();    // 상자 중복 파괴 방지
    const blasted = [];             // 이번 틱 새 폭발이 닿은 모든 칸(아이템 파괴용)
    while (queue.length) {
      const bomb = queue.shift();
      if (exploded.has(bomb.id)) continue;
      exploded.add(bomb.id);
      const { cells, crates } = blastCells(snapshot, bomb);
      game.explosions.push({ ownerId: bomb.ownerId, cells, remaining: EXPLOSION_TIME });
      blasted.push(...cells);
      for (const c of crates) destroyed.set(key(c.x, c.y), c);
      // 폭발에 닿은 다른 부적은 연쇄 폭발
      for (const other of game.bombs) {
        if (!exploded.has(other.id) && cells.some((c) => c.x === other.x && c.y === other.y)) queue.push(other);
      }
    }
    // 4) 일괄 반영: 부적 제거, 상자 파괴
    game.bombs = game.bombs.filter((b) => !exploded.has(b.id));
    for (const c of destroyed.values()) game.map.grid[c.y][c.x] = Tile.FLOOR;
    // 이미 나타나 있던 아이템은 폭발에 사라지고, 이번에 부서진 상자 칸에서는 새 아이템이 (폭발이 끝난 뒤) 나올 수 있다.
    destroyItems(game, blasted);
    for (const c of destroyed.values()) maybeDrop(game, c.x, c.y);
  }
  revealItems(game);

  // 5) 활성 폭발 피해
  applyExplosionDamage(game);
}
