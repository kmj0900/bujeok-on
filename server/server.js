// 온라인 대전 서버: 정적 파일 제공 + 방 만들기/입장 + 입력 중계. 게임 규칙은 모른다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { MAPS } from '../js/maps.js';
import { chooseDelay } from './delay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = new Set(['index.html', 'style.css', 'js', 'assets']); // 이 이름 아래만 공개한다(server, tests, docs, node_modules 등은 비공개)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.json': 'application/json' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0/O, 1/I) 제외
const MAX_MSG = 1024;       // 메시지 최대 바이트
const MAX_ROOMS = 200;
const PING_COUNT = 5, PING_GAP_MS = 80, PING_TIMEOUT_MS = 1200; // 시작 전에 두 사람의 지연을 재는 횟수·간격·최대 대기
const HEARTBEAT_MS = 25000; // Render 등 프록시가 놀고 있는 연결을 끊지 않게

function serveStatic(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === '/') rel = '/index.html';
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || !PUBLIC.has(parts[0]) || parts.includes('..')) { res.writeHead(404).end('not found'); return; }
  const file = path.join(ROOT, ...parts);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404).end('not found'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

export function createServer({ port = 0, host = '0.0.0.0' } = {}) {
  // 방 상태(phase): waiting(상대 기다림) → starting(지연 측정 중) → playing(판 진행) → result(결과, 한 판 더 가능) → starting ...
  // again[slot]: 결과 화면에서 '한 판 더'를 누른 사람. startId: 지연 측정 도중 상황이 바뀌면 이전 측정 결과를 버리기 위한 번호.
  const rooms = new Map(); // code -> { code, mapId, players: [ws|null, ws|null], phase, again, startId }
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200).end('ok'); return; }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MSG });
  const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const err = (ws, code) => send(ws, { t: 'error', code });

  function newCode() {
    for (let i = 0; i < 50; i++) {
      let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
    return null;
  }
  function leave(ws) {
    const room = ws.room; if (!room) return;
    ws.room = null;
    const i = room.players.indexOf(ws);
    if (i >= 0) room.players[i] = null;
    const other = room.players.find(Boolean);
    room.startId++; room.again = [false, false]; // 진행 중이던 지연 측정과 '한 판 더' 표시는 무효
    if (i === 1) room.phase = 'waiting'; // 입장자가 나가면 방을 다시 연다(같은 코드로 새 친구가 들어올 수 있다)
    if (other) send(other, { t: 'peer_left' });
    if (!room.players.some(Boolean)) rooms.delete(room.code); // 아무도 없으면 방 삭제
    else if (room.players[0] === null) { // 방장이 나가면 방을 닫는다(남은 사람도 내보낸다)
      other.room = null; rooms.delete(room.code);
    }
  }
  // 한 사람과 서버 사이 왕복 시간을 여러 번 잰다. 응답이 하나도 없으면 null.
  function measureRtt(ws) {
    return new Promise((resolve) => {
      const samples = [], mine = new Set(); let sent = 0, done = false;
      ws.pongs ??= new Map(); ws.pingSeq ??= 0; // 같은 사람에게 측정이 겹쳐도(상대가 나갔다 새로 들어올 때) 서로 지우지 않게 번호는 계속 늘린다
      const finish = () => { if (done) return; done = true; clearInterval(iv); clearTimeout(to); for (const id of mine) ws.pongs.delete(id); resolve(samples.length ? samples : null); };
      const sendOne = () => { const id = ws.pingSeq++, t0 = performance.now(); sent++; mine.add(id); ws.pongs.set(id, () => { samples.push(performance.now() - t0); if (samples.length === PING_COUNT) finish(); }); send(ws, { t: 'ping', id }); };
      const iv = setInterval(() => { if (sent >= PING_COUNT) clearInterval(iv); else sendOne(); }, PING_GAP_MS);
      const to = setTimeout(finish, PING_TIMEOUT_MS);
      sendOne();
    });
  }
  async function start(room) {
    room.phase = 'starting'; // 측정하는 동안 다른 사람이 들어오지 못하게 먼저 잠근다
    room.again = [false, false];
    const token = ++room.startId;
    const [a, b] = await Promise.all(room.players.map(measureRtt));
    if (token !== room.startId || !room.players.every((p) => p && p.readyState === 1)) return; // 측정 중 누가 나갔다(방은 leave()가 이미 다시 열었다)
    room.phase = 'playing';
    const { delay, oneWayMs } = chooseDelay(a, b);
    const seed = randomInt(1, 2 ** 31);
    room.players.forEach((p, slot) => send(p, { t: 'start', slot, mapId: room.mapId, seed, delay, ms: oneWayMs }));
  }

  wss.on('connection', (ws) => {
    ws.alive = true; ws.room = null; ws.slot = -1;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('close', () => leave(ws));
    ws.on('error', () => {});
    ws.on('message', (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return err(ws, 'bad-json'); }
      if (!m || typeof m.t !== 'string') return err(ws, 'bad-message');
      switch (m.t) {
        case 'create': {
          if (ws.room) return err(ws, 'already-in-room');
          const mapId = Object.hasOwn(MAPS, m.mapId) ? m.mapId : 'forest';
          if (rooms.size >= MAX_ROOMS) return err(ws, 'server-full');
          const code = newCode(); if (!code) return err(ws, 'server-full');
          const room = { code, mapId, players: [ws, null], phase: 'waiting', again: [false, false], startId: 0 };
          rooms.set(code, room); ws.room = room; ws.slot = 0;
          return send(ws, { t: 'created', code, slot: 0, mapId });
        }
        case 'join': {
          if (ws.room) return err(ws, 'already-in-room');
          const code = String(m.code ?? '').toUpperCase().trim();
          const room = rooms.get(code);
          if (!room) return err(ws, 'no-such-room');
          if (room.players[1] || room.phase !== 'waiting') return err(ws, 'room-full');
          room.players[1] = ws; ws.room = room; ws.slot = 1;
          send(ws, { t: 'joined', code, slot: 1, mapId: room.mapId });
          send(room.players[0], { t: 'peer_joined' });
          return start(room); // 두 명이 모이면 바로 시작(맵은 방장이 정한 것)
        }
        case 'in': case 'hash': { // 상대에게 그대로 전달. 서버는 내용을 해석하지 않는다.
          const room = ws.room; if (!room || room.phase !== 'playing') return; // 판이 끝난 뒤 늦게 온 입력은 버린다(다음 판에 섞이지 않게)
          if (!Number.isInteger(m.tick) || m.tick < 0) return;
          const other = room.players[1 - ws.slot];
          if (m.t === 'in') return send(other, { t: 'in', tick: m.tick, a: m.a });
          return send(other, { t: 'hash', tick: m.tick, h: m.h });
        }
        case 'done': { // 내 화면에서 판이 끝났다. 서버는 규칙을 모르므로 클라이언트가 알려 준다. 먼저 끝낸 쪽 때문에 상대의 마지막 입력이 버려져도, 상대에게 필요한 입력은 이미 미리 보내져 있다.
          const room = ws.room; if (!room || room.phase !== 'playing') return;
          room.phase = 'result'; room.again = [false, false];
          return;
        }
        case 'again': { // '준비 완료'(결과 뒤 다음 판 준비). 둘 다 눌러야 시작한다
          const room = ws.room; if (!room || room.phase !== 'result') return;
          room.again[ws.slot] = true;
          send(room.players[1 - ws.slot], { t: 'peer_again' });
          if (room.again[0] && room.again[1] && room.players[0] && room.players[1]) start(room);
          return;
        }
        case 'map': { // 방장만 다음 판 맵을 바꾼다. 맵이 바뀌면 두 사람의 준비가 모두 풀린다(둘 다 다시 '준비 완료'를 눌러야 시작).
          const room = ws.room; if (!room || room.phase !== 'result' || ws.slot !== 0) return;
          if (!Object.hasOwn(MAPS, m.mapId)) return err(ws, 'bad-map');
          room.mapId = m.mapId; room.again = [false, false];
          for (const p of room.players) send(p, { t: 'map', mapId: room.mapId });
          return;
        }
        case 'pong': { const f = ws.pongs && ws.pongs.get(m.id); if (f) { ws.pongs.delete(m.id); f(); } return; }
        case 'leave': return leave(ws);
        default: return err(ws, 'unknown-type');
      }
    });
  });

  const hb = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, HEARTBEAT_MS);
  hb.unref();

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => resolve({
      port: httpServer.address().port,
      rooms,
      close: () => new Promise((r) => { clearInterval(hb); for (const c of wss.clients) c.terminate(); wss.close(() => httpServer.close(() => r())); }),
    }));
  });
}
