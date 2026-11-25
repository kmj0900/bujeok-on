// M2·M3 온라인 테스트: 서버(방·입장·중계) + 락스텝(지연이 있어도 두 쪽 상태가 같고, 오프라인 한 판과도 같다)
import WebSocket from 'ws';
import { createServer } from '../server/server.js';
import { MAPS } from '../js/maps.js';
import { loadMap, createRng } from '../js/map.js';
import { createGame, updateGame } from '../js/game.js';
import { createLockstep, stateHash, NO_ACTION, sanitizeAction } from '../js/lockstep.js';
import { chooseDelay, DELAY_MIN, DELAY_MAX, DELAY_FALLBACK } from '../server/delay.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ' ' + extra)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(port) { this.msgs = []; this.waiters = []; this.closed = false; this.ws = new WebSocket(`ws://127.0.0.1:${port}`); this.ws.on('message', (d) => this.push(JSON.parse(d.toString()))); this.ws.on('close', () => { this.closed = true; }); }
  open() { return new Promise((r, j) => { this.ws.once('open', r); this.ws.once('error', j); }); }
  push(m) {
    if (m.t === 'ping') { if (!this.noPong) setTimeout(() => this.ws.readyState === 1 && this.send({ t: 'pong', id: m.id }), this.pongDelay ?? 0); return; } // 서버의 지연 측정에 답한다(시험용으로 늦추거나 안 답할 수 있다)
    const i = this.waiters.findIndex((w) => w.type === m.t); if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m); else this.msgs.push(m); this.onMessage?.(m); }
  send(m) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  next(type, ms = 2000) {
    const i = this.msgs.findIndex((m) => m.t === type);
    if (i >= 0) return Promise.resolve(this.msgs.splice(i, 1)[0]);
    return new Promise((resolve, reject) => { const w = { type, resolve }; this.waiters.push(w); setTimeout(() => { const k = this.waiters.indexOf(w); if (k >= 0) { this.waiters.splice(k, 1); reject(new Error('timeout: ' + type)); } }, ms); });
  }
  close() { this.ws.close(); }
}
const connect = async (port) => { const c = new Client(port); await c.open(); return c; };

const server = await createServer({ port: 0, host: '127.0.0.1' });
const port = server.port;
const get = (p) => fetch(`http://127.0.0.1:${port}${p}`).then(async (r) => ({ status: r.status, text: await r.text() }));

// ---------- 방·입장
{
  const a = await connect(port), b = await connect(port), c = await connect(port);
  b.send({ t: 'join', code: 'ZZZZ' });
  t('없는 방 코드로 입장하면 no-such-room 오류', (await b.next('error')).code === 'no-such-room');
  a.send({ t: 'create', mapId: 'waterfall' });
  const created = await a.next('created');
  t('방 만들기: 4글자 코드, 1P(slot 0), 고른 맵', /^[A-Z2-9]{4}$/.test(created.code) && created.slot === 0 && created.mapId === 'waterfall');
  b.send({ t: 'join', code: created.code.toLowerCase() });
  const [joined, sa, sb, pj] = await Promise.all([b.next('joined'), a.next('start', 4000), b.next('start', 4000), a.next('peer_joined')]);
  t('입장: 2P(slot 1), 방장에게 입장 알림, 코드 대소문자 무시', joined.slot === 1 && pj.t === 'peer_joined');
  t('시작: 두 사람이 같은 맵·시드를 받고 번호는 0/1', sa.mapId === 'waterfall' && sb.mapId === 'waterfall' && sa.seed === sb.seed && Number.isInteger(sa.seed) && sa.slot === 0 && sb.slot === 1);
  c.send({ t: 'join', code: created.code });
  t('가득 찬 방에 세 번째 입장은 room-full', (await c.next('error')).code === 'room-full');
  a.send({ t: 'create' });
  t('이미 방에 있으면 create는 already-in-room', (await a.next('error')).code === 'already-in-room');
  a.send('{깨진 json');
  t('깨진 JSON은 오류만 돌려주고 서버는 계속 동작', (await a.next('error')).code === 'bad-json' && !a.closed);
  a.send({ t: 'in', tick: 5, a: { move: 'up', placeBomb: true, struggle: false } });
  const relayed = await b.next('in');
  t('입력 중계: 상대에게 같은 틱·내용 전달', relayed.tick === 5 && relayed.a.move === 'up' && relayed.a.placeBomb === true);
  a.send({ t: 'in', tick: -1, a: {} }); a.send({ t: 'in', tick: 1.5, a: {} });
  await sleep(100);
  t('음수·소수 틱은 중계하지 않음', !b.msgs.some((m) => m.t === 'in'));
  a.close();
  t('상대가 나가면 peer_left', (await b.next('peer_left')).t === 'peer_left');
  await sleep(100);
  t('모두 나가면 방이 삭제됨', (b.close(), await sleep(100), server.rooms.size === 0));
  c.close();
}

