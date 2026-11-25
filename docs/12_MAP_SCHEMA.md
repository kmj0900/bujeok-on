# 맵 데이터 계약 및 검증

## 데이터 구조
```js
{
  id: 'forest', name: '깊은 숲 수련장',
  width: 15, height: 13, tileSize: 32,
  spawnPoints: [{x:1,y:1},{x:13,y:11}],
  solidCells: [{x:2,y:2}],   // 또는 'default-even-grid'(짝수 좌표 고정) 또는 { random: true, count: 22 }(시드 랜덤, 180도 대칭, 모든 빈 칸 연결 보장, 2026-11-25)
  crateSpawnRate: 0.35,
  crateCandidates: [], // 생략 시 통행 가능한 후보 자동 계산
  theme: { floor:'grass', solid:'mossy-rock', breakable:'wooden-crate', backdrop:'forest' },
  decorations: [],
  hazard: { // 맵 위협(선택). 없으면 위협 없음
    type: 'shuriken',
    startDelay: 30,      // 시작 후 첫 발생까지(초)
    interval: 30,        // 이후 간격(초)
    lateTimeLeft: 60,    // 남은 시간이 이 값 이하가 되면
    lateInterval: 20,    // 이 간격으로 단축
    warnTime: 1.5,       // 예고 시간(초)
    speed: 20            // 비행 속도(칸/초). 수리검은 바위·상자에 막히지 않고 줄 전체를 지나간다
  },
  // type: 'current'(물살, 폭포 계곡)이면 speed 대신 flowDuration(물이 흐르는 시간, 기본 2.0초), pushInterval(한 칸 미는 간격, 기본 0.3초)과 pushSteps(경과 시간별 한 명이 밀리는 칸 수, 기본 [[0,1],[60,2],[120,3]])를 쓴다. 흐르는 동안 줄에 닿은 닌자는 칸 수만큼 밀리고, 막히면 계속 시도한다.
  // type: 'rockfall'(낙석, 바위산)이면 speed 대신 fallTime(돌이 떨어져 부서지는 연출 시간, 기본 0.4초)과 rockCounts(경과 시간별 한 번에 떨어지는 돌 수, 기본 [[0,3],[60,5],[120,7]])를 쓴다. 예고 칸에 그림자가 지고 warnTime 뒤 돌이 떨어지며, 그 칸에 있던 닌자만 ROCK_DAMAGE(1)를 받는다. 돌은 남지 않고 칸 판정은 그대로다.
  // theme.borderStyle(선택): 폭포 계곡 { type:'waterfall', sheet:'bordersWaterfall', fall:{ from:5, to:9, speed:28 } }, 바위산 { type:'mountain', sheet:'bordersMountain', cloudSpeed:5 }이면 외곽 띠를 방향별 전용 타일(암벽·폭포·물길·수풀·모서리)로 그린다. 그래픽 전용이며 판정은 그대로. 없는 맵은 borderCells 방식.
  // theme.tint: 타일 위에 덮는 색(예: 'rgba(40,110,170,0.22)'). 전용 타일이 생기기 전 임시 구분용이다.
  seed: 12345 // 테스트 시에만 고정
}
```

## 필수 검증
1. `width=15`, `height=13`, `tileSize=32` 및 좌표 정수·범위 확인.
2. 외곽은 `SOLID`; 내부 기본 바위는 x와 y가 모두 짝수인 좌표 30개. 다른 맵은 명시된 고정 장애물 배치를 사용해도 된다.
3. 두 스폰 및 안전 칸 `(1,1),(2,1),(1,2),(13,11),(12,11),(13,10)`은 상자·바위와 겹치지 않는다.
4. 상자는 내부 바닥에서 안전 칸과 고정 장애물을 제외한 **후보 칸의 35%**에만 배치한다.
5. 생성 후 스폰에서 이동 가능한 빈칸 BFS 수행. 양쪽 스폰에 최소 두 개의 출구가 있고 접근 가능한 상자 인접 칸이 하나 이상 있어야 한다. 실패 시 시드를 바꿔 재생성.
6. 동일한 시드와 맵 ID로 동일한 배치 재현. 테스트 로그에 시드 기록.
7. 맵별 타일 그래픽만 다르게 하고 `FLOOR/SOLID/BREAKABLE`의 충돌·폭발 판정은 공유.
8. 폭포·물·절벽은 전투 영역 바깥 장식. 물 타일 특수 규칙은 MVP에서 제외. (2026-11-24부터 맵마다 `hazard`로 위협을 둘 수 있다. 위협은 타일 충돌·폭발 판정을 바꾸지 않고 `damagePlayer`로만 피해를 준다.)
9. `hazard`가 있으면 `type`(`shuriken`, `current` 또는 `rockfall`)에 대응하는 위협 구현이 있어야 하고, 시간·속도 값은 양수여야 한다.
10. 물살(`current`)은 피해를 주지 않고 닌자의 위치만 줄 방향으로 민다. 타일 충돌·폭발 판정은 바꾸지 않는다.

## 맵 추가 순서
깊은 숲(필수) → 폭포 계곡(P1) → 바위산(P2) → 달빛 사원(장기).
추가 맵이 실제 테스트를 통과한 뒤에만 맵 선택 UI 활성화. (2026-11-25: 깊은 숲·폭포 계곡 두 맵이 완성되어 맵 선택 화면을 켰다. 새 맵은 `ui.js`의 `MAP_CHOICES`에 추가한다.)
11. 낙석(`rockfall`)은 안쪽 바닥 칸(바위·상자 칸 제외) 중 서로 다른 칸을 뽑고, `rockCounts`는 [경과 시간, 개수] 쌍이며 개수는 1 이상이어야 한다. 피해는 해당 칸에 있는 닌자에게만 준다.
