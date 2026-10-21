# 디자인 기준

숲세권 라이브의 디자인 기준은 Claude Design의 **‘숲세권 라이브’ 디자인 시스템**에 있습니다.
https://claude.ai/artifact/S2y5hFY2qbMuhxo9Wmntx6

색·글꼴·간격 같은 값과 브랜드 가이드(원칙, 문구, 로고, 사진, 구성 요소)는 그곳에서 보고 고칩니다.
이 저장소의 `styles.css` 맨 위 `:root`는 그 값을 옮겨 적은 것입니다.

## 값을 바꿀 때

1. Claude Design에서 토큰이나 가이드를 고칩니다.
2. Claude에게 “디자인 시스템 바뀐 것 사이트에 반영해 줘”라고 하면 `styles.css`의 같은 이름 변수를 맞춰 고칩니다.

forrestlive.com(프레이머 랜딩)과 같은 결로 맞춘다. 랜딩의 색·글꼴·모서리 값이 원본이다.

| 디자인 시스템 토큰 | styles.css 변수 |
|---|---|
| sage, sage-deep, olive, forest, deep, bulb | `--sage`, `--sage-deep`, `--olive`, `--forest`, `--deep`, `--bulb` |
| bg, surface, card, text, muted, heading, line, chip | `--bg`, `--surface`, `--card`, `--text`, `--muted`, `--heading`, `--line`, `--chip` |
| accent, on-accent, focus, on-photo | `--accent`, `--on-accent`, `--focus`, `--on-photo` |
| 글꼴 serif / ui / label | `--font-serif`(Noto Serif KR) / `--font-ui`(Pretendard) / `--font-label`(Inter) |
| space-1 ~ space-8 | `--s-1` ~ `--s-8` |
| radius-sm, radius-md, radius-lg, radius-pill | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` |
| content-max, tap | `--max`, `--tap` |

## 글꼴 라이선스

- Noto Serif KR: Google, SIL Open Font License 1.1. Google Fonts에서 불러온다(`index.html`의 `<link>`).
- Inter: Rasmus Andersson, SIL Open Font License 1.1. Google Fonts에서 불러온다. 섹션 머리말에만 쓴다.
- 마루 부리(MaruBuri): 이전 제목 글꼴. `assets/fonts/MaruBuri-*.woff2`는 남아 있지만 지금은 쓰지 않는다.
- Pretendard: 길형진, SIL Open Font License 1.1(예약 글꼴명 Pretendard). 공식 배포본의 분할 파일(`assets/fonts/pretendard/`)을 수정 없이 사용. 라이선스 전문은 `assets/fonts/pretendard/LICENSE.txt`.