// ---------- 방장이 나가면 방이 닫히고 코드 재사용 불가
{
  const a = await connect(port), b = await connect(port);
  a.send({ t: 'create' }); const { code } = await a.next('created');
  a.close(); await sleep(100);
  b.send({ t: 'join', code });
  t('방장이 나간 방에는 입장할 수 없음', (await b.next('error')).code === 'no-such-room');
  b.close();
}

// ---------- 입력 지연 자동 결정
{
  const fast = chooseDelay([2, 3, 2, 3, 2], [3, 2, 3, 2, 3]);
  t('아주 빠른 연결: 최소값(4틱)', fast.delay === DELAY_MIN);
  const far = chooseDelay([170, 165, 175, 170, 168], [150, 148, 155, 150, 152]);
  t('왕복 170·150ms(해외 서버): 12~13틱', far.delay >= 12 && far.delay <= 13 && far.oneWayMs === 160, JSON.stringify(far));
  const near = chooseDelay([80, 78, 84, 80, 79], [70, 72, 69, 71, 70]);
  t('왕복 80·70ms(싱가포르 정도): 6~8틱', near.delay >= 6 && near.delay <= 8, JSON.stringify(near));
  t('측정 실패(null)는 넉넉한 기본값', chooseDelay(null, [10]).delay === DELAY_FALLBACK && chooseDelay([], []).delay === DELAY_FALLBACK);
  t('아주 느리면 상한(24틱)', chooseDelay([1500], [1500]).delay === DELAY_MAX);
  t('흔들림이 크면 같은 평균에서도 더 크게 잡음', chooseDelay([100, 200, 100], [100, 200, 100]).delay > chooseDelay([100, 100, 100], [100, 100, 100]).delay);

  // 서버가 실제로 재서 정한다: 각자 80ms씩 늦게 답하는 두 클라이언트
  const a = await connect(port), b = await connect(port);
  a.pongDelay = 80; b.pongDelay = 80;
  a.send({ t: 'create' }); const { code } = await a.next('created');
  const t0 = Date.now(); b.send({ t: 'join', code });
  const [sa, sb] = await Promise.all([a.next('start', 4000), b.next('start', 4000)]);
  t('서버가 측정한 값으로 시작: 두 사람 같은 지연, 80ms 왕복이면 6~9틱', sa.delay === sb.delay && sa.delay >= 6 && sa.delay <= 9, `delay=${sa.delay} ms=${sa.ms}`);
  t('start에 전달 시간(ms)이 실려 옴', Number.isFinite(sa.ms) && sa.ms >= 60 && sa.ms <= 140, String(sa.ms));
  t('측정 때문에 시작이 늦어도 2초 안', Date.now() - t0 < 2000, String(Date.now() - t0));
  a.close(); b.close(); await sleep(100);

  // 한쪽이 측정에 답하지 않으면 기본값으로 시작한다(멈추지 않음)
  const c = await connect(port), d = await connect(port);
  d.noPong = true;
  c.send({ t: 'create' }); const r = await c.next('created');
  const t1 = Date.now(); d.send({ t: 'join', code: r.code });
  const [sc, sd] = await Promise.all([c.next('start', 4000), d.next('start', 4000)]);
  t('응답 없는 쪽이 있어도 기본값(12틱)으로 시작', sc.delay === DELAY_FALLBACK && sd.delay === DELAY_FALLBACK && sc.ms === null, `delay=${sc.delay}`);
  t('응답이 없어도 3초 안에 시작', Date.now() - t1 < 3000, String(Date.now() - t1));
  c.close(); d.close(); await sleep(100);

  // 측정 중에 한 명이 나가면 start를 보내지 않고 방이 정리된다
  const e = await connect(port), f = await connect(port);
  f.pongDelay = 300;
  e.send({ t: 'create' }); const r2 = await e.next('created');
  f.send({ t: 'join', code: r2.code }); await sleep(100); f.close();
  await sleep(1500);
  t('측정 중 상대가 나가면 start 없이 peer_left만', !e.msgs.some((m) => m.t === 'start') && e.msgs.some((m) => m.t === 'peer_left'), JSON.stringify(e.msgs));
  e.close(); await sleep(100);
}

