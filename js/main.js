import { MAPS } from './maps.js';
import { loadMap, createRng } from './map.js';
import { drawMap, drawItems, drawBombs, drawExplosions, drawPlayers, drawPopups, drawCountdown, drawStartBanner, drawHazardWarning, drawShuriken, drawCurrent, drawRockfall } from './renderer.js';
import { createGame, updateGame, pause, resume, Phase, STEP } from './game.js';
import { MAX_HP } from './player.js';
import { createInput } from './input.js';
import { createAI } from './ai.js';
import { loadSprites } from './sprites.js';
import { createSound } from './sound.js';
import { SCREENS, MAP_CHOICES, screenRects, hitTest, wrapIndex, toCanvasPoint, drawMainMenu, drawMapMenu, drawModeMenu, drawPauseMenu, drawResultScreen, drawOnlineMenu, drawLobby, drawJoin, drawNotice, drawWaiting, drawOnlineResult } from './ui.js';
import { createLockstep } from './lockstep.js';
import { createOnline, errorText } from './online.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hudP1 = document.getElementById('hud-p1');
const hudP2 = document.getElementById('hud-p2');
const hudTime = document.getElementById('hud-time');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const sound = createSound(); // 효과음(소리 끄기: M)
for (const type of ['keydown', 'pointerdown']) window.addEventListener(type, () => sound.unlock());
const sprites = loadSprites(); // 로딩 전·실패 시에는 렌더러가 임시 도형으로 그린다

// ?seed=123 으로 첫 판의 상자 배치를 재현할 수 있다. 이후 판은 새 시드를 쓴다.
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
let pendingSeed = seedParam !== null ? Number(seedParam) : undefined;
// ?mode=ai|local 은 개발용 바로가기: 메뉴를 건너뛰고 해당 모드로 바로 시작한다.
const modeParam = params.get('mode');
let mode = modeParam === 'ai' ? 'ai' : 'local';
let aiLevel = params.get('level') === 'easy' ? 'easy' : 'normal'; // ?level=easy 는 개발용 바로가기(AI 난이도). 메뉴에서는 쉬움·보통을 고른다

// ?hazard=3 은 개발용 바로가기: 첫 수리검을 시작 3초 뒤에 나오게 한다(이후 간격은 그대로).
const hazardParam = Number(params.get('hazard'));
const hazardStart = hazardParam > 0 ? hazardParam : undefined;

// ?map=forest|waterfall 은 개발용 바로가기: 처음 선택된 맵을 정한다(맵 선택 화면에서 바꿀 수 있다).
const mapParam = params.get('map');
// ?t=100 은 개발용 바로가기: 경과 시간 100초부터 시작한다(물살 2칸·3칸 단계 확인용). 첫 위협은 시작 지점에서 hazard(기본 startDelay)초 뒤.
const tParam = Number(params.get('t'));
const startTime = tParam > 0 && tParam < 170 ? tParam : undefined;

const MAX_FRAME_TIME = 0.25; // 프레임 복귀 시 누적 시간 상한
const WAIT_SHOW = 0.5;       // 온라인: 상대 입력을 이만큼(초) 못 받으면 '기다리는 중' 표시
const joinParam = (params.get('join') || '').toUpperCase(); // ?join=ABCD : 방 코드로 바로 입장(개발·시연용)
const joinPanel = document.getElementById('join-panel');
const joinCode = document.getElementById('join-code');
const joinBtn = document.getElementById('join-btn');

// 정보창(2026-11-25): 얼굴 + 하트 4개(깎이면 어두운 하트) + 능력치(경공술·화약 범위·동시 부적 수, 아이템 아이콘과 숫자). 이름 글자는 없다. 값은 모두 코드가 만든 숫자·고정 문자열이다.
function hudHtml(p, isAi) {
  const out = p.state === 'ELIMINATED';
  const main = out ? '<b class="tag">탈락</b>'
    : p.state === 'SEALED' ? '<b class="tag">봉인!</b>'
    : Array.from({ length: MAX_HP }, (_, i) => `<i class="heart${i < p.hp ? '' : ' lost'}">♥</i>`).join('');
  return `<div class="face face-p${p.id + 1}${out ? ' out' : ''}"></div>`
    + `<div class="info"><div class="hearts">${main}</div>`
    + `<div class="stats"><span><i class="ic ic-speed"></i><b>${p.speedLevel}</b></span><span><i class="ic ic-range"></i><b>${p.range}</b></span><span><i class="ic ic-bomb"></i><b>${p.maxBombs}</b></span></div></div>`
    + (isAi ? '<b class="ai">AI</b>' : '');
}

