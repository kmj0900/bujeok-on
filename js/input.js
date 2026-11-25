// 키 입력. e.code를 사용하므로 한글 IME 상태에서도 같은 키로 인식한다.
export const CONTROLS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'Space', bombAlt: 'ShiftLeft' }, // 1P (WASD+Space 동시 입력이 키보드에서 씹히는 경우를 위해 왼쪽 Shift도 부적 키)
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', bomb: 'Enter' }, // 2P
];

export const PAUSE_KEY = 'KeyP';
export const ESCAPE_KEY = 'Escape';
export const MUTE_KEY = 'KeyM';   // 소리 켜기/끄기
export const RESTART_KEY = 'KeyR'; // 결과·일시정지 화면의 '다시 시작' 단축키

// 브라우저 기본 동작(스크롤 등)을 막아야 하는 키. 메뉴 조작(W/S/↑/↓/Enter/Space)은 CONTROLS 키와 같다.
const GAME_KEYS = new Set([PAUSE_KEY, ESCAPE_KEY, RESTART_KEY, MUTE_KEY]);
for (const c of CONTROLS) Object.values(c).forEach((k) => GAME_KEYS.add(k));

// 동시 입력 해석: 같은 축 반대 방향은 상쇄, 대각 입력은 위→아래→왼쪽→오른쪽 우선순위로 한 방향만 선택
export function resolveDirection(held, keys) {
  const up = held.has(keys.up), down = held.has(keys.down);
  const left = held.has(keys.left), right = held.has(keys.right);
  const vertical = up !== down ? (up ? 'up' : 'down') : null;
  const horizontal = left !== right ? (left ? 'left' : 'right') : null;
  return vertical ?? horizontal;
}

export function createInput(target = window) {
  const held = new Set();
  const pressedOnce = new Set(); // keydown 최초 1회만 소비되는 키(부적, 일시정지)

  const typing = (e) => e.target && e.target.tagName === 'INPUT'; // 방 코드 입력칸
  function onKeyDown(e) {
    if (typing(e) || !GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (!e.repeat && !held.has(e.code)) pressedOnce.add(e.code);
    held.add(e.code);
  }
  function onKeyUp(e) {
    if (typing(e) || !GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    held.delete(e.code);
  }
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return {
    // 사람과 AI가 같은 형태의 액션을 쓴다: { move, placeBomb }
    getAction(playerIndex) {
      const keys = CONTROLS[playerIndex];
      // struggle: 이동키를 새로 누른 순간(봉인 탈출 연타용). 매 스텝 소비해 오래된 입력이 쌓이지 않게 한다
      let struggle = false;
      for (const k of [keys.up, keys.down, keys.left, keys.right]) if (pressedOnce.delete(k)) struggle = true;
      return { move: resolveDirection(held, keys), placeBomb: [keys.bomb, keys.bombAlt].filter(Boolean).map((k) => pressedOnce.delete(k)).some(Boolean), struggle };
    },
    consumePause() { // P 또는 Esc. 둘 다 눌렸어도 한 번만 인정한다
      const p = pressedOnce.delete(PAUSE_KEY);
      const e = pressedOnce.delete(ESCAPE_KEY);
      return p || e;
    },
    consumeRestart() { return pressedOnce.delete(RESTART_KEY); },
    consume(code) { return pressedOnce.delete(code); }, // 메뉴 조작용: 키를 처음 누른 순간 1회
    clear() { held.clear(); pressedOnce.clear(); },
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      held.clear(); pressedOnce.clear();
    },
  };
}
