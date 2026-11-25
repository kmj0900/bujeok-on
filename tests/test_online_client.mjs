// 브라우저용 연결 코드(js/online.js)를 실제 서버에 붙여 검증한다. Node 22의 내장 WebSocket을 쓴다(브라우저와 같은 API).
import { createServer } from '../server/server.js';
import { createOnline, errorText, defaultUrl } from '../js/online.js';
import { createLockstep, stateHash } from '../js/lockstep.js';
import { MAPS } from '../js/maps.js';
import { loadMap } from '../js/map.js';
import { createGame } from '../js/game.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ' ' + extra)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred, ms = 3000) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await sleep(5); return pred(); };

const server = await createServer({ port: 0, host: '127.0.0.1' });
const url = `ws://127.0.0.1:${server.port}`;

t('defaultUrl: http→ws, https→wss', defaultUrl({ protocol: 'http:', host: 'a:1' }) === 'ws://a:1' && defaultUrl({ protocol: 'https:', host: 'x.onrender.com' }) === 'wss://x.onrender.com');
t('오류 코드마다 한글 문구가 있음', ['no-such-room', 'room-full', 'connect-failed', 'bad-code', 'server-full', 'bad-map'].every((c) => errorText(c).length > 4) && errorText('???').length > 0);

// 연결 실패(아무도 안 듣는 포트)
{
  let err = null;
  const net = createOnline({ url: 'ws://127.0.0.1:1', onError: (c) => { err = c; } });
  let rejected = false; try { await net.create('forest'); } catch (e) { rejected = e.message === 'connect-failed'; }
  t('서버가 없으면 connect-failed로 거절됨', rejected);
}

// 방 만들기·입장·시작
const A = { starts: [], peerLeft: 0, errors: [], closed: 0 }, B = { starts: [], peerLeft: 0, errors: [], closed: 0 };
const mk = (S) => { S.agains = 0; S.maps = []; return createOnline({ url, onCreated: (m) => { S.created = m; }, onJoined: (m) => { S.joined = m; }, onStart: (m) => S.starts.push(m), onPeerLeft: () => S.peerLeft++, onPeerAgain: () => S.agains++, onMap: (m) => S.maps.push(m), onError: (c) => S.errors.push(c), onClose: () => S.closed++ }); };
const a = mk(A), b = mk(B);
await a.create('mountain');
await waitFor(() => A.created);
t('방 만들기: 코드·1P 번호가 net에 기록됨', /^[A-Z2-9]{4}$/.test(a.code) && a.slot === 0 && A.created.mapId === 'mountain');

const bad = mk({ starts: [], errors: [], peerLeft: 0 }); // 4글자가 아니면 서버에 가지 않고 거절
let badErr = null; const bad2 = createOnline({ url, onError: (c) => { badErr = c; } }); await bad2.join('AB');
t('4글자가 아닌 코드는 서버에 가기 전에 bad-code', badErr === 'bad-code');

await b.join(a.code.toLowerCase() + ' ');
await waitFor(() => A.starts.length && B.starts.length, 4000);
t('입장하면 두 쪽 모두 start를 받음(같은 맵·시드·입력 지연)', A.starts[0].seed === B.starts[0].seed && A.starts[0].mapId === 'mountain' && A.starts[0].delay === B.starts[0].delay && A.starts[0].delay >= 1);
t('2P 번호는 1', b.slot === 1 && B.starts[0].slot === 1);

// 락스텝으로 실제 한 판 진행: 두 쪽 모두 online.js 경유
{
  const mkSide = (net, st) => { const ls = createLockstep({ slot: st.slot, delay: st.delay }); net.setLockstep(ls); return { net, ls, game: createGame(loadMap(MAPS[st.mapId], st.seed)) }; };
  const L = [mkSide(a, A.starts[0]), mkSide(b, B.starts[0])];
  const acts = [{ move: 'right', placeBomb: false }, { move: 'left', placeBomb: true }];
  const T0 = Date.now();
  while (L.some((s) => s.ls.simTick < 900) && Date.now() - T0 < 20000) {
    L.forEach((s, i) => { if (s.ls.simTick < 900) s.ls.pump(s.game, () => acts[i], 900 - s.ls.simTick); for (const m of s.ls.outbox.splice(0)) s.net.send(m); });
    await sleep(2);
  }
  await sleep(100);
  t('online.js 경유 락스텝: 900틱까지 진행', L.every((s) => s.ls.simTick === 900), L.map((s) => s.ls.simTick).join());
  t('online.js 경유 락스텝: 두 쪽 상태 동일·어긋남 없음', stateHash(L[0].game) === stateHash(L[1].game) && L.every((s) => s.ls.desyncTick === null));
}

// 한 판 더·맵 바꾸기: online.js의 done/again/setMap과 peer_again/map 알림, 새 start
{
  const before = { a: A.starts.length, b: B.starts.length };
  a.done(); b.done(); await sleep(50);
  a.again();
  await waitFor(() => B.agains === 1);
  t('한쪽이 again을 보내면 상대의 onPeerAgain이 불림', B.agains === 1 && A.agains === 0);
  a.setMap('forest');
  await waitFor(() => A.maps.length && B.maps.length);
  t('방장이 setMap하면 두 쪽 모두 onMap으로 새 맵을 받음', A.maps[0].mapId === 'forest' && B.maps[0].mapId === 'forest');
  b.again();
  await waitFor(() => A.starts.length > before.a && B.starts.length > before.b, 4000);
  const s2 = A.starts.at(-1), s3 = B.starts.at(-1);
  t('둘 다 again이면 같은 연결로 새 start(바뀐 맵·새 시드, 번호 유지)', s2.mapId === 'forest' && s3.mapId === 'forest' && s2.seed === s3.seed && s2.seed !== A.starts[0].seed && s2.slot === 0 && s3.slot === 1 && a.slot === 0 && b.slot === 1);
  b.setMap('mountain'); await sleep(100);
  t('입장자의 setMap은 무시되어 맵이 바뀌지 않음', A.maps.length === 1 && B.maps.length === 1);
}
// 나가기
a.leave();
await waitFor(() => B.peerLeft);
t('상대가 나가면 onPeerLeft', B.peerLeft === 1);
t('내가 나간 경우에는 onClose가 불리지 않음', A.closed === 0);
b.leave();

// 서버가 죽으면 onClose
{
  const C = { closed: 0, starts: [] }; const c1 = createOnline({ url, onClose: () => C.closed++, onCreated: () => {} });
  await c1.create('forest'); await sleep(50);
  await server.close(); await waitFor(() => C.closed);
  t('서버가 끊기면 onClose', C.closed === 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
