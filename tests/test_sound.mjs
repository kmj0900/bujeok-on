// 효과음 모듈 테스트(가짜 AudioContext 사용): node tests/test_sound.mjs
import { createSound } from '../js/sound.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };
const tick = () => new Promise((r) => setTimeout(r, 0));

function installFake(initial = 'suspended') {
  const log = { created: 0, resumed: 0, started: [] };
  class FakeCtx {
    constructor() { log.created++; this.state = initial; this.currentTime = 0; this.destination = {}; }
    resume() { log.resumed++; this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      const o = { type: '', frequency: { setValueAtTime() {} }, connect: (n) => n, start: () => log.started.push(1), stop() {} };
      return o;
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
  }
  globalThis.AudioContext = FakeCtx;
  return log;
}

{
  delete globalThis.AudioContext; delete globalThis.webkitAudioContext;
  const s = createSound();
  s.play({ type: 'pickup', itemType: 'speed' });
  s.unlock();
  t('오디오를 못 쓰는 환경에서도 오류 없이 지나간다', true);
}
{
  const log = installFake('suspended');
  const s = createSound();
  s.unlock();
  t('입력 순간 unlock으로 컨텍스트를 만들고 재개한다', log.created === 1 && log.resumed === 1);
  s.play({ type: 'pickup', itemType: 'range' });
  await tick();
  t('재생 가능 상태가 된 뒤 3음을 낸다', log.started.length === 3);
  s.play({ type: 'other' });
  await tick();
  t('알 수 없는 이벤트는 소리를 내지 않는다', log.started.length === 3);
}
{
  const log = installFake('running');
  const s = createSound();
  const muted = s.toggle();
  await tick();
  t('끄면 muted이고 소리가 나지 않는다', muted === true && s.muted === true && log.started.length === 0);
  s.play({ type: 'pickup', itemType: 'bomb' });
  await tick();
  t('꺼진 동안 이벤트는 무시된다', log.started.length === 0);
  const m2 = s.toggle();
  await tick();
  t('다시 켜면 확인용 소리(3음)가 난다', m2 === false && log.started.length === 3);
}

{
  const log = installFake('running');
  const s = createSound();
  s.play({ type: 'hazard-warn' });
  await tick();
  const warn = log.started.length;
  s.play({ type: 'hazard-fire' });
  await tick();
  t('수리검 예고음은 짧은 경고음 2번, 발사음은 1번 난다', warn === 2 && log.started.length - warn === 1);
  const m = s.toggle();
  await tick();
  const before = log.started.length;
  s.play({ type: 'hazard-warn' });
  s.play({ type: 'hazard-fire' });
  await tick();
  t('소리를 끄면 수리검 소리도 나지 않는다', m === true && log.started.length === before);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
