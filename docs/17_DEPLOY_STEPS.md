# 배포 단계 정리 (부적소동: 비밀 수련장) — 2026-11-25 작성, 같은 날 배포 완료로 갱신

> 목표: GitHub에 올리고 Render **Static Site**로 URL을 만들어 발표에서 시연한다. 상태는 `15_PROGRESS_STATUS.md`, 발표 구성은 `08_DEPLOY_AND_PRESENT.md`. 이 문서의 "완료" 표시는 실제로 해 본 것만 체크한다. 2~4장의 이름 예시 `bujeok-sodong`은 계획 당시 값이고 실제로는 `bujeok`을 썼다(10장).

## 0. 현재 상태 (2026-11-25 밤)
- **배포 완료.** GitHub `kmj0900/bujeok`(Public, `main`) → Render Static Site `bujeok`. 첫 배포는 `Deploy succeeded | Live`로 확인했다. 실제로 한 값과 겪은 일은 맨 아래 10장.
- 서버 코드·빌드 단계가 없는 **순수 정적 사이트**(HTML + ES Modules + PNG). 모든 경로가 상대 경로이고 외부 주소가 없다.
- 한 대의 컴퓨터에서 두 사람이 키보드로 하는 로컬 2인 + AI 대전이다. URL을 공유해도 온라인 대전은 안 된다(발표에서 그렇게 설명한다. 온라인 대전은 `18_ONLINE_BATTLE_PLAN.md`).
- 아래 1·5장의 체크 항목 중 **배포 URL에서 직접 확인한 것으로 체크하지 않은 항목은 아직 사용자 확인 전**이다.

## 1. 올리기 전 점검 (사용자 확인 필요)
각 항목을 Live Server(`127.0.0.1:5500`)에서 확인하고 이상이 있으면 알려 준다.
- [ ] **세 맵 한 판씩**: 깊은 숲, 폭포 계곡, 바위산 (메인 → 게임 시작 → 맵 선택 → 대결 방식)
- [ ] 바위산: 낙석 그림자 예고 → 떨어짐 → 하트 -1, 돌 개수가 시간에 따라 늘어나는지(빨리 보려면 주소 뒤 `?map=mountain&mode=local&hazard=3`, 후반 단계는 `&t=120`)
- [ ] 폭포 계곡: 물살로 밀리는 느낌, 폭포·물길 애니메이션
- [ ] 봉인 → 이동키 연타 탈출, 세 번째부터 탈출이 어려운지
- [ ] AI 대전 한 판 끝까지, 결과 화면 → 다시 대결 → 메인 화면
- [ ] 정보창: 얼굴·하트·능력치·시간(남은 30초 붉게 깜박)
- [ ] 소리(M 키 끄기·켜기), 일시정지(P/Esc)
- [ ] 브라우저 콘솔(F12)에 빨간 오류가 없는지
- [ ] 자동 테스트: 폴더에서 `node tests/test_ui.mjs` 등 16개 파일(전부 통과 상태, 마지막 확인 2026-11-25)

## 2. GitHub 저장소 만들기 (사용자 계정)
1. GitHub 로그인 → 오른쪽 위 **+ → New repository**.
2. 이름 예: `bujeok-sodong`(영문·소문자·하이픈 권장). **Public**이면 Render 연결이 쉽다.
3. **README·.gitignore·license는 추가하지 않는다**(이미 폴더에 있어서 충돌 방지). 만들면 나오는 주소(`https://github.com/<아이디>/bujeok-sodong.git`)를 복사한다.

## 3. 폴더를 저장소로 올리기 (Windows 터미널 / PowerShell)
```powershell
cd "C:\Users\rkdal\Desktop\바이브코딩\닌자"
git init
git add .
git status        # _to_delete/ 가 목록에 없는지 확인
git commit -m "부적소동: 비밀 수련장 첫 배포"
git branch -M main
git remote add origin https://github.com/<아이디>/bujeok-sodong.git
git push -u origin main
```
- 처음 `git commit`에서 이름·이메일을 물으면 `git config --global user.name "이름"`, `git config --global user.email "메일"`을 먼저 설정한다.
- `git push`에서 로그인 창이 뜨면 GitHub 계정으로 인증한다(비밀번호 대신 브라우저 로그인 또는 토큰).
- 올라간 뒤 GitHub 페이지에서 `index.html`, `js/`, `assets/sprites/` 가 보이는지 확인한다.
- 이후 수정은 `git add .` → `git commit -m "내용"` → `git push` 세 줄이다.

## 4. Render Static Site 만들기
1. Render 로그인(GitHub 계정으로 가입하면 연결이 편하다) → **New + → Static Site**.
2. 방금 만든 저장소를 선택(처음이면 Render에 저장소 접근 권한을 허용).
3. 설정:
   | 항목 | 값 |
   |---|---|
   | Name | `bujeok-sodong` (URL에 들어간다) |
   | Branch | `main` |
   | Build Command | 비워 둔다(요구하면 `echo ok`) |
   | Publish Directory | `.` (저장소 루트) |
4. **Create Static Site** → 첫 배포가 끝나면 `https://<이름>.onrender.com` 주소가 나온다.
5. 이후 `git push` 할 때마다 자동으로 다시 배포된다(자동 배포 설정이 켜져 있을 때).
- 무료 플랜 조건과 대역폭 한도는 가입 화면에서 직접 확인한다(요금·한도는 바뀔 수 있다).

