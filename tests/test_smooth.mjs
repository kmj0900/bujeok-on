// 온라인 프레임 계산량 제한: 멈췄다 풀려도 한 프레임에 2틱까지만 계산하고, 밀린 시간은 버려서 한꺼번에 따라잡지 않는다.
import { tickBudget, remainingAcc, MAX_BACKLOG_TICKS } from '../js/lockstep.js';
let pass = 0, fail = 0;
const t = (n, c, e = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' ' + e)); };
const STEP = 1 / 60;
t('상한은 2틱', MAX_BACKLOG_TICKS === 2);
t('평소(60fps) 프레임은 1틱', tickBudget(STEP + 1e-9, STEP) === 1);
t('프레임이 짧으면(144Hz) 0틱도 가능', tickBudget(0.007, STEP) === 0);
t('0.25초 밀려도 한 프레임에 2틱만', tickBudget(0.25, STEP) === 2);
t('큰 프레임 지연 뒤 밀린 시간은 2틱까지만 남는다', Math.abs(remainingAcc(0.25, 2, STEP) - 2 * STEP) < 1e-9);
t('멈춰서 0틱이면 쌓인 시간은 2틱으로 줄어든다', Math.abs(remainingAcc(0.4, 0, STEP) - 2 * STEP) < 1e-9);
t('정상 진행이면 남는 시간은 그대로(계산한 만큼만 뺌)', Math.abs(remainingAcc(STEP * 1.3, 1, STEP) - STEP * 0.3) < 1e-9);
// 시뮬레이션: 0.5초 멈춤 뒤 풀리는 순간, 프레임마다 계산하는 틱이 2를 넘지 않고 합계가 밀린 시간(30틱)보다 훨씬 적다
{
  let acc = 0, total = 0, maxPer = 0;
  for (let f = 0; f < 30; f++) { acc += STEP; acc = remainingAcc(acc, 0, STEP); } // 0.5초 멈춤(계산 0틱)
  for (let f = 0; f < 10; f++) { acc += STEP; const w = tickBudget(acc, STEP); acc = remainingAcc(acc, w, STEP); total += w; maxPer = Math.max(maxPer, w); }
  t('멈춤이 풀린 뒤 10프레임: 프레임당 최대 2틱', maxPer <= 2, String(maxPer));
  t('멈춤이 풀린 뒤 10프레임 합계가 12틱 이하(30틱을 몰아서 따라잡지 않음)', total <= 12, String(total));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
