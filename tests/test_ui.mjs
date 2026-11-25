// 화면 배치·선택·마우스 좌표 변환 등 순수 함수 테스트(Node 실행: node tests/test_ui.mjs)
import { SCREENS, MAP_CHOICES, BUTTON, wrapIndex, layoutButtons, screenRects, hitTest, toCanvasPoint } from '../js/ui.js';
import { createInput } from '../js/input.js';
import { MAPS } from '../js/maps.js';
import { loadMap } from '../js/map.js';
import { createGame } from '../js/game.js';
import { drawMap, tileSheet } from '../js/renderer.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  통과:', name); } else { fail++; console.log('  실패:', name); }
}

console.log('선택 순환');
check('아래로 마지막→처음', wrapIndex(2, 1, 3) === 0);
check('위로 처음→마지막', wrapIndex(0, -1, 3) === 2);
check('버튼 1개면 항상 0', wrapIndex(0, 1, 1) === 0 && wrapIndex(0, -1, 1) === 0);

console.log('버튼 배치');
for (const name of Object.keys(SCREENS)) {
  const rects = screenRects(name);
  check(`${name}: 버튼 수 일치`, rects.length === SCREENS[name].items.length);
  check(`${name}: 모두 캔버스(480x416) 안`, rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 480 && r.y + r.h <= 416));
  check(`${name}: 서로 겹치지 않음`, rects.every((r, i) => i === 0 || r.y >= rects[i - 1].y + rects[i - 1].h));
  check(`${name}: 가로 중앙`, rects.every((r) => r.x * 2 + r.w === 480));
}
check('layoutButtons 간격', layoutButtons(2, 100)[1].y === 100 + BUTTON.h + BUTTON.gap);

console.log('맵 선택 화면');
check('맵 선택 버튼 = 맵 목록 + 뒤로', SCREENS.map.items.length === MAP_CHOICES.length + 1 && SCREENS.map.items[MAP_CHOICES.length] === '뒤로');
check('선택 가능한 맵 id가 모두 maps.js에 있고 서로 다르다', MAP_CHOICES.every((m) => MAPS[m.id]) && new Set(MAP_CHOICES.map((m) => m.id)).size === MAP_CHOICES.length);
check('완성된 맵(깊은 숲·폭포 계곡)은 모두 선택 가능', Object.keys(MAPS).every((id) => MAP_CHOICES.some((m) => m.id === id)));
check('맵마다 위협 설명 문구가 있다', MAP_CHOICES.every((m) => m.label && m.hint));

console.log('대결 방식 화면(AI 난이도)');
check('대결 방식: 로컬·AI 쉬움·AI 보통·뒤로 4개', SCREENS.mode.items.length === 4 && SCREENS.mode.items[0].includes('로컬') && SCREENS.mode.items[1].includes('쉬움') && SCREENS.mode.items[2].includes('보통') && SCREENS.mode.items[3] === '뒤로');
check('대결 방식 마지막 버튼 아래에 안내 문구(y=358) 자리가 있다', screenRects('mode').at(-1).y + BUTTON.h < 358);

console.log('온라인 결과·다음 수련 화면');
check('온라인 결과: 다시 대결·메인 화면 2개', SCREENS.resultOnline.items.length === 2 && SCREENS.resultOnline.items[0] === '다시 대결' && SCREENS.resultOnline.items[1] === '메인 화면');
check('방장 화면: 맵 바꾸기·준비 완료·방 나가기', SCREENS.rematchHost.items.length === 3 && SCREENS.rematchHost.items[0] === '맵 바꾸기' && SCREENS.rematchHost.items[1] === '준비 완료' && SCREENS.rematchHost.items.at(-1) === '방 나가기');
check('입장자 화면: 준비 완료·방 나가기(맵 바꾸기 없음)', SCREENS.rematchGuest.items.length === 2 && SCREENS.rematchGuest.items[0] === '준비 완료' && !SCREENS.rematchGuest.items.includes('맵 바꾸기'));
check('다음 수련 화면의 버튼은 안내 문구(y=252) 아래에 있다', screenRects('rematchHost')[0].y >= 260 && screenRects('rematchGuest')[0].y >= 260);

