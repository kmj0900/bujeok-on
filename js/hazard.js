// 맵 위협(hazard): 맵이 주기적으로 보내는 위험. 깊은 숲의 수리검, 폭포 계곡의 물살, 바위산의 낙석이 있다.
// 이동·폭발·승패 규칙은 건드리지 않고, 피해는 damagePlayer로만 준다(수리검은 폭발의 절반).
// 위협 시간은 game.time(PLAYING에서만 흐름)을 기준으로 하므로 일시정지에 멈추고, 새 게임에서 초기화된다.
import { createRng } from './map.js';
import { Tile } from './map.js';
import { PlayerState, damagePlayer, canEnter, SHURIKEN_DAMAGE, ROCK_DAMAGE } from './player.js';

const EPS = 1e-6;

// 맵 데이터(def.hazard)에서 빠진 값을 채우는 기본값. 값의 의미는 docs/12_MAP_SCHEMA.md
export const SHURIKEN_DEFAULTS = Object.freeze({
  type: 'shuriken',
  startDelay: 30,     // 시작 후 첫 발생까지(초)
  interval: 30,       // 이후 간격(초)
  lateTimeLeft: 60,   // 남은 시간이 이 값 이하가 되면
  lateInterval: 20,   // 이 간격으로 줄인다
  warnTime: 1.5,      // 예고 시간(초)
  speed: 20,          // 비행 속도(칸/초)
});

// 폭포 계곡의 물살: 예고된 줄 위의 닌자를 흐르는 방향으로 한 칸씩 민다(피해 없음).
export const CURRENT_DEFAULTS = Object.freeze({
  type: 'current',
  startDelay: 20,     // 수리검(30초)보다 조금 자주: 피해가 없고 흐르는 시간이 짧아서
  interval: 20,
  lateTimeLeft: 60,
  lateInterval: 15,
  warnTime: 1.5,
  flowDuration: 2.0,  // 물이 흐르는 시간(초). 흐르는 동안 줄에 닿은 닌자가 밀린다
  pushInterval: 0.3,  // 한 칸 미는 간격(초)
  pushSteps: [[0, 1], [60, 2], [120, 3]], // [경과 시간(초) 이상, 닌자 한 명이 한 번 흐를 때 밀리는 칸 수]
});

// 바위산의 낙석: 바닥 칸 몇 개에 예고가 뜨고, 예고가 끝나면 그 칸에 돌이 떨어져 서 있던 닌자에게 피해를 준다(옆 칸은 안전).
// 떨어진 돌은 장애물로 남지 않고 먼지만 잠깐 일으킨다(fallTime, 화면 전용).
export const ROCKFALL_DEFAULTS = Object.freeze({
  type: 'rockfall',
  startDelay: 25,
  interval: 25,
  lateTimeLeft: 60,
  lateInterval: 15,
  warnTime: 1.5,
  fallTime: 0.4,      // 떨어진 뒤 먼지 연출 시간(초). 이 동안 다음 낙석은 시작하지 않는다
  rockCounts: [[0, 3], [60, 5], [120, 7]], // [경과 시간(초) 이상, 한 번에 떨어지는 돌 개수]
});

// 이 시각(game.time)에 시작하는 낙석의 돌 개수
export function rockCountAt(cfg, time) {
  let n = 1;
  for (const [from, c] of cfg.rockCounts) if (time + EPS >= from) n = c;
  return n;
}

// 이 시각(game.time)에 시작하는 물살이 밀 칸 수
export function pushStepsAt(cfg, time) {
  let steps = 1;
  for (const [from, n] of cfg.pushSteps) if (time + EPS >= from) steps = n;
  return steps;
}

const DEFAULTS = { shuriken: SHURIKEN_DEFAULTS, current: CURRENT_DEFAULTS, rockfall: ROCKFALL_DEFAULTS };

// 줄 = { axis: 'row'|'col', index, dir: 1|-1 }. row는 y=index 가로줄, col은 x=index 세로줄.
// dir 1은 작은 좌표 쪽(왼쪽/위쪽)에서 출발, -1은 큰 좌표 쪽에서 출발한다.
const sameLine = (a, b) => !!a && !!b && a.axis === b.axis && a.index === b.index;

// 줄의 출발 쪽 안쪽 칸부터 반대쪽 안쪽 칸까지 전부(가로 13칸 / 세로 11칸). 수리검은 바위·상자에 막히지 않고 부수지도 않으므로
// 타일 종류와 상관없이 줄 전체가 위험 구역이다.
export function pathCells(map, line) {
  const w = map.def.width, h = map.def.height;
  const horizontal = line.axis === 'row';
  const len = horizontal ? w : h;
  const cells = [];
  for (let i = 1; i <= len - 2; i++) {
    const k = line.dir === 1 ? i : len - 1 - i;
    cells.push({ x: horizontal ? k : line.index, y: horizontal ? line.index : k });
  }
  return cells;
}

