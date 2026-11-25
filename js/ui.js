// 화면(메인·모드 선택·일시정지·결과) 구성과 그리기. 순수 함수(배치·충돌 판정)는 Node 테스트로 검증한다.
import { dim } from './renderer.js';
import { ready, drawCell, TILE_CELL, NINJA_ROW, CELL } from './sprites.js';

const FONT = '"Malgun Gothic", sans-serif';
export const BUTTON = Object.freeze({ w: 190, h: 36, gap: 12 });

// 선택할 수 있는 맵(maps.js의 id). 맵이 늘면 여기에 한 줄 추가한다(버튼 4개 이상이면 SCREENS.map.top을 올려 맞춘다).
export const MAP_CHOICES = Object.freeze([
  { id: 'forest', label: '깊은 숲', hint: '위협: 수리검 — 예고된 줄 전체를 날아간다' },
  { id: 'waterfall', label: '폭포 계곡', hint: '위협: 물살 — 줄 위의 닌자를 밀어낸다' },
  { id: 'mountain', label: '바위산', hint: '위협: 낙석 — 그림자가 진 칸에 돌이 떨어진다' },
]);

// 화면별 버튼 목록과 첫 버튼의 y좌표(캔버스 논리 좌표, 480x416)
export const SCREENS = Object.freeze({
  menu: { items: ['게임 시작', '온라인 대전'], top: 206 },
  online: { items: ['방 만들기', '방 입장', '뒤로'], top: 170 },
  lobby: { items: ['방 나가기'], top: 300 },
  join: { items: ['뒤로'], top: 330 },
  notice: { items: ['메인 화면'], top: 270 },
  resultOnline: { items: ['다시 대결', '메인 화면'], top: 240 },
  rematchHost: { items: ['맵 바꾸기', '준비 완료', '방 나가기'], top: 266 },
  rematchGuest: { items: ['준비 완료', '방 나가기'], top: 266 },
  map: { items: [...MAP_CHOICES.map((m) => m.label), '뒤로'], top: 154 }, // 버튼 4개(맵 3 + 뒤로)에 맞춰 올렸다
  mode: { items: ['로컬 2인 대전', 'AI 대전 · 쉬움', 'AI 대전 · 보통', '뒤로'], top: 154 }, // 버튼 4개에 맞춰 올렸다
  pause: { items: ['계속하기', '다시 시작', '메인 화면'], top: 178 },
  result: { items: ['다시 대결', '메인 화면'], top: 240 },
});

// ---------- 순수 함수 ----------

// 목록 선택 이동(끝에서 반대편으로 순환)
export function wrapIndex(index, delta, count) {
  return (((index + delta) % count) + count) % count;
}

// 버튼 배치: 가로 중앙, 위에서부터 세로로 나열
export function layoutButtons(count, top, canvasWidth = 480, size = BUTTON) {
  const x = Math.round((canvasWidth - size.w) / 2);
  return Array.from({ length: count }, (_, i) => ({ x, y: top + i * (size.h + size.gap), w: size.w, h: size.h }));
}

export function screenRects(name, canvasWidth = 480) {
  const s = SCREENS[name];
  return layoutButtons(s.items.length, s.top, canvasWidth);
}

