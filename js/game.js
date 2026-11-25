import { createPlayer, applyAction, tickPlayerTimers, PlayerState } from './player.js';
import { updateBombs } from './bomb.js';
import { createRng } from './map.js';
import { pickupItems, DROP_CHANCE, POPUP_TIME } from './item.js';
import { createHazard, updateHazards } from './hazard.js';

export const Phase = Object.freeze({ MENU: 'MENU', COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING', PAUSED: 'PAUSED', RESULT: 'RESULT' });
export const STEP = 1 / 60;       // 고정 시뮬레이션 스텝
export const ROUND_TIME = 180;    // 라운드 제한시간(초)
export const COUNTDOWN_TIME = 3;  // 시작 카운트다운(초)
const EPS = 1e-9;
const NO_ACTION = Object.freeze({ move: null, placeBomb: false });

// options.countdown: 카운트다운 길이(테스트에서 0을 주면 바로 PLAYING), options.itemDropChance: 상자당 아이템 확률(테스트용 조정),
// options.hazards: false면 맵 위협(수리검)을 끈다(테스트용), options.startTime: 개발용으로 경과 시간을 앞당긴다(?t=100)
export function createGame(map, options = {}) {
  const countdown = options.countdown ?? COUNTDOWN_TIME;
  const [s1, s2] = map.def.spawnPoints;
  return {
    map,
    phase: countdown > 0 ? Phase.COUNTDOWN : Phase.PLAYING, // 메뉴는 Day 6에서 추가
    countdown,
    time: options.startTime ?? 0,                      // 실제로 PLAYING에서 흐른 시간
    timeLeft: ROUND_TIME - (options.startTime ?? 0),
    result: null,            // { type: 'win'|'draw', winnerId, reason }
    bombs: [],
    explosions: [],
    nextBombId: 1,
    items: [],                 // { x, y, type, ready } 바닥의 능력 두루마리
    popups: [],                // 아이템 획득 표시 { playerId, itemType, age } (화면용)
    events: [],                // 소리 등 화면 쪽이 소비하는 이벤트 { type, ... }
    rng: createRng(((map.seed ?? 0) + 13) >>> 0), // 아이템 추첨용 시드 고정 난수
    itemDropChance: options.itemDropChance ?? DROP_CHANCE,
    hazard: createHazard(map, options), // 맵 위협(수리검). 맵에 설정이 없거나 options.hazards가 false면 null
    players: [createPlayer(0, '흑영 닌자', s1, '#33364a', '#ff9a80'), createPlayer(1, '녹림 닌자', s2, '#3f8a49', '#9be88a')], // 색: 도형 대체용 / 글자용
  };
}

const win = (winnerId, reason) => ({ type: 'win', winnerId, reason });
const draw = (reason) => ({ type: 'draw', reason });

// 시간 종료 판정: 그 틱의 피해를 반영한 뒤, NORMAL 상태만 생존으로 본다.
function judgeTimeout(game) {
  const alive = game.players.filter((p) => p.state === PlayerState.NORMAL);
  if (alive.length === 0) return draw('timeout-none');
  if (alive.length === 1) return win(alive[0].id, 'timeout');
  const [a, b] = alive;
  if (a.hp === b.hp) return draw('timeout-hp');
  return win(a.hp > b.hp ? a.id : b.id, 'timeout-hp');
}

// 일괄 정산: 활성 폭발이 모두 끝나고 봉인 중인 플레이어가 없을 때만 확정한다.
function judgeSettlement(game) {
  if (game.explosions.length > 0) return null;
  if (game.players.some((p) => p.state === PlayerState.SEALED)) return null;
  const alive = game.players.filter((p) => p.state === PlayerState.NORMAL);
  if (alive.length === 2) return null;
  if (alive.length === 1) return win(alive[0].id, 'elimination');
  return draw('elimination');
}

// 고정 스텝 1회 갱신. actions[i]는 i번 플레이어의 액션.
// 순서: 입력/이동/설치 → 부적·폭발·피해 → 맵 위협(수리검) → 아이템 줍기 → 무적·봉인 타이머 → 승패 판정
export function updateGame(game, actions, dt = STEP) {
  if (game.phase === Phase.COUNTDOWN) {
    game.countdown -= dt;
    if (game.countdown <= EPS) { game.countdown = 0; game.phase = Phase.PLAYING; }
    return; // 카운트다운 중에는 이동·설치·타이머가 진행되지 않는다
  }
  if (game.phase !== Phase.PLAYING) return;

  game.time += dt;
  game.timeLeft = Math.max(0, game.timeLeft - dt);
  const timeUp = game.timeLeft <= EPS;

  // 시간 종료 틱에는 새 입력·설치를 받지 않는다(폭발 피해는 이 틱까지 반영).
  game.players.forEach((p, i) => applyAction(p, timeUp ? NO_ACTION : actions[i], game, dt));
  updateBombs(game, dt);
  updateHazards(game, dt, timeUp);
  pickupItems(game);
  game.popups = game.popups.filter((pp) => (pp.age += dt) < POPUP_TIME);
  game.players.forEach((p) => tickPlayerTimers(p, dt));

  const result = timeUp ? judgeTimeout(game) : judgeSettlement(game);
  if (result) { game.result = result; game.phase = Phase.RESULT; }
}

export function pause(game) { if (game.phase === Phase.PLAYING) game.phase = Phase.PAUSED; }
export function resume(game) { if (game.phase === Phase.PAUSED) game.phase = Phase.PLAYING; }