## 5. 배포 후 확인 (URL에서)
- [ ] 메인 화면이 뜨고 제목·닌자 그림·버튼이 보인다(그림이 도형으로 나오면 이미지 경로 문제).
- [ ] 세 맵 모두 시작되고 타일 그림·외곽 테두리가 나온다.
- [ ] 로컬 2인·AI 대전 모두 한 판, 재대결·메인 복귀.
- [ ] 소리·일시정지·키 입력(브라우저 창을 클릭해 포커스를 준 뒤).
- [ ] F12 콘솔에 404·MIME 오류가 없다.
- [ ] 다른 브라우저(Chrome/Edge)와 다른 노트북에서 한 번 더.
- [ ] 발표 노트북 화면 크기에서 게임이 잘리지 않는다(화면 폭이 창 높이에 맞춰 줄어든다).

## 6. 문제가 생기면
| 증상 | 원인 후보 | 해결 |
|---|---|---|
| 빈 화면, 콘솔에 모듈 오류 | `index.html`이 루트에 없거나 Publish Directory가 다름 | Publish Directory를 `.`로, 파일이 저장소 맨 위에 있는지 확인 |
| 그림이 전부 도형으로 보임 | 이미지 경로·대소문자 | Render(리눅스)는 **대소문자를 구분**한다. `assets/sprites/*.png` 파일명(전부 소문자)이 코드와 같은지 확인 |
| 예전 화면이 보임 | 브라우저 캐시 | `Ctrl+F5` |
| 푸시했는데 바뀌지 않음 | 배포 진행 중/실패 | Render 대시보드의 Events·Logs 확인 |
| `git push` 거부 | 저장소에 README 등이 이미 있음 | 빈 저장소로 다시 만들거나 `git pull --rebase origin main` 후 푸시 |
| `file://`로 열면 안 됨 | ES Modules는 서버가 필요 | Live Server나 배포 URL로 연다 |

## 7. 되돌리기
- 직전 상태로: GitHub에서 문제 커밋을 `git revert <커밋>` 후 푸시하거나, Render 대시보드에서 이전 배포로 롤백한다.
- 배포 직전 백업으로 폴더 전체를 zip으로 복사해 둔다.

## 8. 발표 대비
- 시연용 주소: 기본 `URL`, 맵 바로가기 `URL/?map=mountain`, 낙석·수리검·물살을 빨리 보려면 `&hazard=3`(개발용 바로가기이니 발표에서 쓸 때 설명한다).
- 인터넷이 불안하면 로컬 Live Server 화면과 **녹화·스크린샷을 대체 자료**로 준비한다(`08` 체크리스트).
- 구현하지 않은 것(온라인 대전, 달빛 사원 맵)은 완성했다고 말하지 않고 "확장 방향"으로 소개한다.

## 9. 체크 순서 요약
1. 위 1번 점검 → 2. 저장소 생성 → 3. 푸시 → 4. Render 연결 → 5. URL 확인 → 6. 발표 자료·녹화 준비.

## 10. 실제로 한 배포 기록 (2026-11-25)
### 사용한 값
| 항목 | 값 |
|---|---|
| GitHub 저장소 | `kmj0900/bujeok` (Public, README·.gitignore·license는 추가하지 않고 생성) |
| 푸시 | `git init` → `git add .` → `git status`로 `_to_delete/` 제외 확인 → `git commit` → `git branch -M main` → `git remote add origin ...` → `git push -u origin main` |
| Render | New + → Static Site → 저장소 `kmj0900/bujeok` 연결(GitHub 앱은 Only select repositories로 `bujeok`만 허용 권장) |
| Name / Branch | `bujeok` / `main` |
| Root Directory · Build Command | 비워 둠 |
| Publish Directory | `.` |
| Environment Variables | 없음 |
| 결과 | `Deploy succeeded | Live`, 배포 시간 8초. 주소는 `https://<Name>.onrender.com` 형식(이름이 겹치면 Render가 다른 이름을 요구) |
- 시연용 짧은 주소를 위해 저장소 이름을 `bujeok`으로 했다. **발표에서 치는 주소는 Render의 Name으로 정해진다**(저장소 이름과 무관).

### 겪은 일과 처리
- `tools/__pycache__/*.pyc`가 처음 커밋에 같이 올라갔다 → `git rm --cached -r tools/__pycache__`, `.gitignore`에 `__pycache__/` 추가 후 푸시.
- `git status`의 `LF will be replaced by CRLF` 경고는 윈도우 줄바꿈 안내라 무시해도 된다.
- 커밋 시 이름·이메일을 묻는 경우 `git config --global user.name`, `user.email`을 먼저 설정한다(`git config`는 성공해도 아무것도 출력하지 않는다).
- 배포 후 로컬 플레이에서 **흑영 부적이 이동 중 씹힘** → 키보드 고스팅으로 보고 왼쪽 Shift 보조 키 추가.
- 다른 사람이 해 보고 **AI가 너무 어렵다** → AI 난이도 쉬움·보통 추가, AI를 흑영(1P)으로 바꿔 사람이 방향키로 하게 함.
- 위 수정은 `git add .` → `git commit -m "..."` → `git push`로 반영한다(푸시 후 1~2분, 확인은 `Ctrl+F5`).

### 운영 메모
- 정적 사이트는 무료로 배포할 수 있고 Render 무료 웹 서비스처럼 잠들지 않는다. 다만 **월 포함 전송량**이 있어 초과분은 청구될 수 있고 하드 리밋은 없다(플랜별 포함량은 Render 대시보드에서 확인, 이 프로젝트는 파일이 가벼워 영향이 거의 없다).
- Render 서비스나 GitHub 저장소를 지우면 주소가 사라진다. 평가가 끝난 뒤 정리할 때만 지운다.
- 발표 노트북: 윈도우 **고정키 바로가기**를 꺼 둔다(Shift 연타 시 팝업).
