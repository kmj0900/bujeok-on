// 규칙 기반 AI. 외부 API·모델 없이 브라우저 안에서만 동작한다.
// 사람과 같은 행동 API({ move, placeBomb })만 생성하며, 좌표·부적을 직접 바꾸지 않는다.
import { Tile } from './map.js';
import { Phase } from './game.js';
import { MOVE_COOLDOWN, PlayerState } from './player.js';
import { FUSE_TIME, EXPLOSION_TIME, blastCells, bombAt } from './bomb.js';
import { pathCells } from './hazard.js';

const DECISION_INTERVAL = 0.2; // 일반 재판단 주기(초). 새 부적·폭발이 생기면 즉시 재판단
const MARGIN = 0.15;           // 폭발 시각 앞뒤 안전 여유(초)
const LAG = 0.05;              // 설치 직후 첫 이동까지의 반응 지연 여유(초)
const MAX_ESCAPE_CHECKS = 10;  // 한 번의 판단에서 탈출 시뮬레이션을 해 볼 후보 수
const NO_ACTION = Object.freeze({ move: null, placeBomb: false });
const STRUGGLE_INTERVAL = 0.14; // AI 봉인 탈출 연타 간격(초). 8·12회는 봉인 시간(2초) 안에 풀리지만 16회(세 번째 봉인)는 못 푼다
const DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

// 난이도. normal은 기존 동작 그대로다. easy는 판단이 느리고, 안전할 때 가끔 멈추고, 상대 공격보다 상자 부수기를 우선하고,
// 폭발 회피 여유가 작고, 봉인 탈출 연타가 느리다(8회는 풀고 12회부터는 못 푼다). 새 위험이 생기면 easy도 즉시 다시 판단한다.
export const AI_LEVELS = Object.freeze({
  normal: Object.freeze({ decisionInterval: DECISION_INTERVAL, margin: MARGIN, enemyScore: 60, struggleInterval: STRUGGLE_INTERVAL, idleChance: 0, idleMin: 0, idleMax: 0 }),
  easy: Object.freeze({ decisionInterval: 0.5, margin: 0.05, enemyScore: 20, struggleInterval: 0.22, idleChance: 0.3, idleMin: 0.3, idleMax: 0.8 }),
});

const key = (x, y) => y * 32 + x;

// ---------- 위험 지도 ----------
// 칸별 위험 구간 [시작, 끝] 목록(현재 시각 0 기준). 연쇄 폭발은 먼저 터지는 시각으로 전파한다.
export function buildDanger(game, extraBombs = []) {
  const bombs = [...game.bombs, ...extraBombs].map((b) => ({ x: b.x, y: b.y, range: b.range, t: b.fuse }));
  const blasts = bombs.map((b) => blastCells(game.map.grid, b).cells);
  let changed = true;
  for (let guard = 0; changed && guard < bombs.length + 2; guard++) {
    changed = false;
    for (let i = 0; i < bombs.length; i++) {
      for (let j = 0; j < bombs.length; j++) {
        if (i === j || bombs[i].t >= bombs[j].t - 1e-9) continue;
        if (blasts[i].some((c) => c.x === bombs[j].x && c.y === bombs[j].y)) { bombs[j].t = bombs[i].t; changed = true; }
      }
    }
  }
  const danger = new Map();
  const add = (c, from, to) => {
    const k = key(c.x, c.y);
    if (!danger.has(k)) danger.set(k, []);
    danger.get(k).push([from, to]);
  };
  bombs.forEach((b, i) => blasts[i].forEach((c) => add(c, b.t, b.t + EXPLOSION_TIME)));
  for (const ex of game.explosions) for (const c of ex.cells) add(c, 0, ex.remaining);
  addHazardDanger(game, add);
  return danger;
}

// 수리검: 예고된 줄 전체가 위험 구역이다. i번째 칸은 수리검이 그 칸에 닿는 순간 피해를 주므로
// [닿는 시각, 닿는 시각 + 1칸 통과 시간] 을 위험 구간으로 넣는다(여유 MARGIN은 unsafe에서 더해진다).
// 예고 중이면 발사(남은 예고 시간) 후, 비행 중이면 아직 안 지나간 칸만(이미 지난 칸은 안전).
// 물살(폭포 계곡)은 피해가 없지만 밀려서 폭발에 들어가는 일을 막으려고 같은 방식으로 피한다: 예고 끝부터 흐르는 시간 동안 줄 전체가 위험 구간이다.
function addHazardDanger(game, add) {
  const hz = game.hazard;
  const cur = hz && hz.current;
  if (!cur) return;
  if (hz.cfg.type === 'rockfall') { // 낙석: 예고된 칸이 돌이 떨어지는 순간(예고 끝)에 위험하다. 떨어진 뒤에는 위험이 없다
    if (cur.state === 'warn') cur.cells.forEach((c) => add(c, cur.timer, cur.timer + 0.1));
    return;
  }
  if (hz.cfg.type === 'current') {
    const from = cur.state === 'warn' ? cur.timer : 0;
    const to = cur.state === 'warn' ? cur.timer + cur.duration : Math.max(0, cur.duration - cur.flowTime);
    pathCells(game.map, cur.line).forEach((c) => add(c, from, to));
    return;
  }
  const speed = hz.cfg.speed;
  if (cur.state === 'warn') {
    pathCells(game.map, cur.line).forEach((c, i) => add(c, cur.timer + i / speed, cur.timer + (i + 1) / speed));
  } else {
    cur.path.forEach((c, i) => { if (i > cur.reached) add(c, Math.max(0, (i - cur.pos) / speed), Math.max(0, (i + 1 - cur.pos) / speed)); });
  }
}

