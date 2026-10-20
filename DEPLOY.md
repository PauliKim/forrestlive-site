# GitHub · Cloudflare Pages 세팅 가이드

숲세권 라이브 공연 홈페이지를 GitHub에 올리고 Cloudflare Pages로 배포하는 방법입니다. 처음 설정할 때는 `설정_순서.md`를 그대로 따라 하세요.
처음 한 번만 하면, 이후에는 공연예술통합전산망(KOPIS)에 공연이 올라오거나 수정될 때마다 자동으로 사이트가 바뀝니다.

```
KOPIS에 공연 등록·수정
   │  (GitHub Actions가 5분마다 확인, KOPIS 수정 후 15분 지난 변경만 반영)
   ▼
data/shows.json 갱신 → GitHub에 자동 커밋
   │  (Cloudflare Pages가 커밋을 감지)
   ▼
사이트 자동 배포 (보통 1분 이내)
```

준비물: GitHub 계정, Cloudflare 계정, KOPIS 오픈 API 인증키, 이 프로젝트 폴더(`forrestlive-site`).

---

## 1단계. KOPIS 오픈 API 인증키 (발급 완료)

인증키는 이미 발급받았습니다. 값과 API 사용법은 `docs/KOPIS_API.md`에 정리되어 있습니다.
이 파일은 `.gitignore`에 들어 있어 GitHub에 올라가지 않습니다. 인증키는 3단계에서 GitHub Secrets에만 넣습니다.

알아 둘 점
- 인증키는 1인 1개이고 남에게 넘길 수 없습니다. 회사 담당자 한 명 이름으로 받으세요.
- 사이트에 출처를 꼭 적어야 합니다. 이미 푸터에 “공연 정보 출처: (재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)”이 들어가 있습니다. 지우지 마세요(출처가 없으면 서비스가 중단될 수 있음).
- 1초에 10번 넘게 호출하면 막힙니다. 스크립트는 호출 사이에 0.2초씩 쉬도록 되어 있습니다.

## 2단계. GitHub 저장소

저장소는 만들어 두었습니다: **https://github.com/PauliKim/forrestlive-site** (공개, 빈 저장소)

### 공개(Public)와 비공개(Private)
- 이 사이트의 코드와 공연 데이터는 원래 공개 정보라 Public이어도 문제가 없습니다. 인증키는 코드에 들어가지 않고 GitHub Secrets에만 저장됩니다.
- Public 저장소는 GitHub Actions 사용 시간이 무제한입니다.
- Private 저장소는 무료 계정 기준 월 2,000분까지입니다. 5분마다 실행하면 한도를 넘습니다. Private로 하려면 `.github/workflows/sync-kopis.yml`의 `*/5`를 `*/15`로 바꾸세요.

### 파일 올리기
`설정_순서.md` 2단계(GitHub Desktop)를 따릅니다. 터미널을 쓴다면:
```bash
cd ~/Desktop/"숲세권 공연 사이트"/forrestlive-site
git init -b main
git add .
git commit -m "숲세권 라이브 공연 홈페이지 첫 버전"
git remote add origin https://github.com/PauliKim/forrestlive-site.git
git push -u origin main
```
웹 화면에서 끌어다 놓는 방식은 한 번에 100개 파일까지이고 숨김 폴더(`.github`)가 빠지기 쉬워 권하지 않습니다.

## 3단계. GitHub에 인증키 넣고 자동 갱신 켜기

1. 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `KOPIS_API_KEY`
   - Secret: 1단계에서 받은 인증키 **32자리만** (문서 전체를 붙여 넣지 않기)
   - **Add secret**
2. 저장소 → **Settings → Actions → General**
   - Actions permissions: **Allow all actions and reusable workflows**
   - 맨 아래 Workflow permissions: **Read and write permissions** 선택 → **Save**
     (자동 갱신이 `data/shows.json`을 커밋하려면 쓰기 권한이 필요합니다)
3. 저장소 → **Actions** 탭 → 왼쪽 **KOPIS 공연 동기화** → 오른쪽 **Run workflow**
   - **전체 기간 다시 맞추기**와 **15분 대기 없이 바로 반영**을 둘 다 체크하고 실행합니다.
   - 첫 실행에서 공연 포스터가 `assets/posters/`에 저장되고, 지점 정보(`data/venues.json`)가 갱신됩니다.
   - 공연 데이터는 2026년 10월 20일에 같은 API로 미리 받아 두었습니다(KOPIS 127건 + KOPIS에 아직 없는 멜론 공연 2건).
   - 초록색 체크가 뜨면 성공입니다. 빨간색이면 실행 기록을 눌러 로그를 확인하세요(대부분 인증키 오타).

이후에는 따로 할 일이 없습니다.
- 5분마다: 지난 60일~앞으로 400일을 31일 단위로 나눠(공연목록 API는 한 번에 최대 31일) 어제 이후 등록·수정된 숲세권 공연을 확인하고, KOPIS에서 수정된 지 15분 지난 것만 반영합니다.
- 매일 04:10: 전체 기간을 한 번 더 맞춥니다.

