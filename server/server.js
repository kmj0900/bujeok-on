// 온라인 대전 서버: 정적 파일 제공 + 방 만들기/입장 + 입력 중계. 게임 규칙은 모른다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { MAPS } from '../js/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = new Set(['index.html', 'style.css', 'js', 'assets']); // 이 이름 아래만 공개한다(server, tests, docs, node_modules 등은 비공개)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.json': 'application/json' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0/O, 1/I) 제외
const MAX_MSG = 1024;       // 메시지 최대 바이트
const MAX_ROOMS = 200;
const INPUT_DELAY = Number(process.env.INPUT_DELAY) || 5; // 입력 지연 틱 수. 두 사람이 같아야 하므로 서버가 정한다
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
  const rooms = new Map(); // code -> { code, mapId, players: [ws|null, ws|null], started }
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
    if (other) send(other, { t: 'peer_left' });
    if (!room.players.some(Boolean)) rooms.delete(room.code); // 아무도 없으면 방 삭제
    else if (room.players[0] === null) { // 방장이 나가면 방을 닫는다(남은 사람도 내보낸다)
      other.room = null; rooms.delete(room.code);
    }
  }
  function start(room) {
    room.started = true;
    const seed = randomInt(1, 2 ** 31);
    room.players.forEach((p, slot) => send(p, { t: 'start', slot, mapId: room.mapId, seed, delay: INPUT_DELAY }));
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
          const room = { code, mapId, players: [ws, null], started: false };
          rooms.set(code, room); ws.room = room; ws.slot = 0;
          return send(ws, { t: 'created', code, slot: 0, mapId });
        }
        case 'join': {
          if (ws.room) return err(ws, 'already-in-room');
          const code = String(m.code ?? '').toUpperCase().trim();
          const room = rooms.get(code);
          if (!room) return err(ws, 'no-such-room');
          if (room.players[1] || room.started) return err(ws, 'room-full');
          room.players[1] = ws; ws.room = room; ws.slot = 1;
          send(ws, { t: 'joined', code, slot: 1, mapId: room.mapId });
          send(room.players[0], { t: 'peer_joined' });
          return start(room); // 두 명이 모이면 바로 시작(맵은 방장이 정한 것)
        }
        case 'in': case 'hash': { // 상대에게 그대로 전달. 서버는 내용을 해석하지 않는다.
          const room = ws.room; if (!room || !room.started) return;
          if (!Number.isInteger(m.tick) || m.tick < 0) return;
          const other = room.players[1 - ws.slot];
          if (m.t === 'in') return send(other, { t: 'in', tick: m.tick, a: m.a });
          return send(other, { t: 'hash', tick: m.tick, h: m.h });
        }
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
