# 경희늘푸른한의원 홈페이지 — 작업 규칙

이 저장소는 https://kh-alwaysbluehani.co.kr 의 소스입니다(GitHub Pages, `main` 브랜치 루트 배포).
**공개 저장소**이므로 이 문서에도 계정·비밀번호·토큰·연락처 같은 민감한 정보는 적지 않습니다.

## 반드시 지킬 것

1. **작업 시작 전에 항상 `git pull`** 합니다. 이 저장소에는 여러 주체가 커밋합니다.
   - 사람, Claude Code, **Aside**(GitHub 웹 커밋 포함), 주간 리뷰 크롤러
2. `index.html` `<head>`의 **소유확인 태그는 삭제 금지**입니다.
   - `google-site-verification` 1개
   - `naver-site-verification` 2개(두 태그 모두 유지)
   - 루트의 `google3c5885deb734cc85.html` 파일도 삭제 금지입니다.
3. **대표 도메인은 `https://kh-alwaysbluehani.co.kr` (www 없음)** 입니다.
   - 모든 canonical·og:url·sitemap 주소를 이 형식으로 씁니다.
   - www 주소는 301로 넘어갑니다.
4. 공개 저장소이므로 **커밋 전에** 비밀번호·토큰·API 키·계정 ID·개인 연락처·내부 문서가 섞이지 않았는지 확인합니다.
   - `git add -A` 대신 필요한 파일만 지정합니다.
5. 아래 파일은 삭제하거나 고치지 않습니다.
   - `CNAME`, `.nojekyll`, IndexNow 키 파일(루트의 32자리 `.txt`), `indexforrecovery.html`(백업본, 배포 제외)
   - `data/reviews.json`(리뷰 크롤러 전용)

## 사이트 구조

순수 정적 HTML입니다. 빌드 도구는 없습니다(`package.json`은 리뷰 크롤러용).

| 경로 | 역할 |
|---|---|
| `index.html` | 메인. MedicalClinic·FAQPage 구조화 데이터, 진료 안내, 휴진·진료시간 공지 칸(`.info-notice`, 평소 숨김) |
| `womens-health.html` | 여성 진료 허브 |
| `menopause.html`, `infertility.html`, `morning-sickness.html` | 갱년기·난임·입덧 안내 |
| `acupuncture.html`, `car-accident.html`, `foot-pain.html` | 침 치료·교통사고 후유증·족저근막염 안내 |
| `column.html`, `column-*.html` | 건강 칼럼 목록과 칼럼 |
| `disease/` | 질환백과 허브와 질환 페이지 |
| `style.css`, `script.js` | 공통 디자인·동작 |
| `crawler/`, `data/reviews.json` | 리뷰 크롤러와 데이터 |
| `resource/` | 이미지. `og-default.jpg`는 공통 OG 썸네일 |
| `sitemap.xml`, `sitemap-disease.xml`, `robots.txt`, `llms.txt` | 검색·AI용 파일 |

### 생성기 출력물 (직접 수정 금지)

질환백과와 일부 칼럼은 저장소 밖(로컬 전용 폴더)의 원고로 생성기가 만듭니다. 아래 파일을 직접 고치면 다음 생성 때 덮어써집니다.

- `disease/*.html`, `disease/index.html`, `sitemap-disease.xml`
- 생성기가 만든 `column-*.html`
- `column.html`의 `<!-- COLUMN-LIST:START … END -->` 구역
- `index.html`의 `<!-- INDEX-COLUMN:START … END -->` 구역

## 배포

1. `git pull`
2. 수정
3. 필요한 파일만 커밋
4. `main`에 push
5. GitHub Pages가 1~2분 안에 반영
6. 실사이트 확인

- 새 페이지를 만들면 다음을 함께 처리합니다.
  - `sitemap.xml`과 `llms.txt`에 추가
  - IndexNow 제출
  - 검색엔진(구글 서치콘솔·네이버 서치어드바이저)에 색인·수집 요청
- 자동 작업이 정해진 시간에 이 저장소에 커밋합니다. 같은 파일을 동시에 고치면 충돌할 수 있습니다.
  - 리뷰 크롤러: 주 1회
  - 콘텐츠 자동 발행: 주 2회
  - 노출 점검·개선: 매일 오전
- Claude Code는 사용자가 "배포해줘/푸시해줘"라고 할 때만 커밋·푸시합니다. 예외는 사용자가 승인한 자동 작업입니다.

## SEO·AEO 규칙

- **robots.txt**: 전부 허용. 검색엔진과 AI 크롤러(GPTBot·ClaudeBot·PerplexityBot 등)를 명시적으로 허용합니다. 사이트맵 2개를 적습니다.
- **sitemap.xml**: 일반 페이지는 수동 관리합니다. 칼럼 생성기가 새 칼럼 URL을 자동으로 추가합니다.
- **sitemap-disease.xml**: 질환백과 생성기가 매번 새로 만듭니다.
- **canonical**: 모든 페이지가 자기 자신의 www 없는 https 주소를 가리킵니다.
- **구조화 데이터**: JSON-LD. 수정 후 JSON이 깨지지 않았는지 확인합니다.
  - 메인: MedicalClinic + FAQPage
  - 안내·질환 페이지: MedicalWebPage·MedicalCondition·FAQPage·BreadcrumbList
- **aggregateRating(자사 평점) 마크업은 넣지 않습니다.** 구글 정책상 수동조치 위험이 있습니다.
- **Open Graph**: 모든 페이지에 og:title·og:description·og:image와 twitter 카드를 넣습니다.
- **llms.txt**: 공개 페이지가 늘면 링크를 추가해 사이트 내용과 맞춥니다.

## 콘텐츠·표기 원칙

- 원장 직함: "경희대학교 임상한의학과 부인과 박사"
- 용어
  - "한방 치료"가 아니라 "한의학 치료"로 씁니다.
  - "여성 전문 진료"가 아니라 "여성 진료"로 씁니다.
- 한의학 치료는 병원 치료와 **병행할 수 있다**는 관점으로 씁니다. 위험 신호가 있으면 병원 진료가 필요하다는 안내를 넣습니다.
- **의료광고 규칙**
  - "전문·최고·유일·완치·보장·100%" 같은 표현 금지
  - 치료 효과 단정 금지
  - 환자 후기·다른 병원과의 비교·가격 금지
  - 의과를 표방하는 키워드 금지
- 질환백과·칼럼의 작성자 표기
  - 원장이 실제로 검토한 글만 "원장 검토"로 표기합니다(원고 `status: reviewed`).
  - 자동 발행 글은 "경희늘푸른한의원 작성"으로 표기합니다(`status: published`).
- 본문에 한의원 홍보 문구를 넣지 않습니다. 한의원 안내는 사이트 로고·공통 영역으로만 합니다.
