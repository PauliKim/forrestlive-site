# 숲세권 라이브 공연 사이트

숲세권 라이브(For:Rest LIVE)가 기획한 공연을 모아 보여 주는 정적 사이트.
- 운영 주소: https://concert.forrestlive.com (Cloudflare Pages 프로젝트 `forrestlive`, https://forrestlive.pages.dev)
- 저장소: https://github.com/PauliKim/forrestlive-site (공개, 기본 브랜치 `main`)
- forrestlive.com 루트는 프레이머 랜딩페이지다. 이 저장소와 무관하니 건드리지 않는다.

## 대화와 작성 언어
- 사용자와는 한국어로 대화한다.
- 커밋 메시지, 문서, 코드 주석, 화면 문구는 한국어로 쓴다.

## 구조 (빌드 단계 없음, 저장소 루트가 그대로 배포됨)
- `index.html` 페이지 마크업과 페이지 전용 스타일
- `styles.css` 디자인 토큰(`:root`)과 공통 구성 요소. 토큰 원본은 Claude Design 디자인 시스템 → `DESIGN.md`
- `app.js` `data/*.json`을 읽어 화면을 그린다. 모든 경로는 상대 경로로 쓴다(`/concert/` 하위 경로에서도 작동해야 함)
- `data/shows.json` 공연 데이터. **자동 동기화가 고치는 파일이라 손으로 고치지 않는다.**
- `data/overrides.json` KOPIS에 없는 값(openAt 예매 오픈 시각, soldOut, intro 소개글 등). 사람이 고치는 곳은 여기다
- `data/venues.json` 지점 정보(KOPIS 공연시설 상세로 갱신)
- `scripts/sync_kopis.py` KOPIS OPEN API 동기화. `tests/test_sync.py` 네트워크 없이 도는 점검
- `.github/workflows/sync-kopis.yml` 5분마다 변경분, 매일 04:10 전체 동기화 후 자동 커밋(작성자 forrestlive-bot)
- `_headers` 캐시 설정, `_redirects` `/concert/*` → 루트 매핑
- `assets/` 로고, 공연장 사진, 글꼴(마루 부리, Pretendard, OFL), `assets/posters/`(동기화가 내려받는 포스터)

## 자주 쓰는 명령
- 미리보기: `python3 -m http.server 8000` → http://localhost:8000 (`/concert/` 경로 확인은 Pages 배포본에서)
- 동기화 점검: `python3 tests/test_sync.py` (스크립트를 고치면 반드시 실행)
- 동기화 직접 실행(필요할 때만): `set -a; source .env; set +a; python3 scripts/sync_kopis.py --no-hold`
  - `.env`에 `KOPIS_API_KEY=32자리키` 한 줄. `.env`는 커밋 금지(.gitignore에 있음)
  - 로컬에서 돌린 결과는 커밋하지 말고 되돌린다. 실제 반영은 GitHub Actions가 한다
- 원격 동기화 수동 실행: `gh workflow run sync-kopis.yml -f full=true -f no_hold=true`
- 실행 결과 보기: `gh run list --workflow sync-kopis.yml -L 5`, `gh run view <id> --log-failed`

## 배포 흐름
- `main`에 push하면 Cloudflare Pages가 1분 안에 운영 사이트에 배포한다. 별도 스테이징이 없다.
  - 화면이나 스크립트를 바꾸면 로컬 미리보기로 확인한 뒤 push한다.
  - 큰 변경은 브랜치를 만들어 push한다. Cloudflare가 브랜치별 미리보기 주소(`<브랜치>.forrestlive.pages.dev`)를 만들어 주므로, 확인 후 main에 합친다.
- 봇이 5분마다 `data/`, `assets/posters/`를 커밋한다. push 전에 항상 `git pull --rebase origin main`.
- 봇 커밋과 겹치지 않도록 `data/shows.json`, `assets/posters/`는 사람 작업에서 바꾸지 않는다.

## 데이터 규칙
- KOPIS 공연 ID(PF…)와 사이트 id(pf…, 멜론 전용은 m…)는 `find_existing`으로 연결된다. id 체계를 바꾸지 않는다.
- 동기화는 사람이 정한 필드(title, artist, subtitle, series, intro, openAt, soldOut)를 덮어쓰지 않는다(HUMAN_FIELDS).
- KOPIS 수정 후 15분이 지난 변경만 반영한다(HOLD). 공연목록 API는 한 번에 31일까지만 조회된다.
- KOPIS는 초당 10회 제한. 호출 사이 간격(REQUEST_GAP)을 줄이지 않는다.

## 화면·문구 원칙
- 디자인 값은 `styles.css` 토큰만 쓴다. 새 색이나 글꼴을 임의로 넣지 않는다(`DESIGN.md` 참고).
- 글꼴: 제목 마루 부리(`--font-serif`), 본문·UI Pretendard(`--font-ui`).
- 슬로건: “도시 속 작은 울림을 전하는 숲”.
- 공연 카드에 공연명과 아티스트명을 같은 말로 두 번 쓰지 않는다(`byline()` 참고). 날짜는 포스터 위 레이어 글자로 얹는다.
- 소개 문구는 사람이 쓴 것처럼 담백하게. 과장된 수식어나 AI 같은 말투를 쓰지 않는다.
- 푸터의 “공연 정보 출처: (재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)” 문구는 KOPIS 이용 조건이라 지우지 않는다.
- 모바일 폭에서도 확인한다.

## 보안
- KOPIS 인증키는 GitHub Secret `KOPIS_API_KEY`에만 둔다. 코드, 커밋, 로그, 이슈에 키를 쓰지 않는다.
- `docs/KOPIS_API.md`(키 포함 문서)와 `.env`는 커밋하지 않는다.

## 참고 문서
- `설정_순서.md` 처음 설정한 순서와 현재 상태, 도메인 검토 결과, 막혔을 때
- `DEPLOY.md` GitHub·Cloudflare Pages 세팅과 운영
- `DESIGN.md` 디자인 토큰과 글꼴 라이선스