// ---------- 정적 파일 제공과 비공개 경로
{
  const idx = await get('/'), js = await get('/js/game.js'), health = await get('/health');
  t('/ 와 /js 파일 제공, /health 응답', idx.status === 200 && idx.text.includes('<') && js.status === 200 && js.text.includes('createGame') && health.text === 'ok');
  const blocked = await Promise.all(['/server/server.js', '/package.json', '/tests/test_online.mjs', '/docs/01_GAME_DESIGN.md', '/node_modules/ws/package.json', '/.gitignore', '/js/../package.json', '/%2e%2e/package.json', '/js/%2e%2e/package.json'].map(async (p) => [p, (await get(p)).status]));
  t('서버 코드·설정·문서·상위 경로는 공개되지 않음', blocked.every(([, s]) => s === 404 || s === 400), JSON.stringify(blocked));
}

// ---------- 락스텝: 지연·순서 뒤바뀜이 있어도 두 쪽이 같고, 오프라인 한 판과도 같다
const DIRS = ['up', 'down', 'left', 'right', null];
function makeInputs(seed, n) {
  const rng = createRng(seed * 7919 + 1), log = [[], []], cur = [null, null];
  for (let i = 0; i < n; i++) for (let p = 0; p < 2; p++) { if (rng() < 0.15) cur[p] = DIRS[Math.floor(rng() * DIRS.length)]; log[p].push({ move: cur[p], placeBomb: rng() < 0.04, struggle: rng() < 0.25 }); }
  return log;
}

async function onlineMatch({ mapId, delay, jitter, target, inputSeed }) {
  const a = await connect(port), b = await connect(port);
  a.send({ t: 'create', mapId }); const { code } = await a.next('created');
  b.send({ t: 'join', code });
  const [sa, sb] = await Promise.all([a.next('start', 4000), b.next('start', 4000)]);
  const log = makeInputs(inputSeed, target + delay + 10);
  const peers = [[a, sa], [b, sb]].map(([c, s]) => {
    const p = { c, s, ls: createLockstep({ slot: s.slot, delay }), game: createGame(loadMap(MAPS[s.mapId], s.seed)), k: 0 };
    c.onMessage = (m) => { if (m.t === 'in') p.ls.receiveInput(m.tick, m.a); else if (m.t === 'hash') p.ls.receiveHash(m.tick, m.h); };
    return p;
  });
  const flush = (p) => { for (const m of p.ls.outbox.splice(0)) setTimeout(() => p.c.ws.readyState === 1 && p.c.send(m), Math.random() * jitter); }; // 일부러 순서도 뒤바뀌게 한다
  const t0 = Date.now();
  while (peers.some((p) => p.ls.simTick < target) && Date.now() - t0 < 60000) {
    for (const p of peers) { if (p.ls.simTick < target) p.ls.pump(p.game, () => log[p.s.slot][p.k++], target - p.ls.simTick); flush(p); }
    await sleep(1);
  }
  await sleep(jitter + 50);
  const res = { reached: peers.map((p) => p.ls.simTick), hashes: peers.map((p) => stateHash(p.game)), desync: peers.map((p) => p.ls.desyncTick), stalled: peers.map((p) => p.ls.stalled), seed: sa.seed, log, sa };
  // 오프라인 기준: 같은 시드·같은 입력 기록을 지연만큼 밀어서 한 판 돌린다
  const ref = createGame(loadMap(MAPS[mapId], sa.seed));
  for (let tk = 0; tk < target; tk++) { updateGame(ref, [0, 1].map((p) => (tk < delay ? NO_ACTION : sanitizeAction(log[p][tk - delay])))); ref.events.length = 0; }
  res.refHash = stateHash(ref);
  a.close(); b.close();
  return res;
}

