// 맵별 데이터. 판정 로직은 map.js의 공통 규칙을 사용한다.
export const MAPS = {
  forest: {
    id: 'forest',
    name: '깊은 숲 수련장',
    width: 15,
    height: 13,
    tileSize: 32,
    spawnPoints: [{ x: 1, y: 1 }, { x: 13, y: 11 }],
    // 스폰 및 출구 2방향. 상자·바위와 겹치면 안 된다.
    safeCells: [
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 },
      { x: 13, y: 11 }, { x: 12, y: 11 }, { x: 13, y: 10 },
    ],
    // 외곽 벽은 로더가 만들고, 내부 바위는 시드로 랜덤 배치(2026-11-25): 180도 대칭, 22개, 모든 빈 칸이 이어지게. 예전 고정 배치는 'default-even-grid'
    solidCells: { random: true, count: 22 },
    crateSpawnRate: 0.35,
    theme: { floor: 'grass', solid: 'mossy-rock', breakable: 'wooden-crate', backdrop: 'forest' },
    decorations: [],
    // 맵 위협: 수리검(2026-11-24 확정). 시작 30초 뒤부터 30초마다, 남은 60초부터는 20초마다. 값의 뜻은 docs/12_MAP_SCHEMA.md
    hazard: { type: 'shuriken', startDelay: 30, interval: 30, lateTimeLeft: 60, lateInterval: 20, warnTime: 1.5, speed: 20 },
  },
  // 폭포 계곡(2026-11-25 추가). 구조·규칙은 깊은 숲과 같고, 위협만 물살(밀어내기)이다. 타일은 theme.sheet의 전용 시트를 쓴다.
  waterfall: {
    id: 'waterfall',
    name: '폭포 계곡 수련장',
    width: 15,
    height: 13,
    tileSize: 32,
    spawnPoints: [{ x: 1, y: 1 }, { x: 13, y: 11 }],
    safeCells: [
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 },
      { x: 13, y: 11 }, { x: 12, y: 11 }, { x: 13, y: 10 },
    ],
    solidCells: { random: true, count: 22 },
    crateSpawnRate: 0.35,
    // 전용 타일 시트(tiles_waterfall.png): 돌길 바닥, 계곡 바위, 통나무 뗏목(부서지는 칸), 절벽 테두리(2종), 위쪽 테두리 3~11열은 폭포(6번 칸)
    theme: { floor: 'stone-path', solid: 'valley-rock', breakable: 'log-raft', backdrop: 'waterfall', sheet: 'tilesWaterfall', borderCells: 2, borderStyle: { type: 'waterfall', sheet: 'bordersWaterfall', fall: { from: 5, to: 9, speed: 28 } }, topCell: { cell: 6, from: 3, to: 11, speed: 28 }, puddles: { cells: [7, 8], rate: 20 }, splash: { cell: 9, from: 3, to: 11 } },
    decorations: [],
    // 물살(2026-11-25 확정): 시작 20초 뒤부터 20초 간격, 남은 60초부터 15초 간격(한 판 9번). 물은 2초 흐르고, 닿은 닌자는 경과 시간 0~60초 1칸, 60~120초 2칸, 120초 이후 3칸 밀림. 값의 뜻은 docs/12_MAP_SCHEMA.md
    hazard: { type: 'current', startDelay: 20, interval: 20, lateTimeLeft: 60, lateInterval: 15, warnTime: 1.5, flowDuration: 2.0, pushInterval: 0.3, pushSteps: [[0, 1], [60, 2], [120, 3]] },
  },
  // 바위산(2026-11-25 추가): 구조·규칙은 깊은 숲과 같고, 위협만 낙석이다. 타일은 theme.sheet의 전용 시트(황토 흙길·갈색 바위·광산 상자·산 절벽 3종)를 쓴다.
  mountain: {
    id: 'mountain',
    name: '바위산 수련장',
    width: 15,
    height: 13,
    tileSize: 32,
    spawnPoints: [{ x: 1, y: 1 }, { x: 13, y: 11 }],
    safeCells: [
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 },
      { x: 13, y: 11 }, { x: 12, y: 11 }, { x: 13, y: 10 },
    ],
    solidCells: { random: true, count: 22 },
    crateSpawnRate: 0.35,
    theme: { floor: 'dry-dirt', solid: 'boulder', breakable: 'mine-crate', backdrop: 'mountain', sheet: 'tilesMountain', borderCells: 3, borderStyle: { type: 'mountain', sheet: 'bordersMountain', cloudSpeed: 5 } },
    decorations: [],
    // 낙석(2026-11-25 확정): 시작 25초 뒤부터 25초 간격, 남은 60초부터 15초 간격(한 판 약 8번). 예고 1.5초 뒤 바닥 칸 몇 개에 돌이 떨어져 선 닌자에게 하트 1개 피해. 돌 개수는 경과 시간 0~60초 2개, 60~120초 3개, 120초 이후 4개. 값의 뜻은 docs/12_MAP_SCHEMA.md
    hazard: { type: 'rockfall', startDelay: 25, interval: 25, lateTimeLeft: 60, lateInterval: 15, warnTime: 1.5, fallTime: 0.4, rockCounts: [[0, 3], [60, 5], [120, 7]] },
  },
};