// 수리검이 들어오는 바깥 벽 칸(예고 화살표 위치)과 진행 방향 벡터
export function entryInfo(map, line) {
  const horizontal = line.axis === 'row';
  const len = horizontal ? map.def.width : map.def.height;
  const k = line.dir === 1 ? 0 : len - 1;
  return {
    x: horizontal ? k : line.index,
    y: horizontal ? line.index : k,
    dx: horizontal ? line.dir : 0,
    dy: horizontal ? 0 : line.dir,
  };
}

export function createHazard(map, options = {}) {
  const def = map.def.hazard;
  if (options.hazards === false || !def || !DEFAULTS[def.type]) return null;
  const cfg = { ...DEFAULTS[def.type], ...def };
  // options.hazardStart: 첫 발생 시점을 덮어쓴다(개발용 ?hazard=3 바로가기, 테스트용)
  if (options.hazardStart > 0) cfg.startDelay = options.hazardStart;
  return {
    cfg,
    nextAt: (options.startTime ?? 0) + cfg.startDelay, // 다음 예고가 시작되는 game.time(options.startTime: 개발용으로 경과 시간을 앞당긴 판)
    rng: createRng(((map.seed ?? 0) + 29) >>> 0), // 줄 선택용 시드 고정 난수
    current: null,            // 수리검 { line, state: 'warn'|'fly', timer, path, pos, reached } / 물살 { line, state: 'warn'|'flow', timer, path, flowTime, nextPush, steps, duration, budget }
    lastLine: null,           // 직전에 쓴 줄(연속 같은 줄 방지)
    count: 0,                 // 지금까지 시작된 횟수
  };
}

