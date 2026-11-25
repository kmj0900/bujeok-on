// 온라인 대전용 락스텝 동기화. 네트워크·화면과 무관한 순수 로직이라 Node 테스트에서도 그대로 쓴다.
// 원리: 틱 T의 입력은 T - delay 시점에 미리 잡아 상대에게 보낸다. 두 사람의 틱 T 입력이 모두 있어야만 그 틱을 계산한다.
import { updateGame } from './game.js';

export const NO_ACTION = Object.freeze({ move: null, placeBomb: false, struggle: false });
export const HASH_EVERY = 60; // 이 틱 수마다 상태 해시를 교환한다(1초)

// 상태 해시: 화면 전용(events, popups)과 정적 맵 정의는 제외한다.
export function stateHash(game) {
  const { events, popups, map, ...rest } = game;
  const s = JSON.stringify({ ...rest, grid: map.grid, mapSeed: map.seed });
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const MOVES = new Set(['up', 'down', 'left', 'right']);
// 상대가 보낸 입력은 믿지 않고 형식을 다시 만든다.
export function sanitizeAction(a) {
  return { move: a && MOVES.has(a.move) ? a.move : null, placeBomb: !!(a && a.placeBomb), struggle: !!(a && a.struggle) };
}

// slot: 내 번호(0 또는 1), delay: 입력 지연 틱 수, getLocal(): 이번 틱에 잡을 내 입력
export function createLockstep({ slot, delay = 4 }) {
  const inputs = [new Map(), new Map()];
  for (let t = 0; t < delay; t++) { inputs[0].set(t, NO_ACTION); inputs[1].set(t, NO_ACTION); } // 시작 직후 몇 틱은 빈 입력으로 채운다
  const localHashes = new Map(), remoteHashes = new Map();
  const ls = {
    slot, delay,
    simTick: 0,          // 다음에 계산할 틱
    localTick: delay,    // 다음에 잡을 내 입력의 틱
    stalled: 0,          // 상대 입력을 기다려 멈춘 횟수(진단용)
    desyncTick: null,    // 해시가 달라진 첫 틱(없으면 null)
    outbox: [],          // 서버로 보낼 메시지. 호출한 쪽이 비운다.

    // 상대 입력 수신
    receiveInput(tick, action) {
      if (tick < ls.simTick || inputs[1 - slot].has(tick)) return;
      inputs[1 - slot].set(tick, sanitizeAction(action));
    },
    receiveHash(tick, h) {
      remoteHashes.set(tick, h);
      compare(tick);
    },
    // 가능한 만큼 진행한다. 계산한 틱 수를 돌려준다(maxSteps로 한 프레임에 계산할 틱을 제한).
    pump(game, getLocal, maxSteps = Infinity) {
      let n = 0;
      while (n < maxSteps) {
        if (ls.localTick <= ls.simTick + delay) { // 내 입력은 틱마다 정확히 한 번만 잡는다
          const a = sanitizeAction(getLocal());
          inputs[slot].set(ls.localTick, a);
          ls.outbox.push({ t: 'in', tick: ls.localTick, a });
          ls.localTick++;
        }
        const mine = inputs[slot].get(ls.simTick), theirs = inputs[1 - slot].get(ls.simTick);
        if (!mine || !theirs) { ls.stalled++; break; }
        updateGame(game, slot === 0 ? [mine, theirs] : [theirs, mine]);
        inputs[0].delete(ls.simTick); inputs[1].delete(ls.simTick);
        ls.simTick++; n++;
        if (ls.simTick % HASH_EVERY === 0) {
          const h = stateHash(game);
          localHashes.set(ls.simTick, h);
          ls.outbox.push({ t: 'hash', tick: ls.simTick, h });
          compare(ls.simTick);
        }
      }
      return n;
    },
  };
  function compare(tick) {
    if (!localHashes.has(tick) || !remoteHashes.has(tick)) return;
    if (localHashes.get(tick) !== remoteHashes.get(tick) && ls.desyncTick === null) ls.desyncTick = tick;
    localHashes.delete(tick); remoteHashes.delete(tick);
  }
  return ls;
}
