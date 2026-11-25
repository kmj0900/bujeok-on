// 두 사람 사이의 실제 지연을 보고 입력 지연(틱)을 정한다. 순수 함수라 Node 테스트로 검증한다.
export const TICK_MS = 1000 / 60;
export const DELAY_MIN = 4;       // 아무리 빨라도 이만큼은 둔다
export const DELAY_MAX = 24;      // 0.4초. 이보다 느린 연결은 재미있게 하기 어렵다
export const DELAY_FALLBACK = 12; // 측정이 안 되면(응답 없음) 해외 서버를 가정한 넉넉한 값

const median = (s) => [...s].sort((a, b) => a - b)[Math.floor(s.length / 2)];
const spread = (s) => Math.max(...s) - Math.min(...s);

// a, b: 각 사람의 왕복 시간 표본(ms) 배열 또는 null.
// 한 사람의 입력이 상대에게 닿는 시간 ≈ (a의 왕복 + b의 왕복) / 2. 거기에 흔들림 여유를 더해 틱으로 올림한다.
export function chooseDelay(a, b) {
  if (!a || !b || !a.length || !b.length) return { delay: DELAY_FALLBACK, oneWayMs: null };
  const oneWayMs = (median(a) + median(b)) / 2;
  const margin = 30 + Math.max(spread(a), spread(b));
  const ticks = Math.ceil((oneWayMs + margin) / TICK_MS);
  return { delay: Math.min(DELAY_MAX, Math.max(DELAY_MIN, ticks)), oneWayMs: Math.round(oneWayMs) };
}