// 점이 속한 버튼 번호(없으면 -1)
export function hitTest(rects, x, y) {
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

// 화면 좌표 → 캔버스 논리 좌표(CSS 확대·테두리 보정)
export function toCanvasPoint(box, canvasW, canvasH, clientX, clientY) {
  return { x: ((clientX - box.left) * canvasW) / box.width, y: ((clientY - box.top) * canvasH) / box.height };
}

// ---------- 그리기 ----------

function label(ctx, str, x, y, size, color = '#f2e9d0', outline = '#1d1208') {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = outline;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// 숲 배경(타일 시트가 없으면 단색)
function backdrop(ctx, sprites, darken = 0.35) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const t = sprites && sprites.tiles;
  if (ready(t)) {
    for (let y = 0; y < H / CELL; y++) {
      for (let x = 0; x < W / CELL; x++) {
        const edge = x === 0 || y === 0 || x === W / CELL - 1 || y === Math.floor(H / CELL) - 1;
        const cell = edge ? TILE_CELL.treeA + ((x * 7 + y * 13) % 3) : ((x + y) % 2 ? TILE_CELL.grassA : TILE_CELL.grassB);
        drawCell(ctx, t, cell, 0, x * CELL, y * CELL);
      }
    }
  } else {
    ctx.fillStyle = '#2f5a35';
    ctx.fillRect(0, 0, W, H);
  }
  dim(ctx, darken);
}

// 나무판자 버튼
function woodButton(ctx, r, text, selected) {
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = selected ? '#c98b43' : '#8a5a2b';
  ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.fillStyle = selected ? '#e8b76a' : '#a8723a';
  ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 4);                 // 윗면 하이라이트
  ctx.fillStyle = selected ? '#a86f2e' : '#6e4620';
  ctx.fillRect(r.x + 2, r.y + r.h - 6, r.w - 4, 4);           // 아랫면 그림자
  ctx.fillStyle = selected ? 'rgba(122, 74, 28, 0.45)' : 'rgba(58, 34, 14, 0.45)';
  for (const gy of [Math.round(r.h * 0.42), Math.round(r.h * 0.66)]) ctx.fillRect(r.x + 8, r.y + gy, r.w - 16, 1); // 나뭇결
  if (selected) {
    ctx.strokeStyle = '#ffd45a';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
  label(ctx, text, r.x + r.w / 2, r.y + r.h / 2 + 7, 18, selected ? '#fff4c2' : '#f2e9d0');
  if (selected) {
    label(ctx, '▶', r.x - 16, r.y + r.h / 2 + 6, 15, '#ffd45a');
    label(ctx, '◀', r.x + r.w + 16, r.y + r.h / 2 + 6, 15, '#ffd45a');
  }
}

function drawButtons(ctx, name, index) {
  const rects = screenRects(name, ctx.canvas.width);
  SCREENS[name].items.forEach((text, i) => woodButton(ctx, rects[i], text, i === index));
}

// 닌자를 확대해서 그린다(메인 화면 장식)
function bigNinja(ctx, sheet, row, x, y, scale) {
  if (!ready(sheet)) return;
  ctx.drawImage(sheet, 0, row * CELL, CELL, CELL, x, y, CELL * scale, CELL * scale);
}

function woodBoard(ctx, x, y, w, h) {
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#6e4620';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
}

export function drawMainMenu(ctx, sprites, index) {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.4);
  label(ctx, '부적소동', W / 2, 96, 48, '#fff0b8');
  label(ctx, '비밀 수련장', W / 2, 132, 22, '#ffd45a');
  bigNinja(ctx, sprites && sprites.ninja[0], NINJA_ROW.right, 22, 180, 3);
  bigNinja(ctx, sprites && sprites.ninja[1], NINJA_ROW.left, W - 22 - CELL * 3, 180, 3);
  drawButtons(ctx, 'menu', index);
  woodBoard(ctx, 34, 314, W - 68, 66);
  label(ctx, '1P 흑영: W A S D 이동 · Space/Shift 부적', W / 2, 338, 13, '#f2e9d0', '#3a220e');
  label(ctx, '2P 녹림: 방향키 이동 · Enter 부적', W / 2, 357, 13, '#f2e9d0', '#3a220e');
  label(ctx, 'P / Esc 일시정지 · 부적으로 상대를 봉인하라!', W / 2, 373, 11, '#ffe9a8', '#3a220e');
}

export function drawMapMenu(ctx, sprites, index) {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.45);
  label(ctx, '수련장 선택', W / 2, 108, 34, '#fff0b8');
  label(ctx, '어디서 겨룰까?', W / 2, 138, 14, '#f2e9d0');
  drawButtons(ctx, 'map', index);
  const hint = MAP_CHOICES[index] ? MAP_CHOICES[index].hint : '';
  if (hint) label(ctx, hint, W / 2, 360, 14, '#ffe9a8');
  label(ctx, '↑ ↓ 선택 · Enter 확인 · Esc 뒤로', W / 2, 392, 12, '#bdb59c');
}

const MODE_HINT = ['한 키보드로 둘이서 대결', '흑영(컴퓨터) · 느긋한 AI (처음이라면)', '흑영(컴퓨터) · 빠르고 공격적인 AI', ''];

export function drawModeMenu(ctx, sprites, index, mapName = '') {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.45);
  label(ctx, '대결 방식', W / 2, 108, 34, '#fff0b8');
  label(ctx, mapName ? `${mapName} · 누구와 겨룰까?` : '누구와 겨룰까?', W / 2, 138, 14, '#f2e9d0');
  drawButtons(ctx, 'mode', index);
  if (MODE_HINT[index]) label(ctx, MODE_HINT[index], W / 2, 358, 14, '#ffe9a8');
  label(ctx, '↑ ↓ 선택 · Enter 확인 · Esc 뒤로', W / 2, 392, 12, '#bdb59c');
}

export function drawPauseMenu(ctx, index) {
  dim(ctx, 0.62);
  label(ctx, '일시정지', ctx.canvas.width / 2, 138, 34, '#fff0b8');
  drawButtons(ctx, 'pause', index);
}

const REASON_TEXT = {
  elimination: '상대가 탈락했다',
  timeout: '시간 종료',
  'timeout-hp': '시간 종료 · 체력 비교',
  'timeout-none': '시간 종료',
};