## 4단계. Cloudflare Pages 연결

1. https://dash.cloudflare.com/sign-up 에서 가입(이미 있으면 로그인).
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Pages** 탭 → **Connect to Git** (Import an existing Git repository).
3. **GitHub** 선택 → GitHub 승인 화면에서 Cloudflare Pages 앱 설치. 저장소 접근은 **Only select repositories → `forrestlive-site`** 만 허용.
4. 저장소 `PauliKim/forrestlive-site` 선택 → **Begin setup**.
5. 빌드 설정
   - Project name: `forrestlive` (사이트 주소가 `https://forrestlive.pages.dev`가 됩니다. 이미 쓰이고 있으면 다른 이름)
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: **비워 둠**
   - Build output directory: `/`
6. **Save and Deploy**. 1분 안에 배포가 끝나고 `https://<프로젝트 이름>.pages.dev` 주소가 생깁니다.
7. 이후 GitHub `main`에 커밋이 올라올 때마다(자동 갱신 포함) Cloudflare가 다시 배포합니다.

### 요금과 제한 (무료 요금제)
- 빌드(배포) 월 500회, 동시 1개. 이 사이트는 KOPIS 정보가 바뀔 때만 커밋하므로 보통 하루 몇 회입니다.
- 사이트당 파일 2만 개, 파일당 25MB. 현재 약 140개 파일입니다.
- 트래픽 요금이 따로 붙지 않습니다.
- 캐시 설정은 저장소 루트의 `_headers` 파일에 있습니다(공연 데이터 1분, 글꼴 1년).
- `/concert/` 하위 경로 처리는 `_redirects` 파일에 있습니다.

## 5단계. 도메인 연결 — concert.forrestlive.com

forrestlive.com 랜딩페이지는 프레이머가 운영하므로, 공연 사이트는 하위 도메인에 둡니다. (검토 내용은 `설정_순서.md` 맨 아래 ‘도메인 검토 결과’)

1. Cloudflare Pages 프로젝트 → **Custom domains** → **Set up a custom domain** → `concert.forrestlive.com` → **My DNS provider** (CNAME 설정)
2. 가비아 DNS 관리 → forrestlive.com → 레코드 수정 → 레코드 추가
   - 타입 `CNAME`, 호스트 `concert`, 값 `forrestlive.pages.dev.` → 확인 → 저장
3. Cloudflare에서 **Check DNS records**. **Active**가 되면 HTTPS까지 자동입니다.
4. 프레이머 Site Settings → Redirects: `/concert` → `https://concert.forrestlive.com` 추가 후 **Publish**

사이트는 `/concert/` 경로로 들어와도 같은 페이지를 보여 줍니다(`_redirects`). 나중에 프레이머 Advanced Hosting의 외부 리라이트(`/concert/*` → `https://forrestlive.pages.dev/concert/`)로 바꾸면 주소를 forrestlive.com/concert 로 유지할 수 있습니다.

---

## 운영하면서

### KOPIS에 없는 정보 넣기
KOPIS에는 예매 오픈 시각, 매진 여부, 소개글이 없습니다. 이런 값은 `data/overrides.json`에 적습니다.
GitHub 웹에서 파일을 열고 연필 아이콘으로 고친 뒤 **Commit changes**를 누르면 5분 안에 반영됩니다.

```json
{
 "shows": {
  "PF303815": { "openAt": "2026-11-02T20:00", "intro": "소개 한두 문장", "soldOut": false }
 }
}
```
키는 KOPIS 공연 ID(`PF`로 시작, KOPIS 공연 상세 주소에 있음)나 `data/shows.json`의 `id`입니다.

### 바로 반영하고 싶을 때
Actions 탭 → KOPIS 공연 동기화 → Run workflow → **15분 대기 없이 바로 반영** 체크.

### 알아 둘 한계
- GitHub의 예약 실행은 사용량이 몰리면 몇 분, 길게는 수십 분 늦어질 수 있습니다(특히 매시 정각 무렵). ‘KOPIS 수정 후 15분’은 최소 대기 시간이고 실제 반영은 보통 15~25분 뒤입니다.
- Public 저장소에서 60일 동안 커밋이 하나도 없으면 GitHub가 예약 실행을 멈춥니다. 공연이 꾸준히 올라오면 자동 커밋이 생겨 문제없지만, 오래 공연이 없으면 Actions 탭에서 **Enable workflow**를 눌러 다시 켜세요.
- KOPIS에 공연이 등록되기 전(예매처가 아직 전송하지 않은 공연)은 사이트에 나오지 않습니다. 급하면 `data/shows.json`에 직접 추가할 수 있습니다.

### 로컬에서 미리 보기
```bash
cd forrestlive-site
python3 -m http.server 8000
```
브라우저에서 http://localhost:8000

### 동기화 스크립트 점검
```bash
python3 tests/test_sync.py   # KOPIS 응답 예시로 해석·병합·15분 대기를 확인
```
