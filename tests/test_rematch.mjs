// 방 상태 정리 + 한 판 더(재대결) + 맵 바꾸기 테스트: 서버의 방 상태(waiting/starting/playing/result)를 실제 연결로 확인한다.
import WebSocket from 'ws';
import { createServer } from '../server/server.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ' ' + extra)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(port) { this.msgs = []; this.waiters = []; this.closed = false; this.ws = new WebSocket(`ws://127.0.0.1:${port}`); this.ws.on('message', (d) => this.push(JSON.parse(d.toString()))); this.ws.on('close', () => { this.closed = true; }); }
  open() { return new Promise((r, j) => { this.ws.once('open', r); this.ws.once('error', j); }); }
  push(m) {
    if (m.t === 'ping') { if (!this.noPong) setTimeout(() => this.ws.readyState === 1 && this.send({ t: 'pong', id: m.id }), this.pongDelay ?? 0); return; }
    const i = this.waiters.findIndex((w) => w.type === m.t); if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m); else this.msgs.push(m); }
  send(m) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  next(type, ms = 3000) {
    const i = this.msgs.findIndex((m) => m.t === type);
    if (i >= 0) return Promise.resolve(this.msgs.splice(i, 1)[0]);
    return new Promise((resolve, reject) => { const w = { type, resolve }; this.waiters.push(w); setTimeout(() => { const k = this.waiters.indexOf(w); if (k >= 0) { this.waiters.splice(k, 1); reject(new Error('timeout: ' + type)); } }, ms); });
  }
  has(type) { return this.msgs.some((m) => m.t === type); }
  close() { this.ws.close(); }
}
const connect = async (port) => { const c = new Client(port); await c.open(); return c; };
const server = await createServer({ port: 0, host: '127.0.0.1' });
const port = server.port;
const room = (code) => server.rooms.get(code);

async function startedRoom(mapId = 'forest') {
  const a = await connect(port), b = await connect(port);
  a.send({ t: 'create', mapId }); const { code } = await a.next('created');
  b.send({ t: 'join', code });
  const [sa, sb] = await Promise.all([a.next('start'), b.next('start')]);
  return { a, b, code, sa, sb };
}

// ---------- 방 잠김 수정: 시작 직전에 입장자가 나가면 방이 다시 열린다
{
  const a = await connect(port), b = await connect(port), c = await connect(port);
  b.pongDelay = 400; // 측정이 오래 걸리게
  a.send({ t: 'create', mapId: 'mountain' }); const { code } = await a.next('created');
  b.send({ t: 'join', code }); await b.next('joined'); await sleep(100);
  b.close();
  t('입장자가 나가면 방장에게 peer_left', (await a.next('peer_left')).t === 'peer_left');
  t('시작 직전에 나가면 방이 waiting 상태로 돌아간다', room(code)?.phase === 'waiting');
  c.send({ t: 'join', code });
  const [joined, sa, sc] = await Promise.all([c.next('joined'), a.next('start', 4000), c.next('start', 4000)]);
  t('같은 코드로 새 친구가 들어와 정상 시작(방이 잠기지 않음)', joined.slot === 1 && sa.mapId === 'mountain' && sa.seed === sc.seed);
  t('나간 사람의 옛 측정 때문에 start가 두 번 오지 않는다', (await sleep(1500), !a.has('start') && !c.has('start')));
  a.close(); c.close(); await sleep(100);
}

// ---------- 판 중에 입장자가 나가면 방은 다시 열리고, 방장이 나가면 방이 닫힌다
{
  const { a, b, code } = await startedRoom();
  b.close(); await a.next('peer_left'); await sleep(50);
  t('판 중에 입장자가 나가도 방은 다시 열린다(방장만 남음)', room(code)?.phase === 'waiting' && room(code).players[1] === null);
  const c = await connect(port); c.send({ t: 'join', code });
  const [, , sc] = await Promise.all([c.next('joined'), a.next('start', 4000), c.next('start', 4000)]);
  t('그 방에 새 친구가 들어와 새 판을 시작', sc.slot === 1);
  a.close(); await c.next('peer_left'); await sleep(50);
  t('방장이 나가면 방이 삭제되고 남은 사람도 나간 상태', !room(code));
  c.close(); await sleep(50);
}

