# 부적소동: 비밀 수련장

> 바이브 코딩으로 제작하는 PC 브라우저용 2D 픽셀아트 봉인 대전 게임.

## 목표
- **필수**: 로컬 2인 대전, 기본 규칙 기반 AI 대전(쉬움·보통), 깊은 숲 수련장 1개, 배포 가능한 완성 게임.
- **선택**: 능력 두루마리 3종, 폭포 계곡·바위산 맵(달빛 사원은 제외), 효과음·애니메이션, AI 고도화.
- **제외**: 온라인 멀티플레이, 로그인, 데이터베이스, 서버 랭킹, 복잡한 인술.

## 기술 스택
HTML5 / CSS3 / Vanilla JavaScript (ES Modules) / Canvas 2D. GitHub + Render Static Site. 별도 서버 없음.

## 문서 읽는 순서
1. `AGENTS.md`: AI 코딩 도구의 프로젝트 작업 규칙
2. `docs/01_GAME_DESIGN.md`: 세계관·게임 규칙·UI
3. `docs/02_TECHNICAL_DESIGN.md`: 코드 구조·상태·타일·맵 데이터
4. `docs/03_REQUIREMENTS.md`: 기능 요구사항과 완료 조건
5. `docs/04_AI_BEHAVIOR.md`: AI 상대 설계
6. `docs/05_ART_DIRECTION.md`: 시각 디자인·맵 테마
7. `docs/06_ROADMAP.md`: 개발 순서와 일정
8. `docs/07_TEST_PLAN.md`: 검증 체크리스트
9. `docs/08_DEPLOY_AND_PRESENT.md`: 배포와 발표
10. `docs/09_PROMPT_PLAYBOOK.md`: AI 코딩 프롬프트 예시
11. `docs/10_DECISION_LOG.md`: 결정·변경 기록

## 시작 방법
정적 파일을 로컬 HTTP 서버로 제공해 `index.html`을 실행한다. ES Modules를 사용하므로 `file://`로 직접 열지 않는다. VS Code Live Server 등을 사용한다.
- 조작: 1P 흑영 `W A S D` + `Space` 또는 왼쪽 `Shift`(부적), 2P 녹림 `방향키` + `Enter`(부적), `P`/`Esc` 일시정지, `M` 소리 끄기·켜기. 메뉴는 `↑↓`(또는 W/S) + `Enter`/`Space`, 마우스.
- 개발용 주소 옵션: `?mode=ai` / `?mode=local`(메뉴 건너뛰기), `?seed=숫자`(첫 판 상자 배치 재현), `?hazard=3`(첫 수리검·물살·낙석을 시작 3초 뒤에 나오게 해 확인), `?t=100`(경과 시간을 앞당겨 후반 단계 확인, 예: 2칸·3칸 물살), `?map=forest|waterfall|mountain`(처음 선택될 맵. 평소엔 메인 → 맵 선택 화면에서 고른다).
- 테스트: `node tests/test_move.mjs` 등 `tests/*.mjs`를 각각 실행한다.
- 스프라이트 재생성(선택): `pip install pillow` 후 `python tools/make_sprites.py`. 게임 실행에는 필요 없다.

## 중요한 설계 원칙
**공통 게임 엔진 + 공통 타일 규칙 + 맵별 데이터/이미지.** 추가 맵을 위해 이동·충돌·폭발·AI·승패 로직을 복제하지 않는다.

## 진행 상태
로컬 2인 대전, 규칙 기반 AI 대전, 맵 3개(깊은 숲·폭포 계곡·바위산)와 맵 위협(수리검·물살·낙석), 아이템 두루마리 3종, 봉인 연타 탈출, 맵별 외곽 테두리·정보창·효과음까지 구현했다(자동 테스트 411개 통과, 일부는 브라우저 확인 전). 달빛 사원 맵은 제외했고 GitHub·Render 배포는 아직이다(절차: `docs/17_DEPLOY_STEPS.md`). 자세한 현황은 `docs/15_PROGRESS_STATUS.md`. 구현 진행 상황은 `docs/06_ROADMAP.md`에서 체크한다. 완료하지 않은 항목을 완료했다고 주장하지 않는다.

## 검토 보강 문서
12. `docs/11_EDGE_CASES.md`: 동시 폭발·봉인·부적 재진입·타임아웃 등의 경계 상황
13. `docs/12_MAP_SCHEMA.md`: 맵 좌표·장애물·스폰·상자 배치의 데이터 계약
14. `docs/13_DEVELOPMENT_LOG_TEMPLATE.md`: 발표에 사용할 바이브 코딩 작업·검증 기록
15. `docs/14_AI_IMPROVEMENTS.md`: AI 한계와 개선 계획(백로그, 미구현)
16. `docs/15_PROGRESS_STATUS.md`: 현재 구현 범위·검증 수준·알려진 한계·튜닝 값 위치
17. `docs/16_NEXT_PLAN.md`: 앞으로의 순서(수리검 → AI 회피 → 폭포 계곡 → 나머지 맵 → 배포)와 미정 사항
18. `docs/17_DEPLOY_STEPS.md`: 배포 단계(점검 → GitHub → Render → 확인 → 문제 해결)

**주의:** 배포는 아직 하지 않았다. 테스트 결과는 `tests/`를 직접 실행해 확인한다.