// [from, to) 동안 그 칸에 머무르면 위험한가
function unsafe(danger, x, y, from, to, margin = MARGIN) {
  const list = danger.get(key(x, y));
  if (!list) return false;
  for (const [ts, te] of list) if (from < te + margin && to > ts - margin) return true;
  return false;
}

// ---------- 시간을 고려한 탐색 ----------
// 격자 BFS. 노드 = 칸, arrive = 그 칸에 도착하는 시각, leave = 다음 칸으로 떠나는 시각.
// pass: 떠날 때까지 안전 / rest: 도착 후 계속 머물러도 안전(목적지 후보)
function search(game, sx, sy, arrive0, leave0, danger, extraBlocked, rng, step = MOVE_COOLDOWN, margin = MARGIN) {
  const grid = game.map.grid;
  const blocked = new Set(game.bombs.map((b) => key(b.x, b.y)));
  if (extraBlocked) extraBlocked.forEach((k) => blocked.add(k));
  const nodes = new Map();
  const mk = (x, y, k, arrive, leave, parent) => {
    const n = { x, y, k, arrive, leave, parent };
    n.pass = !unsafe(danger, x, y, arrive, leave, margin);
    n.rest = !unsafe(danger, x, y, arrive, Infinity, margin);
    return n;
  };
  const start = mk(sx, sy, 0, arrive0, leave0, null);
  nodes.set(key(sx, sy), start);
  const queue = [start];
  const order = DIRS.slice();
  while (queue.length) {
    const n = queue.shift();
    if (n.k > 0 && !n.pass) continue; // 안전하게 떠날 수 없는 칸에서는 더 가지 않는다(시작 칸은 예외)
    for (let i = order.length - 1; i > 0; i--) { // 같은 거리 후보 사이의 편향 제거
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const [, dx, dy] of order) {
      const nx = n.x + dx, ny = n.y + dy, k = key(nx, ny);
      if (grid[ny]?.[nx] !== Tile.FLOOR || blocked.has(k) || nodes.has(k)) continue;
      const arrive = n.leave;
      const node = mk(nx, ny, n.k + 1, arrive, arrive + step, n);
      nodes.set(k, node);
      if (node.pass) queue.push(node);
    }
  }
  return nodes;
}

function pathTo(node) {
  const cells = [];
  for (let n = node; n && n.parent; n = n.parent) cells.push({ x: n.x, y: n.y });
  return cells.reverse();
}

// ---------- 부적 설치 가치 ----------
function gain(game, x, y, range, enemy, enemyScore = 60) {
  let crates = 0, hitsEnemy = enemy.state === PlayerState.NORMAL && enemy.x === x && enemy.y === y;
  for (const [, dx, dy] of DIRS) {
    for (let i = 1; i <= range; i++) {
      const cx = x + dx * i, cy = y + dy * i;
      const t = game.map.grid[cy]?.[cx] ?? Tile.SOLID;
      if (t === Tile.SOLID) break;
      if (enemy.state === PlayerState.NORMAL && enemy.x === cx && enemy.y === cy) hitsEnemy = true;
      if (t === Tile.BREAKABLE) { crates++; break; }
    }
  }
  return crates * 10 + (hitsEnemy ? enemyScore : 0);
}

// 그 칸에 부적을 놓았을 때(도착 시각 T) 탈출할 수 있는가
function hasEscape(game, node, me, cooldown, rng, margin = MARGIN) {
  const step = me.moveInterval ?? MOVE_COOLDOWN;
  const T = node.arrive;
  const hyp = { x: node.x, y: node.y, range: me.range, fuse: T + FUSE_TIME };
  const danger = buildDanger(game, [hyp]);
  const leave = (node.k === 0 ? cooldown : step) + T + LAG;
  const nodes = search(game, node.x, node.y, T, leave, danger, new Set([key(node.x, node.y)]), rng, step, margin);
  for (const n of nodes.values()) if (n.k > 0 && n.rest) return true;
  return false;
}