function formatTime(sec) {
  const s = Math.ceil(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

try {
  let map = null, game = null, ai = null;
  let scene = modeParam ? 'game' : 'menu'; // 'menu' | 'map' | 'mode' | 'game' | 'online' | 'lobby' | 'join' | 'notice'
  let net = null, ls = null;               // 온라인: 서버 연결, 락스텝
  let onlineIntent = false;                // 맵 선택 화면이 '방 만들기'용인지
  let lobbyInfo = { code: '', text: '' };
  let noticeText = '', joinText = '';
  let stalled = 0;                         // 온라인: 상대 입력을 기다려 멈춘 시간(초)
  let selectedMapId = MAPS[mapParam] ? mapParam : 'forest'; // 맵 선택 화면에서 고른 맵. 다시 대결해도 유지되고, 메인 화면으로 나가면 다시 고른다
  let menuIndex = 0;
  let screenKey = null; // 현재 버튼 화면(바뀌면 선택을 첫 버튼으로)
  let lastPhase = null;
  let acc = 0;
  const input = createInput(window);

  // 새 판(시작·다시 대결·다시 시작). 상자가 파괴되며 map.grid가 바뀌므로 맵을 다시 생성하고,
  // 체력·부적·폭발·타이머가 모두 초기화된 새 게임 상태를 만든다. 리스너는 다시 등록하지 않는다.
  function newRound() {
    map = loadMap(MAPS[selectedMapId], pendingSeed);
    pendingSeed = undefined;
    game = createGame(map, { hazardStart, startTime });
    ai = createAI(0, createRng((map.seed + 7) >>> 0), aiLevel); // AI는 1P(흑영)를 조종하고, 사람은 2P(녹림, 방향키+Enter)로 오른손 조작을 한다(2026-11-25 사용자 요청)
    input.clear();
    acc = 0;
    lastPhase = game.phase;
    status.textContent = `${mode === 'ai' ? (aiLevel === 'easy' ? 'AI 대전(쉬움)' : 'AI 대전(보통)') : '로컬 2인'} | ${map.def.name} | 시드 ${map.seed} | 상자 ${map.crateCount}/${map.candidateCount}칸`;
    console.log('map loaded', { mode, seed: map.seed, crates: map.crateCount, candidates: map.candidateCount });
  }
  function startGame(newMode, level = 'normal') {
    mode = newMode;
    aiLevel = level;
    scene = 'game';
    newRound();
  }
  function toMenu() {
    leaveOnline();
    onlineIntent = false;
    scene = 'menu';
    input.clear();
    status.textContent = '';
  }

  // ---------- 온라인 대전 ----------
  function leaveOnline() { if (net) net.leave(); net = null; ls = null; }
  function showNotice(text) { leaveOnline(); noticeText = text; scene = 'notice'; status.textContent = ''; input.clear(); }
  function makeNet() {
    leaveOnline();
    net = createOnline({
      onCreated: (m) => { lobbyInfo = { code: m.code, text: '친구에게 이 코드를 알려 주자. 들어오면 바로 시작한다' }; status.textContent = `온라인 | 방 ${m.code}`; },
      onJoined: (m) => { lobbyInfo = { code: m.code, text: '입장했다. 곧 시작한다' }; },
      onStart: startOnline,
      onPeerLeft: () => { if (scene === 'game' && game && game.phase !== Phase.RESULT) showNotice('상대가 나갔다'); },
      onError: (code) => showNotice(errorText(code)),
      onClose: () => { if (scene === 'lobby' || scene === 'game') showNotice('서버와 연결이 끊겼다'); },
    });
    return net;
  }
  const guard = (p) => p.catch((e) => showNotice(errorText(e && e.message === 'connect-failed' ? 'connect-failed' : '')));
  function createRoom(mapId) {
    lobbyInfo = { code: '', text: '서버에 연결하는 중...' }; scene = 'lobby'; input.clear();
    guard(makeNet().create(mapId));
  }
  function joinRoom(code) {
    lobbyInfo = { code: String(code).toUpperCase(), text: '서버에 연결하는 중...' }; scene = 'lobby'; input.clear();
    guard(makeNet().join(code));
  }
  function startOnline(m) {
    selectedMapId = MAPS[m.mapId] ? m.mapId : 'forest';
    mode = 'online';
    map = loadMap(MAPS[selectedMapId], m.seed);
    game = createGame(map);
    ls = createLockstep({ slot: m.slot, delay: m.delay });
    net.setLockstep(ls);
    scene = 'game';
    input.clear();
    acc = 0; stalled = 0;
    lastPhase = game.phase;
    status.textContent = `온라인 | 방 ${net.code} | 나는 ${m.slot === 0 ? '1P 흑영' : '2P 녹림'} | ${map.def.name} | 시드 ${map.seed}`;
  }
  // 온라인에서는 어느 키 배치로 눌러도 내 닌자를 움직인다(WASD+Space 또는 방향키+Enter)
  function onlineAction() {
    const a = input.getAction(0), b = input.getAction(1);
    return { move: a.move ?? b.move, placeBomb: a.placeBomb || b.placeBomb, struggle: a.struggle || b.struggle };
  }
  const tryJoinFromPanel = () => { const c = joinCode.value.trim().toUpperCase(); joinPanel.hidden = true; if (c.length === 4) joinRoom(c); else { joinPanel.hidden = false; joinText = '방 코드는 4글자다'; } };
  joinBtn.addEventListener('click', tryJoinFromPanel);
  joinCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tryJoinFromPanel(); }
    else if (e.key === 'Escape') { e.preventDefault(); scene = 'online'; }
  });
  if (joinParam) joinRoom(joinParam);
  if (modeParam) newRound(); // 개발용 바로가기

  // 지금 떠 있는 버튼 화면 이름(없으면 null)
  function activeScreen() {
    if (scene === 'menu') return 'menu';
    if (scene === 'map') return 'map';
    if (scene === 'mode') return 'mode';
    if (scene === 'online' || scene === 'lobby' || scene === 'join' || scene === 'notice') return scene;
    if (game && game.phase === Phase.PAUSED) return 'pause';
    if (game && game.phase === Phase.RESULT) return mode === 'online' ? 'resultOnline' : 'result';
    return null;
  }

  function activate(screen, i) {
    if (screen === 'menu') { if (i === 0) scene = 'map'; else scene = 'online'; input.clear(); }
    else if (screen === 'online') {
      if (i === 0) { onlineIntent = true; scene = 'map'; }
      else if (i === 1) { joinText = ''; joinCode.value = ''; scene = 'join'; }
      else scene = 'menu';
      input.clear();
    } else if (screen === 'lobby') { leaveOnline(); scene = 'online'; input.clear(); }
    else if (screen === 'join') { scene = 'online'; input.clear(); }
    else if (screen === 'notice' || screen === 'resultOnline') toMenu();
    else if (screen === 'map') {
      if (i < MAP_CHOICES.length) {
        selectedMapId = MAP_CHOICES[i].id;
        if (onlineIntent) { onlineIntent = false; createRoom(selectedMapId); input.clear(); return; }
        scene = 'mode';
      } else if (onlineIntent) { onlineIntent = false; scene = 'online'; }
      else scene = 'menu';
      input.clear();
    } else if (screen === 'mode') {
      if (i === 0) startGame('local');
      else if (i === 1) startGame('ai', 'easy');
      else if (i === 2) startGame('ai', 'normal');
      else { scene = 'map'; input.clear(); } // 뒤로: 맵 선택으로
    } else if (screen === 'pause') {
      if (i === 0) { resume(game); input.clear(); }
      else if (i === 1) newRound();
      else toMenu();
    } else if (screen === 'result') {
      if (i === 0) newRound();
      else toMenu();
    }
  }

  // 포커스를 잃거나 탭이 숨겨지면 일시정지하고 눌린 키를 모두 해제한다. 복귀 시 자동 재개하지 않는다.
  const autoPause = () => { if (scene === 'game' && game && mode !== 'online') pause(game); input.clear(); }; // 온라인은 멈출 수 없다(상대가 기다리게 된다)
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

  // 마우스: 버튼 위에 올리면 선택, 클릭하면 실행
  function pointerIndex(e) {
    const screen = activeScreen();
    if (!screen) return { screen, i: -1 };
    const p = toCanvasPoint(canvas.getBoundingClientRect(), canvas.width, canvas.height, e.clientX, e.clientY);
    return { screen, i: hitTest(screenRects(screen, canvas.width), p.x, p.y) };
  }
  canvas.addEventListener('mousemove', (e) => {
    const { screen, i } = pointerIndex(e);
    canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
    if (screen && i >= 0) menuIndex = i;
  });
  canvas.addEventListener('click', (e) => {
    const { screen, i } = pointerIndex(e);
    if (screen && i >= 0) activate(screen, i);
  });

  function handleScreenKeys(screen) {
    const count = SCREENS[screen].items.length;
    const up = input.consume('ArrowUp') | input.consume('KeyW');
    const down = input.consume('ArrowDown') | input.consume('KeyS');
    const select = input.consume('Enter') | input.consume('Space');
    const esc = input.consume('Escape');
    const pauseKey = input.consume('KeyP');
    const restart = input.consume('KeyR');
    if (up) menuIndex = wrapIndex(menuIndex, -1, count);
    else if (down) menuIndex = wrapIndex(menuIndex, 1, count);
    if (select) return activate(screen, menuIndex);
    if (screen === 'map' && esc) return activate('map', MAP_CHOICES.length); // 뒤로: 메인 화면(온라인이면 온라인 메뉴)
    if (screen === 'online' && esc) return activate('online', 2); // 뒤로: 메인 화면
    if ((screen === 'lobby' || screen === 'join') && esc) return activate(screen, 0); // 방 나가기 / 뒤로
    if (screen === 'mode' && esc) return activate('mode', 3); // 뒤로: 맵 선택
    if (screen === 'pause' && (esc || pauseKey)) return activate('pause', 0); // 계속하기
    if ((screen === 'pause' || screen === 'result') && restart) return newRound();
  }

  let last = performance.now();
  function frame(now) {
    acc += Math.min((now - last) / 1000, MAX_FRAME_TIME);
    last = now;

    if (input.consume('KeyM')) { const m = sound.toggle(); status.textContent = m ? '소리 꺼짐 (M으로 켜기)' : '소리 켜짐'; }
    const screen = activeScreen();
    joinPanel.hidden = scene !== 'join';
    if (scene === 'join') { // 방 코드 입력칸을 캔버스 안쪽(안내 문구와 뒤로 버튼 사이 가운데)에 놓는다
      const box = canvas.getBoundingClientRect();
      joinPanel.style.left = `${box.left + box.width / 2}px`;
      joinPanel.style.top = `${box.top + (box.height * 222) / canvas.height}px`;
    }
    if (screen !== screenKey) {
      if (screen === 'join') setTimeout(() => joinCode.focus(), 0); else if (document.activeElement === joinCode) joinCode.blur();
      screenKey = screen;
      menuIndex = screen === 'map' ? Math.max(0, MAP_CHOICES.findIndex((m) => m.id === selectedMapId)) : 0; // 맵 화면은 마지막에 고른 맵부터
      input.clear();
    }

    if (screen) {
      handleScreenKeys(screen);
      acc = 0;
    } else if (scene === 'game' && mode === 'online') {
      input.consumePause(); // 온라인에서는 일시정지 없음
      const want = Math.min(Math.floor(acc / STEP), 15);
      const did = ls.pump(game, onlineAction, want);
      acc -= did * STEP;
      if (did < want) { stalled += (want - did) * STEP; acc = Math.min(acc, 0.1); } else if (did > 0) stalled = 0;
      for (const m of ls.outbox.splice(0)) net.send(m);
      for (const e of game.events) sound.play(e);
      game.events.length = 0;
      if (ls.desyncTick !== null) status.textContent = `화면이 어긋났다(틱 ${ls.desyncTick}). 이번 판은 믿을 수 없다`;
      if (game.phase !== lastPhase) { input.clear(); lastPhase = game.phase; }
    } else if (scene === 'game') {
      if (input.consumePause() && game.phase === Phase.PLAYING) { pause(game); input.clear(); }
      // 사람과 AI가 같은 형태의 액션을 쓴다. 입력은 카운트다운·플레이 중에만 읽어 Enter/Space가 메뉴에 남도록 한다.
      while (acc >= STEP) {
        const p1 = input.getAction(0); // AI 대전에서도 읽어서 눌린 키를 비운다(WASD는 무시)
        updateGame(game, [mode === 'ai' ? ai.getAction(game, STEP) : p1, input.getAction(1)]);
        acc -= STEP;
      }
      for (const e of game.events) sound.play(e); // 이번 프레임에 생긴 이벤트를 소리로
      game.events.length = 0;
      if (game.phase !== lastPhase) { input.clear(); lastPhase = game.phase; } // 승패 확정 등으로 화면이 바뀌면 남은 키 입력을 버린다
    }

    // ---- 그리기 ----
    if (scene === 'menu') drawMainMenu(ctx, sprites, menuIndex);
    else if (scene === 'map') drawMapMenu(ctx, sprites, menuIndex);
    else if (scene === 'mode') drawModeMenu(ctx, sprites, menuIndex, MAPS[selectedMapId].name);
    else if (scene === 'online') drawOnlineMenu(ctx, sprites, menuIndex);
    else if (scene === 'lobby') drawLobby(ctx, sprites, menuIndex, lobbyInfo);
    else if (scene === 'join') drawJoin(ctx, sprites, menuIndex, joinText);
    else if (scene === 'notice') drawNotice(ctx, sprites, menuIndex, noticeText);
    else if (game) {
      drawMap(ctx, map, sprites, performance.now() / 1000);
      drawItems(ctx, game, sprites);
      drawExplosions(ctx, game, sprites);
      drawBombs(ctx, game, sprites);
      drawHazardWarning(ctx, game); // 예고·물살은 닌자 아래, 날아가는 수리검은 닌자 위
      drawCurrent(ctx, game);
      drawPlayers(ctx, game, sprites);
      drawShuriken(ctx, game);
      drawRockfall(ctx, game, sprites); // 떨어지는 돌은 닌자 위
      drawPopups(ctx, game);
      if (game.phase === Phase.COUNTDOWN) drawCountdown(ctx, game);
      else if (game.phase === Phase.PLAYING) drawStartBanner(ctx, game);
      else if (game.phase === Phase.PAUSED) drawPauseMenu(ctx, menuIndex);
      else if (game.phase === Phase.RESULT) { if (mode === 'online') drawOnlineResult(ctx, game, menuIndex); else drawResultScreen(ctx, game, menuIndex); }
      if (mode === 'online' && game.phase !== Phase.RESULT && stalled > WAIT_SHOW) drawWaiting(ctx);
    }

    if (scene === 'game' && game) {
      hudP1.innerHTML = hudHtml(game.players[0], mode === 'ai');
      hudP2.innerHTML = hudHtml(game.players[1], false);
      hudTime.textContent = formatTime(game.timeLeft);
      hudTime.classList.toggle('low', game.phase === Phase.PLAYING && game.timeLeft <= 30); // 남은 30초부터 붉게 깜박
    } else {
      hudP1.innerHTML = hudP2.innerHTML = hudTime.textContent = '';
      hudTime.classList.remove('low');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (e) {
  status.textContent = '맵 로드 실패: ' + e.message;
  console.error(e);
}