// 이번에 쓸 줄 선택: 가로·세로 모든 내부 줄(방향 포함) 중에서, 직전과 같은 줄은 제외.
export function pickLine(game) {
  const hz = game.hazard;
  const map = game.map;
  const candidates = [];
  const rows = map.def.height - 2, cols = map.def.width - 2;
  for (const axis of ['row', 'col']) {
    const n = axis === 'row' ? rows : cols;
    for (let index = 1; index <= n; index++) {
      for (const dir of [1, -1]) {
        const line = { axis, index, dir };
        if (!sameLine(line, hz.lastLine)) candidates.push(line);
      }
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(hz.rng() * candidates.length)];
}

// 낙석 칸 선택: 안쪽 바닥(FLOOR) 칸 중에서 count개를 서로 다르게 뽑는다(닌자가 선 칸도 후보).
export function pickRockCells(game, count) {
  const hz = game.hazard;
  const map = game.map;
  const cand = [];
  for (let y = 1; y < map.def.height - 1; y++) for (let x = 1; x < map.def.width - 1; x++) if (map.grid[y][x] === Tile.FLOOR) cand.push({ x, y });
  const n = Math.min(count, cand.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(hz.rng() * (cand.length - i));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  return cand.slice(0, n);
}

// 예고 시작. 스케줄러와 테스트가 같이 쓴다(line을 주면 그 줄로, 낙석은 cells 배열을 주면 그 칸들로).
export function beginWarning(game, line) {
  const hz = game.hazard;
  if (!hz) return false;
  if (hz.cfg.type === 'rockfall') {
    const cells = Array.isArray(line) ? line : pickRockCells(game, rockCountAt(hz.cfg, game.time));
    if (!cells.length) return false;
    hz.current = { state: 'warn', timer: hz.cfg.warnTime, cells, fallTime: 0 };
    hz.count += 1;
    game.events.push({ type: 'hazard-warn' });
    return true;
  }
  if (line === undefined) line = pickLine(game);
  if (!line) return false;
  hz.current = { line, state: 'warn', timer: hz.cfg.warnTime, path: null, pos: 0, reached: -1, flowTime: 0, nextPush: 0, steps: 0, duration: 0, budget: {} };
  if (hz.cfg.type === 'current') { // 칸 수는 물살이 시작(예고 시작)되는 경과 시간으로 정해진다. 닌자별 남은 칸은 budget[id]에 둔다
    hz.current.steps = pushStepsAt(hz.cfg, game.time);
    hz.current.duration = hz.cfg.flowDuration;
  }
  hz.lastLine = line;
  hz.count += 1;
  game.events.push({ type: 'hazard-warn' });
  return true;
}

// 물살 시작: 예고했던 줄 전체가 흐름 구역이 된다.
function startFlow(game) {
  const hz = game.hazard;
  const cur = hz.current;
  cur.path = pathCells(game.map, cur.line);
  cur.state = 'flow';
  cur.flowTime = 0;
  cur.nextPush = hz.cfg.pushInterval;
  game.events.push({ type: 'hazard-fire' });
}

// 물살: 줄에 처음 닿은 닌자는 칸 수(steps)만큼 밀릴 권리를 얻고(budget), 0.3초마다 흐르는 방향으로 한 칸씩 밀린다.
// 앞이 막혀(바위·상자·부적·벽) 못 밀리면 칸을 쓰지 않고 다음 틱에 다시 시도한다. 줄 위 정상 상태 닌자만 해당한다.
function onPath(cur, p) { return cur.path.some((c) => c.x === p.x && c.y === p.y); }

function pushPlayers(game, cur) {
  const e = entryInfo(game.map, cur.line);
  for (const p of game.players) {
    if (p.state !== PlayerState.NORMAL || !(cur.budget[p.id] > 0) || !onPath(cur, p)) continue;
    const nx = p.x + e.dx, ny = p.y + e.dy;
    if (!canEnter(game, nx, ny)) continue;
    p.fromX = p.x; p.fromY = p.y;
    p.steps += 1;
    p.x = nx; p.y = ny;
    p.slide = p.slideDur = game.hazard.cfg.pushInterval; // 화면에서 한 칸을 등속으로 미끄러지게(규칙은 그대로)
    cur.budget[p.id] -= 1;
    game.events.push({ type: 'hazard-push', playerId: p.id });
  }
}

function flow(game, dt) {
  const hz = game.hazard;
  const cur = hz.current;
  cur.flowTime += dt;
  for (const p of game.players) { // 줄에 닿은 닌자(흐르는 중에 새로 들어온 경우 포함)는 한 번 흐를 때 한 번만 칸을 받는다
    if (p.state === PlayerState.NORMAL && cur.budget[p.id] === undefined && onPath(cur, p)) cur.budget[p.id] = cur.steps;
  }
  if (cur.flowTime + EPS >= cur.nextPush) {
    pushPlayers(game, cur);
    cur.nextPush += hz.cfg.pushInterval;
  }
  if (cur.flowTime + EPS >= cur.duration) hz.current = null;
}

// 발사: 예고했던 줄 전체를 경로로 확정한다.
function launch(game) {
  const hz = game.hazard;
  const cur = hz.current;
  cur.path = pathCells(game.map, cur.line);
  cur.state = 'fly';
  cur.pos = 0;
  cur.reached = -1;
  game.events.push({ type: 'hazard-fire' });
  if (cur.path.length === 0) hz.current = null;
}

// 비행: 이번 스텝에 새로 지나간 칸마다 그 칸에 있는 정상 상태 플레이어에게 피해를 준다.
function fly(game, dt) {
  const hz = game.hazard;
  const cur = hz.current;
  cur.pos += hz.cfg.speed * dt;
  const last = Math.min(Math.floor(cur.pos + EPS), cur.path.length - 1);
  for (let i = cur.reached + 1; i <= last; i++) {
    const c = cur.path[i];
    for (const p of game.players) {
      if (p.state === PlayerState.NORMAL && p.x === c.x && p.y === c.y && damagePlayer(p, SHURIKEN_DAMAGE)) {
        game.events.push({ type: 'hazard-hit', playerId: p.id });
      }
    }
  }
  cur.reached = Math.max(cur.reached, last);
  if (cur.pos >= cur.path.length) hz.current = null; // 끝(또는 막힌 칸)에 닿아 사라진다
}

// 낙하: 예고했던 칸에 서 있는 정상 상태 닌자에게 피해(무적이면 없음). 이후 fallTime 동안 먼지 연출만 남는다.
function drop(game) {
  const hz = game.hazard;
  const cur = hz.current;
  cur.state = 'fall';
  cur.fallTime = 0;
  game.events.push({ type: 'hazard-fire' });
  for (const c of cur.cells) {
    for (const p of game.players) {
      if (p.state === PlayerState.NORMAL && p.x === c.x && p.y === c.y && damagePlayer(p, ROCK_DAMAGE)) {
        game.events.push({ type: 'hazard-hit', playerId: p.id });
      }
    }
  }
}

// 게임 스텝마다 호출. timeUp 틱에는 새 예고를 시작하지 않는다(진행 중인 것은 마저 처리).
export function updateHazards(game, dt, timeUp = false) {
  const hz = game.hazard;
  if (!hz) return;
  if (hz.current) {
    const cur = hz.current;
    if (cur.state === 'warn') {
      cur.timer -= dt;
      if (cur.timer <= EPS) (hz.cfg.type === 'rockfall' ? drop : hz.cfg.type === 'current' ? startFlow : launch)(game);
    } else if (cur.state === 'fall') {
      cur.fallTime += dt;
      if (cur.fallTime + EPS >= hz.cfg.fallTime) hz.current = null;
    } else if (cur.state === 'flow') {
      flow(game, dt);
    } else {
      fly(game, dt);
    }
    return;
  }
  if (timeUp || game.time + EPS < hz.nextAt) return;
  // 간격은 시작 시점의 남은 시간으로 정한다: 남은 시간이 lateTimeLeft 이하면 더 짧은 간격
  const late = game.timeLeft <= hz.cfg.lateTimeLeft + EPS;
  hz.nextAt += late ? hz.cfg.lateInterval : hz.cfg.interval;
  beginWarning(game);
}
