// 능력 두루마리(아이템) 3종: 경공술(이동 속도) / 화약 강화(폭발 범위) / 부적 두루마리(동시 설치 수).
// 규칙은 docs/01_GAME_DESIGN.md 8장과 docs/10_DECISION_LOG.md 참고.
import { PlayerState } from './player.js';

export const ItemType = Object.freeze({ SPEED: 'speed', RANGE: 'range', BOMB: 'bomb' });
export const DROP_CHANCE = 0.35; // 상자 하나가 파괴될 때 아이템이 나올 확률
export const WEIGHTS = Object.freeze([[ItemType.SPEED, 35], [ItemType.RANGE, 35], [ItemType.BOMB, 30]]);

export const SPEED_INTERVALS = Object.freeze([0.16, 0.14, 0.12, 0.10]); // 경공술 단계별 초/칸
export const MAX_SPEED_LEVEL = SPEED_INTERVALS.length - 1;               // 3회 강화
export const MAX_RANGE = 5;
export const MAX_BOMBS = 4;
export const POPUP_TIME = 1.0; // 획득 표시가 머리 위에 떠 있는 시간(초)

const key = (x, y) => `${x},${y}`;

// 이 플레이어가 그 아이템으로 더 강해질 수 있는가(최대치면 false)
export function canUpgrade(p, type) {
  if (type === ItemType.SPEED) return p.speedLevel < MAX_SPEED_LEVEL;
  if (type === ItemType.RANGE) return p.range < MAX_RANGE;
  if (type === ItemType.BOMB) return p.maxBombs < MAX_BOMBS;
  return false;
}

export function applyItem(p, type) {
  if (!canUpgrade(p, type)) return false;
  if (type === ItemType.SPEED) { p.speedLevel += 1; p.moveInterval = SPEED_INTERVALS[p.speedLevel]; }
  else if (type === ItemType.RANGE) p.range += 1;
  else p.maxBombs += 1;
  return true;
}

// 상자 한 칸이 파괴됐을 때 아이템을 만들지 결정한다. game.rng(시드 고정)만 사용한다.
// 정상 상태 플레이어 중 누군가 아직 강화할 수 있는 종류에서만 가중치로 뽑는다(최대치 종류는 제외, 모두 최대면 나오지 않음).
export function maybeDrop(game, x, y) {
  if (game.rng() >= game.itemDropChance) return null;
  const alive = game.players.filter((p) => p.state === PlayerState.NORMAL);
  const pool = WEIGHTS.filter(([type]) => alive.some((p) => canUpgrade(p, type)));
  if (!pool.length) return null;
  let r = game.rng() * pool.reduce((s, [, w]) => s + w, 0);
  let type = pool[pool.length - 1][0];
  for (const [t, w] of pool) { if (r < w) { type = t; break; } r -= w; }
  // 폭발이 끝난 뒤에 나타난다(ready=false인 동안은 보이지 않고, 줍거나 폭발에 사라지지 않는다).
  const item = { x, y, type, ready: false };
  game.items.push(item);
  return item;
}

// 새 폭발이 닿은 칸의 (이미 나타나 있던) 아이템은 사라진다.
export function destroyItems(game, cells) {
  const hit = new Set(cells.map((c) => key(c.x, c.y)));
  game.items = game.items.filter((it) => !(it.ready && hit.has(key(it.x, it.y))));
}

// 그 칸에 활성 폭발이 없으면 아이템이 나타난다.
export function revealItems(game) {
  if (!game.items.some((it) => !it.ready)) return;
  const active = new Set();
  for (const ex of game.explosions) for (const c of ex.cells) active.add(key(c.x, c.y));
  for (const it of game.items) if (!it.ready && !active.has(key(it.x, it.y))) it.ready = true;
}

// 정상 상태 플레이어가 아이템 칸에 있으면 습득한다. 같은 칸에 둘이 있으면 번호가 빠른 쪽이 먼저(강화할 수 있을 때만).
// 이미 최대치인 종류는 주울 수 없고 칸에 남는다.
export function pickupItems(game) {
  if (!game.items.length) return;
  game.items = game.items.filter((it) => {
    if (!it.ready) return true;
    for (const p of game.players) {
      if (p.state !== PlayerState.NORMAL || p.x !== it.x || p.y !== it.y) continue;
      if (applyItem(p, it.type)) {
        game.popups.push({ playerId: p.id, itemType: it.type, age: 0 });   // 머리 위 표시(화면용)
        game.events.push({ type: 'pickup', itemType: it.type, playerId: p.id }); // 효과음용(소비되면 비워진다)
        return false;
      }
    }
    return true;
  });
}
