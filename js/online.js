// 온라인 대전 네트워크 연결(브라우저 WebSocket). 화면과 무관해서 Node 22의 WebSocket으로도 테스트한다.
const ERROR_TEXT = {
  'no-such-room': '그런 방이 없다. 코드를 다시 확인해 보자',
  'room-full': '방이 이미 가득 찼다',
  'server-full': '서버에 방이 너무 많다. 잠시 뒤에 다시 해 보자',
  'already-in-room': '이미 방에 들어와 있다',
  'connect-failed': '서버에 연결하지 못했다',
  'bad-code': '방 코드는 4글자다',
  'bad-map': '그런 수련장은 없다',
};
export const errorText = (code) => ERROR_TEXT[code] ?? '알 수 없는 오류가 생겼다';

export function defaultUrl(loc = globalThis.location) {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}`;
}

// handlers: onCreated(m), onJoined(m), onStart(m), onPeerJoined(), onPeerLeft(), onPeerAgain(), onMap(m), onError(code), onClose()
export function createOnline({ url = defaultUrl(), WebSocketImpl = globalThis.WebSocket, ...handlers } = {}) {
  let ws = null, lockstep = null, opened = false, leaving = false;
  const api = {
    code: null,
    slot: -1,
    setLockstep(ls) { lockstep = ls; },
    connect() {
      return new Promise((resolve, reject) => {
        try { ws = new WebSocketImpl(url); } catch { reject(new Error('connect-failed')); return; }
        ws.onopen = () => { opened = true; resolve(); };
        ws.onerror = () => { if (!opened) reject(new Error('connect-failed')); };
        ws.onclose = () => { if (!opened) reject(new Error('connect-failed')); else if (!leaving) handlers.onClose?.(); };
        ws.onmessage = (ev) => {
          let m; try { m = JSON.parse(ev.data); } catch { return; }
          switch (m.t) {
            case 'created': api.code = m.code; api.slot = m.slot; handlers.onCreated?.(m); break;
            case 'joined': api.code = m.code; api.slot = m.slot; handlers.onJoined?.(m); break;
            case 'start': handlers.onStart?.(m); break;
            case 'in': lockstep?.receiveInput(m.tick, m.a); break;
            case 'hash': lockstep?.receiveHash(m.tick, m.h); break;
            case 'ping': api.send({ t: 'pong', id: m.id }); break;
            case 'peer_joined': handlers.onPeerJoined?.(); break;
            case 'peer_left': handlers.onPeerLeft?.(); break;
            case 'peer_again': handlers.onPeerAgain?.(); break;
            case 'map': handlers.onMap?.(m); break;
            case 'error': handlers.onError?.(m.code); break;
          }
        };
      });
    },
    send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
    async create(mapId) { await api.connect(); api.send({ t: 'create', mapId }); },
    async join(code) {
      const c = String(code ?? '').trim().toUpperCase();
      if (c.length !== 4) { handlers.onError?.('bad-code'); return; }
      await api.connect(); api.send({ t: 'join', code: c });
    },
    done() { api.send({ t: 'done' }); },            // 내 화면에서 판이 끝났다
    again() { api.send({ t: 'again' }); },          // 결과 화면에서 한 판 더
    setMap(mapId) { api.send({ t: 'map', mapId }); }, // 방장만: 다음 판 맵 바꾸기
    leave() { leaving = true; if (ws) { api.send({ t: 'leave' }); try { ws.close(); } catch { /* 이미 닫힘 */ } } },
  };
  return api;
}
