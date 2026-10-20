# 숲세권 라이브 공연 홈페이지

숲세권 라이브가 기획한 공연을 모아 보여 주는 정적 웹사이트입니다. 빌드 과정 없이 그대로 배포합니다.

## 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 공연 페이지 (다가오는 공연, 상세, 지난 공연, 공간, 문의) |
| `DESIGN.md` | 디자인 기준 안내 (원본은 Claude Design의 ‘숲세권 라이브’ 디자인 시스템) |
| `DEPLOY.md` | GitHub·Cloudflare Pages 세팅과 운영 방법 |
| `설정_순서.md` | 처음 설정할 때 따라 하는 순서 |
| `_headers` | Cloudflare Pages 캐시 설정 |
| `docs/KOPIS_API.md` | KOPIS OPEN API 정리(인증키 포함, 저장소에는 올라가지 않음) |
| `tests/test_sync.py` | 동기화 스크립트 점검(네트워크 불필요) |
| `styles.css` | 디자인 토큰과 공통 구성 요소 |
| `app.js` | 공연 데이터를 읽어 화면을 그리는 스크립트 |
| `data/shows.json` | 공연 데이터. KOPIS 공연목록·공연상세에서 자동 갱신 |
| `data/venues.json` | 지점 정보(주소, 좌표, 전화). KOPIS 공연시설 상세에서 갱신 |
| `data/overrides.json` | KOPIS에 없는 값(예매 오픈 시각, 매진, 소개글) |
| `scripts/sync_kopis.py` | KOPIS 동기화 스크립트 |
| `.github/workflows/sync-kopis.yml` | 5분마다 동기화하는 GitHub Actions |
| `assets/` | 로고(투명 PNG), 공연장 사진, 글꼴(마루 부리, Pretendard), 포스터 |

## 공연 정보 갱신

관리자 페이지 없이 공연예술통합전산망(KOPIS) 데이터로 자동 갱신됩니다. 자세한 설정과 운영 방법은 `DEPLOY.md`를 보세요.

## 로컬에서 보기

```
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000 을 엽니다.