const dirName = (dx, dy) => (dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right');

export function createAI(playerId, rng = Math.random, level = 'normal') {
  const lvl = AI_LEVELS[level] ?? AI_LEVELS.normal;
  let idleTimer = 0; // easy: 멈춰 있을 남은 시간
  let path = [];
  let timer = 0;
  let sig = '';
  let placeNow = false;
  let struggleTimer = 0;

  // 새 부적·폭발, 수리검 예고·발사가 생기면 즉시 재판단한다
  const signature = (game) => `${game.nextBombId}:${game.bombs.length}:${game.explosions.length}:${game.hazard ? game.hazard.count : 0}:${game.hazard?.current?.state ?? ''}`;

  function decide(game) {
    const me = game.players[playerId];
    const enemy = game.players[1 - playerId];
    const cd = me.moveCooldown;
    const danger = buildDanger(game);
    const nodes = search(game, me.x, me.y, 0, cd, danger, null, rng, me.moveInterval ?? MOVE_COOLDOWN, lvl.margin);
    const here = nodes.get(key(me.x, me.y));
    const all = [...nodes.values()];
    placeNow = false;

    // 1) 위험하면 가장 가까운 안전한 칸으로 탈출(도착 시각에도 안전한 칸만)
    if (!here.rest) {
      const safe = all.filter((n) => n.k > 0 && n.rest).sort((a, b) => a.k - b.k)[0];
      if (safe) { path = pathTo(safe); return; }
      // 안전한 칸이 없으면 다음 위험이 가장 늦게 오는 칸으로 최선을 다해 이동
      const next = (n) => Math.min(Infinity, ...(danger.get(key(n.x, n.y)) ?? []).filter(([, te]) => te + lvl.margin > n.arrive).map(([ts]) => ts));
      const best = all.filter((n) => n.k > 0 && n.pass).sort((a, b) => next(b) - next(a))[0];
      path = best ? pathTo(best) : [];
      return;
    }

    // 쉬움: 안전할 때 가끔 멈춘다(새 위험이 생기면 getAction에서 즉시 풀린다)
    if (lvl.idleChance > 0 && rng() < lvl.idleChance) {
      idleTimer = lvl.idleMin + rng() * (lvl.idleMax - lvl.idleMin);
      path = [];
      return;
    }

    // 2) 안전하면 상자·상대를 노릴 부적 설치 지점을 고른다(설치 후 탈출 가능한 곳만)
    const owned = game.bombs.filter((b) => b.ownerId === playerId).length;
    const canBomb = me.state === PlayerState.NORMAL && owned < me.maxBombs;
    const candidates = all
      .filter((n) => n.rest && !bombAt(game, n.x, n.y))
      .map((n) => ({ n, g: gain(game, n.x, n.y, me.range, enemy, lvl.enemyScore) }))
      .filter((c) => c.g > 0)
      .map((c) => ({ n: c.n, score: c.g - c.n.k * 0.5 + rng() * 2 })) // 가까울수록, 가치가 클수록 우선
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ESCAPE_CHECKS);
    for (const { n } of candidates) {
      if (!hasEscape(game, n, me, cd, rng, lvl.margin)) continue;
      if (n.k === 0) { path = []; placeNow = canBomb; return; }
      path = pathTo(n);
      return;
    }

    // 3) 노릴 곳이 없으면 상대 쪽으로 접근(안전한 칸만)
    const dist = (n) => Math.abs(n.x - enemy.x) + Math.abs(n.y - enemy.y);
    const near = all.filter((n) => n.rest).sort((a, b) => dist(a) - dist(b) || a.k - b.k)[0];
    path = near && near !== here && dist(near) < dist(here) ? pathTo(near) : [];
  }

  return {
    // 매 스텝 호출. 사람과 같은 형태의 액션을 반환한다.
    getAction(game, dt) {
      const me = game.players[playerId];
      if (game.phase === Phase.PLAYING && me.state === PlayerState.SEALED) { // 봉인되면 사람처럼 이동키를 연타해 탈출을 시도한다
        path = []; placeNow = false;
        struggleTimer -= dt;
        if (struggleTimer <= 0) { struggleTimer = lvl.struggleInterval; return { move: null, placeBomb: false, struggle: true }; }
        return NO_ACTION;
      }
      struggleTimer = 0;
      if (game.phase !== Phase.PLAYING || me.state !== PlayerState.NORMAL) { path = []; placeNow = false; idleTimer = 0; return NO_ACTION; }

      timer -= dt;
      const s = signature(game);
      if (idleTimer > 0 && s === sig) { idleTimer -= dt; return NO_ACTION; } // 멈춰 있는 동안(새 부적·폭발·위협이 생기면 풀린다)
      if (timer <= 0 || s !== sig) {
        idleTimer = 0;
        sig = s;
        timer = lvl.decisionInterval;
        decide(game);
      }

      if (placeNow) { // 설치 직후에는 즉시 재판단해서 바로 탈출한다
        placeNow = false;
        timer = 0;
        return { move: null, placeBomb: true };
      }
      while (path.length && path[0].x === me.x && path[0].y === me.y) path.shift();
      if (!path.length) return NO_ACTION;
      const dx = path[0].x - me.x, dy = path[0].y - me.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) { path = []; timer = 0; return NO_ACTION; } // 경로 이탈 → 재탐색
      return { move: dirName(dx, dy), placeBomb: false };
    },
  };
}
