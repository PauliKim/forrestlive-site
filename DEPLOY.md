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

## 6단계. 문구 관리 화면(/admin) 켜기

`https://forrestlive.pages.dev/admin/` 에서 고정 문구를 고치고 미리 본 뒤 저장하면, 서버(`functions/api/copy.js`)가 `data/copy.json`과 `index.html`을 main에 커밋합니다. 처음 한 번 아래 세 가지를 설정해야 저장이 됩니다. 설정 전에도 화면은 열리고 미리보기는 되지만 저장 버튼은 꺼져 있습니다.

### 6-1. GitHub 토큰 만들기 (저장소 쓰기 권한)

1. GitHub → 오른쪽 위 프로필 → **Settings** → 맨 아래 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Token name `forrestlive-admin`, Expiration은 1년(만료 전에 다시 만들어 6-3의 값을 바꿉니다)
3. Repository access: **Only select repositories** → `forrestlive-site`
4. Permissions → Repository permissions → **Contents: Read and write** (Metadata: Read-only는 자동)
5. **Generate token** → 나온 값(`github_pat_…`)을 복사. 이 창을 닫으면 다시 볼 수 없습니다. 메신저나 문서에 붙여 넣지 말고 6-3에 바로 넣습니다.

### 6-2. Cloudflare Access로 로그인 걸기

1. Cloudflare 대시보드 왼쪽 **Zero Trust**. 처음이면 팀 이름(예: `forrestlive`)을 정하고 **Free** 요금제를 고릅니다(50명까지 무료. 결제 수단 등록을 요구할 수 있지만 무료 요금제는 청구되지 않습니다). 팀 주소는 `forrestlive.cloudflareaccess.com` 같은 모양입니다.
2. **Access → Applications → Add an application → Self-hosted**
   - Application name: `숲세권 문구 관리`, Session duration: `24 hours`
   - Domain: `forrestlive.pages.dev`, Path: `admin`
   - **Add public hostname**으로 한 줄 더: `forrestlive.pages.dev`, Path: `api/copy`
   - `concert.forrestlive.com`은 고를 수 없습니다. forrestlive.com의 DNS가 가비아에 있어 Cloudflare 영역이 아니기 때문입니다. 그래서 관리 화면은 `forrestlive.pages.dev/admin/`에서 쓰고, `concert.forrestlive.com/admin/`으로 들어오면 그리로 넘어갑니다.
3. 로그인 방법은 기본값 **One-time PIN**(이메일로 받은 숫자 입력)이면 충분합니다.
4. Policy: Action **Allow**, Include → **Emails** → 문구를 고칠 사람들의 이메일
5. 저장 후 애플리케이션 목록에서 방금 만든 항목 → **Overview**의 **Application Audience (AUD) Tag** 값을 복사합니다.

### 6-3. Cloudflare Pages에 값 넣기

**Workers & Pages → forrestlive → Settings → Variables and Secrets** → Production에 추가:

| 이름 | 값 | 종류 |
|---|---|---|
| `GITHUB_TOKEN` | 6-1의 토큰 | Secret(암호화) |
| `ACCESS_TEAM_DOMAIN` | 6-2의 팀 주소, 예: `forrestlive.cloudflareaccess.com` | Text |
| `ACCESS_AUD` | 6-2의 AUD Tag | Text |
| `ADMIN_EMAILS` (선택) | 허용 이메일을 쉼표로. Access 정책에 더해 한 번 더 확인 | Text |

값은 다음 배포부터 적용됩니다. **Deployments** → 맨 위 배포 → **Retry deployment**로 다시 배포합니다.

### 지금 설정된 값 (2026-10-21)

- Zero Trust 팀: `forrestlive` (`forrestlive.cloudflareaccess.com`), Free 요금제
- Access 애플리케이션: `숲세권 문구 관리` → `forrestlive.pages.dev/admin`, `forrestlive.pages.dev/api/copy`, 정책 `문구 관리 허용`(kimmhaa@gmail.com)
- Pages 환경 변수: `ACCESS_TEAM_DOMAIN`, `ADMIN_EMAILS`, `ACCESS_AUD`, `GITHUB_TOKEN`(Secret)

### 6-4. 확인

1. `https://forrestlive.pages.dev/admin/` → 이메일 입력 → 받은 숫자 입력
2. 오른쪽 위에 로그인한 이메일이 보이고 경고 줄이 없으면 준비 완료
3. 문구 하나를 고쳐 **저장하고 게시** → GitHub 커밋 목록에 `문구 수정: …`(작성자 forrestlive-admin)이 생기고 1~2분 뒤 사이트에 반영

### 보안 메모

- 저장 서버는 Cloudflare Access가 넘겨준 로그인 토큰의 서명·대상(AUD)·만료를 직접 검증합니다. 설정값이 없거나 토큰이 맞지 않으면 저장하지 않습니다. 그래서 브랜치 미리보기 주소처럼 Access가 걸리지 않은 곳에서는 미리보기만 됩니다.
- 토큰은 이 저장소의 파일 읽기·쓰기만 할 수 있습니다. 유출이 의심되면 GitHub에서 토큰을 삭제하고 새로 만들어 `GITHUB_TOKEN`을 바꿉니다.
- 잠긴 문구(슬로건 B-05, KOPIS 출처 G-09)와 정의되지 않은 자리표시는 서버에서도 거부합니다.

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
