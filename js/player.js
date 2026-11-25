import { Tile, tileAt } from './map.js';
import { placeBomb, bombAt, DEFAULT_RANGE, DEFAULT_MAX_BOMBS } from './bomb.js';

export const MOVE_COOLDOWN = 0.16;   // 초/칸
export const MAX_HP = 4;             // 시작 체력(하트 4개, 칸당 1)
export const BOMB_DAMAGE = 2;        // 폭발 피해(하트 2개)
export const SHURIKEN_DAMAGE = 1;    // 수리검 피해(하트 1개)
export const ROCK_DAMAGE = 1;        // 낙석 피해(하트 1개)
export const ESCAPE_HP = 1;          // 봉인 탈출 후 체력(하트 1개)
export const INVINCIBLE_TIME = 1.5;  // 피격 후 무적(폭발 지속 0.4초보다 길어야 한다)
export const SEAL_TIME = 2.0;        // 체력 0 이후 봉인 시간
export const STRUGGLE_STEPS = [8, 12, 16]; // 봉인 탈출에 필요한 연타 횟수: 첫 봉인 8회, 두 번째 12회, 세 번째 이후 16회
export const STRUGGLE_NEEDED = STRUGGLE_STEPS[0];
export const struggleNeeded = (player) => STRUGGLE_STEPS[Math.min(Math.max(player.sealCount, 1), STRUGGLE_STEPS.length) - 1];
const EPS = 1e-9;

export const PlayerState = Object.freeze({ NORMAL: 'NORMAL', SEALED: 'SEALED', ELIMINATED: 'ELIMINATED' });

const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function createPlayer(id, name, spawn, color, uiColor = color) {
  return {
    id, name, color, uiColor, // color: 도형 대체 그림, uiColor: 결과 화면 등 글자색
    x: spawn.x, y: spawn.y, facing: 'down',
    fromX: spawn.x, fromY: spawn.y, steps: 0, // 화면 보간·걷기 모션용(판정에는 쓰지 않는다)
    speedLevel: 0, moveInterval: MOVE_COOLDOWN, // 경공술 단계와 한 칸 이동 시간(초)
    moveCooldown: 0, state: PlayerState.NORMAL,
    hp: MAX_HP, invincible: 0, sealTimer: 0, struggle: 0, sealCount: 0, // struggle: 봉인 탈출 연타 횟수, sealCount: 이번 판에서 봉인된 횟수
    slide: 0, slideDur: 0.3, // 물살에 밀릴 때 화면 보간 타이머(판정에는 쓰지 않는다)
    range: DEFAULT_RANGE, maxBombs: DEFAULT_MAX_BOMBS,
  };
}

// 통행 판정: 타일이 FLOOR이고 부적이 없어야 한다.
// 부적이 있는 칸으로는 들어갈 수 없으므로, 설치 칸에 겹쳐 있던 사람은 빠져나갈 수만 있고 재진입은 불가하다.
export function canEnter(game, x, y) {
  return tileAt(game.map, x, y) === Tile.FLOOR && !bombAt(game, x, y);
}

// 피해 1회 적용(기본은 폭발 피해). 정상 상태이고 무적이 아닐 때만 체력이 깎인다.
// 체력이 남으면 무적, 0 이하가 되면 봉인(2초 안에 연타하지 못하면 탈락).
export function damagePlayer(player, amount = BOMB_DAMAGE) {
  if (player.state !== PlayerState.NORMAL || player.invincible > EPS) return false;
  player.hp -= amount;
  if (player.hp <= 0) {
    player.hp = 0;
    player.state = PlayerState.SEALED;
    player.sealTimer = SEAL_TIME;
    player.struggle = 0;
    player.sealCount += 1;
  } else {
    player.invincible = INVINCIBLE_TIME;
  }
  return true;
}

// 무적·봉인 타이머. 게임 스텝으로만 감소한다.
export function tickPlayerTimers(player, dt) {
  if (player.invincible > 0) player.invincible = Math.max(0, player.invincible - dt);
  if (player.slide > 0) player.slide = Math.max(0, player.slide - dt);
  if (player.state === PlayerState.SEALED) {
    player.sealTimer -= dt;
    if (player.sealTimer <= EPS) {
      player.sealTimer = 0;
      player.state = PlayerState.ELIMINATED;
    }
  }
}

// 사람과 AI가 공통으로 쓰는 행동 API. action = { move: 'up'|'down'|'left'|'right'|null, placeBomb: boolean }
export function applyAction(player, action, game, dt) {
  player.moveCooldown = Math.max(0, player.moveCooldown - dt);
  if (player.state === PlayerState.SEALED) { // 봉인 중: 이동키를 새로 누를 때마다 한 번씩 발버둥, 횟수를 채우면 탈출
    if (action.struggle) {
      player.struggle += 1;
      if (player.struggle >= struggleNeeded(player)) {
        player.state = PlayerState.NORMAL;
        player.hp = ESCAPE_HP;
        player.invincible = INVINCIBLE_TIME;
        player.sealTimer = 0;
        player.struggle = 0;
        player.moveCooldown = 0;
      }
    }
    return;
  }
  if (player.state !== PlayerState.NORMAL) return;
  if (action.move) {
    player.facing = action.move;
    if (player.moveCooldown <= 0) {
      const [dx, dy] = DELTA[action.move];
      const nx = player.x + dx, ny = player.y + dy;
      if (canEnter(game, nx, ny)) {
        player.fromX = player.x;
        player.fromY = player.y;
        player.steps += 1;
        player.x = nx;
        player.y = ny;
        player.moveCooldown = player.moveInterval;
      }
    }
  }
  if (action.placeBomb) placeBomb(game, player);
}