for (const [mapId, delay, jitter, target, inputSeed] of [['forest', 6, 10, 2400, 11], ['waterfall', 5, 15, 2400, 22], ['mountain', 4, 8, 2400, 33], ['forest', 8, 25, 1200, 44]]) {
  const r = await onlineMatch({ mapId, delay, jitter, target, inputSeed });
  t(`${mapId} (지연 ${delay}틱, 전송 흔들림 ~${jitter}ms): 두 쪽 모두 ${target}틱 도달`, r.reached.every((x) => x === target), JSON.stringify(r.reached));
  t(`${mapId}: 두 쪽 최종 상태 해시 동일`, r.hashes[0] === r.hashes[1], JSON.stringify(r.hashes));
  t(`${mapId}: 오프라인 한 판과도 동일`, r.hashes[0] === r.refHash);
  t(`${mapId}: 1초마다 교환한 해시에서 어긋남 없음`, r.desync.every((d) => d === null), JSON.stringify(r.desync));
}

// ---------- 어긋남 감지: 한쪽 상태를 일부러 틀어 보면 경고가 떠야 한다
{
  const ls0 = createLockstep({ slot: 0, delay: 2 }), ls1 = createLockstep({ slot: 1, delay: 2 });
  const g0 = createGame(loadMap(MAPS.forest, 5)), g1 = createGame(loadMap(MAPS.forest, 5));
  for (let i = 0; i < 400; i++) {
    if (i === 100) g1.players[0].hp = 1; // 몰래 조작
    ls0.pump(g0, () => NO_ACTION, 1); ls1.pump(g1, () => NO_ACTION, 1);
    for (const m of ls0.outbox.splice(0)) m.t === 'in' ? ls1.receiveInput(m.tick, m.a) : ls1.receiveHash(m.tick, m.h);
    for (const m of ls1.outbox.splice(0)) m.t === 'in' ? ls0.receiveInput(m.tick, m.a) : ls0.receiveHash(m.tick, m.h);
  }
  t('한쪽 상태가 틀어지면 해시 비교로 어긋난 틱을 알아챔', ls0.desyncTick === 120 && ls1.desyncTick === 120, `${ls0.desyncTick}/${ls1.desyncTick}`);
}

// ---------- 상대 입력이 오지 않으면 멈춘다(상태를 멋대로 진행하지 않음)
{
  const ls = createLockstep({ slot: 0, delay: 3 }), g = createGame(loadMap(MAPS.forest, 5));
  const n = ls.pump(g, () => NO_ACTION);
  t('상대 입력이 없으면 지연 틱만큼만 진행하고 멈춤', n === 3 && ls.stalled === 1);
  ls.receiveInput(3, { move: 'up' });
  t('입력이 오면 다시 진행', ls.pump(g, () => NO_ACTION) === 1);
  ls.receiveInput(2, { move: 'down' }); // 이미 지난 틱은 무시
  t('이미 지난 틱의 입력은 무시', ls.pump(g, () => NO_ACTION) === 0);
}

await server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
