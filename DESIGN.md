# 디자인 기준

숲세권 라이브의 디자인 기준은 Claude Design의 **‘숲세권 라이브’ 디자인 시스템**에 있습니다.
https://claude.ai/artifact/S2y5hFY2qbMuhxo9Wmntx6

색·글꼴·간격 같은 값과 브랜드 가이드(원칙, 문구, 로고, 사진, 구성 요소)는 그곳에서 보고 고칩니다.
이 저장소의 `styles.css` 맨 위 `:root`는 그 값을 옮겨 적은 것입니다.

## 값을 바꿀 때

1. Claude Design에서 토큰이나 가이드를 고칩니다.
2. Claude에게 “디자인 시스템 바뀐 것 사이트에 반영해 줘”라고 하면 `styles.css`의 같은 이름 변수를 맞춰 고칩니다.

| 디자인 시스템 토큰 | styles.css 변수 |
|---|---|
| forest, deep, bulb, sage, sage-line, moss | `--forest`, `--deep`, `--bulb`, `--sage`, `--sage-line`, `--moss` |
| bg, surface, text, muted, heading, line, chip | `--bg`, `--surface`, `--text`, `--muted`, `--heading`, `--line`, `--chip` |
| on-forest, on-bulb, focus | `--on-forest`, `--on-bulb`, `--focus` |
| 글꼴 serif / ui | `--font-serif`(마루 부리) / `--font-ui`(Pretendard) |
| radius-sm | `--radius` |
| content-max | `--max` |

## 글꼴 라이선스

- 마루 부리(MaruBuri): 네이버, SIL Open Font License 1.1. `assets/fonts/MaruBuri-*.woff2`를 수정 없이 사용.
- Pretendard: 길형진, SIL Open Font License 1.1(예약 글꼴명 Pretendard). 공식 배포본의 분할 파일(`assets/fonts/pretendard/`)을 수정 없이 사용. 라이선스 전문은 `assets/fonts/pretendard/LICENSE.txt`.