console.log('맵별 타일 시트');
const fakeImg = (name) => ({ name, complete: true, naturalWidth: 320 });
const sprites = { tiles: fakeImg('forest'), tilesWaterfall: fakeImg('waterfall') };
const used = new Set();
const rec = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? (img) => used.add(img.name) : () => {}), set: () => true });
check('폭포 계곡은 전용 시트를 고른다', tileSheet(loadMap(MAPS.waterfall, 1), sprites).name === 'waterfall');
check('깊은 숲은 기본 시트를 고른다', tileSheet(loadMap(MAPS.forest, 1), sprites).name === 'forest');
drawMap(rec, loadMap(MAPS.waterfall, 1), sprites);
check('폭포 계곡을 그릴 때 숲 시트는 쓰지 않는다', used.has('waterfall') && !used.has('forest'));
used.clear();
drawMap(rec, loadMap(MAPS.forest, 1), sprites);
check('깊은 숲을 그릴 때 폭포 시트는 쓰지 않는다', used.has('forest') && !used.has('waterfall'));
const png = readFileSync(new URL('../assets/sprites/tiles_waterfall.png', import.meta.url));
check('tiles_waterfall.png가 있고 10칸(320x32) PNG다', png.readUInt32BE(16) === 320 && png.readUInt32BE(20) === 32);

console.log('충돌 판정');
const rects = screenRects('mode');
check('버튼 중앙은 해당 번호', rects.every((r, i) => hitTest(rects, r.x + r.w / 2, r.y + r.h / 2) === i));
check('버튼 사이 틈은 -1', hitTest(rects, rects[0].x + 10, rects[0].y + rects[0].h + BUTTON.gap / 2) === -1);
check('바깥은 -1', hitTest(rects, 0, 0) === -1);
check('경계(좌상단)는 포함', hitTest(rects, rects[1].x, rects[1].y) === 1);

console.log('마우스 좌표 변환(CSS 확대)');
const box = { left: 100, top: 50, width: 720, height: 624 }; // 480x416을 1.5배로 표시
const p = toCanvasPoint(box, 480, 416, 100 + 360, 50 + 312);
check('화면 중앙 → 캔버스 중앙', Math.abs(p.x - 240) < 1e-9 && Math.abs(p.y - 208) < 1e-9);
const q = toCanvasPoint(box, 480, 416, 100, 50);
check('좌상단 → (0,0)', q.x === 0 && q.y === 0);

console.log('메뉴 키 입력(consume)');
const listeners = {};
const target = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {} };
const input = createInput(target);
const key = (code, repeat = false) => listeners.keydown({ code, repeat, preventDefault() {} });
key('ArrowDown');
check('처음 누른 키는 1회 소비', input.consume('ArrowDown') === true && input.consume('ArrowDown') === false);
key('Enter'); key('Enter', true);
check('키 반복(repeat)은 추가 입력이 아님', input.consume('Enter') === true && input.consume('Enter') === false);
key('Escape');
check('Esc는 일시정지로 인정', input.consumePause() === true && input.consumePause() === false);
key('KeyP');
check('P도 일시정지', input.consumePause() === true);
key('KeyW'); input.clear();
check('clear하면 남은 입력 제거', input.consume('KeyW') === false);

console.log('캐릭터 이름');
const g = createGame(loadMap(MAPS.forest, 1), { countdown: 0, hazards: false });
check('1P는 흑영, 2P는 녹림', g.players[0].name === '흑영 닌자' && g.players[1].name === '녹림 닌자');
check('글자색(uiColor)이 서로 다름', g.players[0].uiColor && g.players[1].uiColor && g.players[0].uiColor !== g.players[1].uiColor);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