// ---------- 결과 상태와 한 판 더
{
  const { a, b, code, sa } = await startedRoom('forest');
  t('시작하면 phase는 playing', room(code).phase === 'playing');
  a.send({ t: 'again' }); await sleep(100);
  t('판이 끝나기 전(done 전)의 again은 무시', !b.has('peer_again') && room(code).phase === 'playing');
  a.send({ t: 'done' }); await sleep(50);
  t('done을 받으면 phase는 result', room(code).phase === 'result');
  b.send({ t: 'done' }); await sleep(50);
  t('두 번째 done은 무시(상태 그대로)', room(code).phase === 'result');
  a.send({ t: 'in', tick: 3, a: { move: 'up' } }); await sleep(100);
  t('결과 상태에서 늦게 온 입력은 중계하지 않는다', !b.has('in'));
  a.send({ t: 'again' });
  t('한쪽이 again을 누르면 상대에게 peer_again', (await b.next('peer_again')).t === 'peer_again');
  b.send({ t: 'again' });
  const [ra, rb] = await Promise.all([a.next('start', 4000), b.next('start', 4000)]);
  t('둘 다 again이면 새 판 시작: 같은 방·같은 번호, 새 시드', ra.slot === 0 && rb.slot === 1 && ra.seed === rb.seed && ra.seed !== sa.seed && ra.mapId === 'forest');
  t('새 판이 시작되면 phase는 playing으로 돌아간다', room(code).phase === 'playing');
  a.send({ t: 'in', tick: 4, a: { move: 'left', placeBomb: false } });
  t('새 판에서는 입력이 다시 중계된다', (await b.next('in')).tick === 4);
  a.close(); b.close(); await sleep(100);
}

// ---------- 맵 바꾸기
{
  const { a, b, code } = await startedRoom('forest');
  a.send({ t: 'done' }); b.send({ t: 'done' }); await sleep(50);
  b.send({ t: 'map', mapId: 'mountain' }); await sleep(100);
  t('입장자는 맵을 바꿀 수 없다', room(code).mapId === 'forest' && !a.has('map'));
  a.send({ t: 'map', mapId: '없는맵' });
  t('없는 맵은 bad-map 오류', (await a.next('error')).code === 'bad-map' && room(code).mapId === 'forest');
  b.send({ t: 'again' }); await a.next('peer_again');
  a.send({ t: 'map', mapId: 'waterfall' });
  const [ma, mb] = await Promise.all([a.next('map'), b.next('map')]);
  t('방장이 맵을 바꾸면 두 사람 모두 알림', ma.mapId === 'waterfall' && mb.mapId === 'waterfall');
  t('맵을 바꾸면 입장자의 준비는 풀리고 방장은 준비된 것으로 본다', room(code).again[0] === true && room(code).again[1] === false);
  await sleep(300);
  t('입장자가 다시 준비하기 전에는 시작하지 않는다', !a.has('start') && !b.has('start') && room(code).phase === 'result');
  b.send({ t: 'again' });
  const [ra, rb] = await Promise.all([a.next('start', 4000), b.next('start', 4000)]);
  t('입장자가 다시 준비하면 바뀐 맵으로 시작', ra.mapId === 'waterfall' && rb.mapId === 'waterfall' && ra.seed === rb.seed);
  a.send({ t: 'map', mapId: 'forest' }); await sleep(100);
  t('판 중에는 맵을 바꿀 수 없다', room(code).mapId === 'waterfall' && !b.has('map'));
  a.close(); b.close(); await sleep(100);
}

// ---------- 결과 화면에서 상대가 나가면
{
  const { a, b, code } = await startedRoom('forest');
  a.send({ t: 'done' }); b.send({ t: 'done' }); a.send({ t: 'again' }); await sleep(100);
  b.close(); await a.next('peer_left'); await sleep(50);
  t('결과 대기 중 입장자가 나가면 방이 waiting으로 열리고 준비 표시가 지워진다', room(code).phase === 'waiting' && !room(code).again[0] && !room(code).again[1]);
  a.send({ t: 'again' }); a.send({ t: 'map', mapId: 'mountain' }); await sleep(100);
  t('waiting 상태에서 again·map은 무시', room(code).phase === 'waiting' && room(code).mapId === 'forest');
  a.close(); await sleep(50);
}

await server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