export function drawResultScreen(ctx, game, index, screen = 'result') {
  const W = ctx.canvas.width;
  const r = game.result;
  dim(ctx, 0.7);
  if (r.type === 'win') {
    const winner = game.players[r.winnerId];
    label(ctx, `${winner.name} 승리!`, W / 2, 148, 34, winner.uiColor ?? winner.color);
    label(ctx, `이번 수련의 승자는 ${winner.name}!`, W / 2, 182, 16);
  } else {
    label(ctx, '이번 수련은 무승부!', W / 2, 160, 32);
  }
  label(ctx, REASON_TEXT[r.reason] ?? '', W / 2, 214, 13, '#bdb59c');
  drawButtons(ctx, screen, index);
  if (screen === 'result') label(ctx, 'R 키로도 다시 대결', W / 2, 372, 12, '#bdb59c');
}

// ---------- 온라인 대전 화면 ----------

export function drawOnlineMenu(ctx, sprites, index) {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.45);
  label(ctx, '온라인 대전', W / 2, 108, 34, '#fff0b8');
  label(ctx, '방 코드로 친구와 1:1 대결', W / 2, 138, 14, '#f2e9d0');
  drawButtons(ctx, 'online', index);
  const hint = ['수련장을 골라 방을 만들고 코드를 알려 준다', '친구가 알려 준 4글자 코드로 들어간다', ''][index];
  if (hint) label(ctx, hint, W / 2, 330, 14, '#ffe9a8');
  label(ctx, '↑ ↓ 선택 · Enter 확인 · Esc 뒤로', W / 2, 392, 12, '#bdb59c');
}

// info: { code, text }
export function drawLobby(ctx, sprites, index, info) {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.45);
  label(ctx, '대기실', W / 2, 100, 34, '#fff0b8');
  woodBoard(ctx, 120, 130, W - 240, 90);
  label(ctx, '방 코드', W / 2, 160, 14, '#ffe9a8', '#3a220e');
  label(ctx, info.code || '····', W / 2, 205, 44, '#fff4c2', '#3a220e');
  label(ctx, info.text || '', W / 2, 246, 15, '#f2e9d0');
  if (info.who === 0 || info.who === 1) label(ctx, info.who === 0 ? '흑영 닌자' : '녹림 닌자', W / 2, 280, 20, info.who === 0 ? '#ff9a80' : '#9be88a');
  drawButtons(ctx, 'lobby', index);
}

export function drawJoin(ctx, sprites, index, text = '') {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.45);
  label(ctx, '방 입장', W / 2, 108, 34, '#fff0b8');
  label(ctx, '친구가 알려 준 4글자 코드를 아래 칸에 쓰고 Enter', W / 2, 150, 14, '#f2e9d0');
  if (text) label(ctx, text, W / 2, 282, 16, '#ffe9a8');
  drawButtons(ctx, 'join', index);
}

export function drawNotice(ctx, sprites, index, text) {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.55);
  label(ctx, '알림', W / 2, 130, 34, '#fff0b8');
  label(ctx, text || '', W / 2, 200, 17, '#f2e9d0');
  drawButtons(ctx, 'notice', index);
}

// 상대 입력이 늦어 게임이 멈춰 있을 때 위에 덮는 표시
export function drawWaiting(ctx) {
  const W = ctx.canvas.width;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, W, 34);
  label(ctx, '상대를 기다리는 중...', W / 2, 24, 16, '#ffe9a8');
}

// 온라인 결과: 다시 대결(같은 방에서 계속) 또는 메인 화면
export function drawOnlineResult(ctx, game, index) {
  drawResultScreen(ctx, game, index, 'resultOnline');
}

// 결과 뒤 '다음 판 준비' 화면. info: { isHost, mapName, myReady, peerReady, note }
export function drawRematch(ctx, sprites, index, info) {
  const W = ctx.canvas.width;
  backdrop(ctx, sprites, 0.45);
  label(ctx, '다음 수련', W / 2, 78, 32, '#fff0b8');
  woodBoard(ctx, 100, 94, W - 200, 84);
  label(ctx, '다음 수련장', W / 2, 120, 14, '#ffe9a8', '#3a220e');
  label(ctx, info.mapName || '', W / 2, 160, 28, '#fff4c2', '#3a220e');
  label(ctx, `나: ${info.myReady ? '준비 완료' : '아직 준비 안 됨'}`, W / 2, 202, 14, info.myReady ? '#9be88a' : '#f2e9d0');
  label(ctx, `상대: ${info.peerReady ? '준비 완료' : '아직 준비 안 됨'}`, W / 2, 224, 14, info.peerReady ? '#9be88a' : '#f2e9d0');
  if (info.note) label(ctx, info.note, W / 2, 252, 13, '#ffe9a8');
  drawButtons(ctx, info.isHost ? 'rematchHost' : 'rematchGuest', index);
}
