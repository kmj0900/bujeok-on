// 효과음: 외부 파일 없이 Web Audio로 짧은 소리를 합성한다(저작권·네트워크 의존 없음).
// 브라우저는 사용자 입력 뒤에야 소리를 허용하므로 AudioContext는 처음 재생할 때 만든다.
// 오디오를 쓸 수 없는 환경에서는 조용히 아무것도 하지 않는다.
const NOTES = {
  speed: [659, 784, 988],  // 경공술: 높고 가벼운 소리
  range: [523, 659, 784],  // 화약 강화
  bomb: [440, 554, 659],   // 부적 두루마리
};

export function createSound() {
  let ctx = null;
  let muted = false;

  function audio() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { ctx = null; }
    return ctx;
  }

  // endFreq를 주면 소리 높이가 freq에서 endFreq로 미끄러진다(발사음).
  function tone(freq, start, len, type = 'triangle', vol = 0.12, endFreq = 0) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + start;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && osc.frequency.exponentialRampToValueAtTime) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + len);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + len + 0.02);
  }

  // 컨텍스트가 실제로 재생 가능한 상태(running)가 된 뒤에 fn을 실행한다.
  // 일시 중단(suspended) 상태에서 예약하면 시작 시각이 지나가 버려 소리가 사라질 수 있다.
  function whenRunning(fn) {
    const a = audio();
    if (!a) return;
    if (a.state === 'running') fn();
    else a.resume().then(fn).catch(() => {});
  }

  function chime(itemType) {
    (NOTES[itemType] ?? NOTES.range).forEach((f, i) => tone(f, i * 0.06, 0.12));
  }

  // 수리검 예고: 짧은 경고음 두 번 / 발사: 높은 소리에서 낮은 소리로 가르는 소리
  const warn = () => { tone(880, 0, 0.09, 'square', 0.07); tone(880, 0.16, 0.09, 'square', 0.07); };
  const fire = () => tone(1400, 0, 0.28, 'sawtooth', 0.06, 260);

  return {
    // 키보드·마우스 입력 순간에 호출해 브라우저의 자동재생 제한을 풀어 둔다(소리는 사용자 입력 뒤에만 허용된다).
    unlock() {
      const a = audio();
      if (a && a.state === 'suspended') a.resume().catch(() => {});
    },
    // 게임 이벤트({ type, itemType })를 소리로 바꾼다.
    play(event) {
      if (muted) return;
      if (event.type === 'pickup') whenRunning(() => chime(event.itemType));
      else if (event.type === 'hazard-warn') whenRunning(warn);
      else if (event.type === 'hazard-fire') whenRunning(fire);
    },
    // 끄고 켜기. 켤 때는 확인용 소리를 한 번 낸다.
    toggle() {
      muted = !muted;
      if (!muted) whenRunning(() => chime('speed'));
      return muted;
    },
    get muted() { return muted; },
  };
}
