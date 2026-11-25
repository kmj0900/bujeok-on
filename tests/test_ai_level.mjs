// AI 난이도(쉬움·보통) 테스트
import { MAPS } from '../js/maps.js';
import { loadMap, createRng, Tile } from '../js/map.js';
import { createGame, updateGame, Phase, STEP } from '../js/game.js';
import { PlayerState } from '../js/player.js';
import { createAI, AI_LEVELS } from '../js/ai.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

// ---------- 1) 설정값
t('보통은 기존 값(판단 0.2초·여유 0.15초·공격 60·연타 0.14초·멈춤 없음)', (() => {
  const n = AI_LEVELS.normal;
  return n.decisionInterval === 0.2 && n.margin === 0.15 && n.enemyScore === 60 && n.struggleInterval === 0.14 && n.idleChance === 0;
})());
t('쉬움은 보통보다 느리고(판단 주기↑) 여유·공격·연타 모두 약하다', (() => {
  const n = AI_LEVELS.normal, e = AI_LEVELS.easy;
  return e.decisionInterval > n.decisionInterval && e.margin < n.margin && e.enemyScore < n.enemyScore && e.struggleInterval > n.struggleInterval && e.idleChance > 0 && e.idleMin > 0 && e.idleMax >= e.idleMin;
})());
t('모르는 난이도 이름은 보통으로 처리', (() => {
  const a = createAI(1, createRng(5), 'unknown'), b = createAI(1, createRng(5), 'normal');
  const map = loadMap(MAPS.forest, 3);
  const g1 = createGame(map, { countdown: 0, hazards: false }), g2 = createGame(loadMap(MAPS.forest, 3), { countdown: 0, hazards: false });
  for (let i = 0; i < 300; i++) if (JSON.stringify(a.getAction(g1, STEP)) !== JSON.stringify(b.getAction(g2, STEP))) return false;
  return true;
})());

// ---------- 2) 기본값(생략)과 'normal'은 완전히 같은 행동
{
  let same = true;
  for (let seed = 1; seed <= 5; seed++) {
    const ga = createGame(loadMap(MAPS.forest, seed), { countdown: 0, hazardStart: 10 });
    const gb = createGame(loadMap(MAPS.forest, seed), { countdown: 0, hazardStart: 10 });
    const a0 = createAI(0, createRng(seed * 11)), a1 = createAI(1, createRng(seed * 13));
    const b0 = createAI(0, createRng(seed * 11), 'normal'), b1 = createAI(1, createRng(seed * 13), 'normal');
    for (let i = 0; i < 1500 && ga.phase === Phase.PLAYING; i++) {
      const xa = [a0.getAction(ga, STEP), a1.getAction(ga, STEP)], xb = [b0.getAction(gb, STEP), b1.getAction(gb, STEP)];
      if (JSON.stringify(xa) !== JSON.stringify(xb)) same = false;
      updateGame(ga, xa); updateGame(gb, xb);
    }
  }
  t('난이도를 생략하면 보통과 똑같이 행동한다', same);
}

// ---------- 3) 쉬움 AI 전체 판 완주(쉬움끼리·쉬움 vs 보통), 벽 통과·예외 없음
for (const [la, lb] of [['easy', 'easy'], ['easy', 'normal']]) {
  let allFloor = true, finished = 0, error = null;
  for (let seed = 1; seed <= 20; seed++) {
    try {
      const map = loadMap(MAPS.forest, seed);
      const g = createGame(map, { countdown: 0, hazardStart: 10 });
      const ais = [createAI(0, createRng(seed * 11), la), createAI(1, createRng(seed * 13), lb)];
      for (let i = 0; i < 12000 && g.phase === Phase.PLAYING; i++) {
        updateGame(g, [ais[0].getAction(g, STEP), ais[1].getAction(g, STEP)]);
        for (const p of g.players) if (p.state !== PlayerState.ELIMINATED && map.grid[p.y][p.x] !== Tile.FLOOR) allFloor = false;
      }
      if (g.phase === Phase.RESULT) finished++;
    } catch (e) { error = e; }
  }
  t(`${la} vs ${lb}: 20판 모두 정상 종료·오류 없음`, finished === 20 && !error, `종료 ${finished}/20${error ? ' ' + error.message : ''}`);
  t(`${la} vs ${lb}: 벽·상자 위로 이동하지 않음`, allFloor);
}

// ---------- 4) 쉬움은 멈추는 시간이 많고, 보통은 거의 쉬지 않는다
function idleRatio(level) {
  let idle = 0, total = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const g = createGame(loadMap(MAPS.forest, seed), { countdown: 0, hazards: false });
    const ai = createAI(1, createRng(seed * 13), level);
    for (let i = 0; i < 1500 && g.phase === Phase.PLAYING; i++) {
      const a = ai.getAction(g, STEP);
      updateGame(g, [{ move: null, placeBomb: false }, a]);
      total++;
      if (!a.move && !a.placeBomb) idle++;
    }
  }
  return idle / total;
}
{
  const e = idleRatio('easy'), n = idleRatio('normal');
  t('쉬움이 보통보다 가만히 있는 비율이 높다', e > n + 0.05, `쉬움 ${(e * 100).toFixed(1)}% / 보통 ${(n * 100).toFixed(1)}%`);
}

// ---------- 5) 위험하면 쉬움도 멈춰 있지 않고 피한다(멈춤 중에도 새 부적이 생기면 풀린다)
{
  let survived = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = createGame(loadMap(MAPS.forest, seed), { countdown: 0, hazards: false });
    const me = g.players[1];
    const ai = createAI(1, createRng(seed), 'easy');
    // 상대(0번)가 AI 바로 옆에 부적을 놓는다
    for (let i = 0; i < 40; i++) updateGame(g, [{ move: null, placeBomb: false }, ai.getAction(g, STEP)]);
    g.bombs.push({ id: g.nextBombId++, ownerId: 0, x: me.x, y: me.y, fuse: 2.0, range: 2 });
    for (let i = 0; i < Math.round(3 / STEP) && g.phase === Phase.PLAYING; i++) updateGame(g, [{ move: null, placeBomb: false }, ai.getAction(g, STEP)]);
    if (me.hp === 4 || me.state === PlayerState.NORMAL && me.hp > 0) survived++;
  }
  t('발밑에 부적이 생겨도 쉬움 AI가 대부분 피한다(20번 중 16번 이상 체력 유지)', survived >= 16, `${survived}/20`);
}

// ---------- 6) 봉인 탈출 연타 간격: 보통 0.14초, 쉬움 0.22초
function struggles(level) {
  const g = createGame(loadMap(MAPS.forest, 1), { countdown: 0, hazards: false });
  const ai = createAI(1, createRng(1), level);
  g.players[1].state = PlayerState.SEALED; g.players[1].sealTimer = 99;
  let n = 0;
  for (let i = 0; i < Math.round(2 / STEP); i++) if (ai.getAction(g, STEP).struggle) n++;
  return n;
}
{
  const n = struggles('normal'), e = struggles('easy');
  t('봉인 2초 동안 보통은 16번 가까이 연타(8·12회는 풀림)', n >= 13 && n <= 15, `${n}회`);
  t('봉인 2초 동안 쉬움은 12회 미만 연타(12회 봉인부터는 못 풂)', e >= 8 && e < 12, `${e}회`);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
