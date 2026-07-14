/**
 * 경희늘푸른한의원 리뷰 자동 크롤러 (v2)
 * 네이버 플레이스 · 카카오맵 · 구글 리뷰 수집 → data/reviews.json 저장
 *
 * 실행:  node crawler/crawl-reviews.js           # 수집 + 저장
 *        node crawler/crawl-reviews.js --debug   # 원본 응답을 crawler/debug/에 함께 저장
 *
 * 소스별 수집 방식:
 *  - 네이버: 리뷰 페이지 HTML에 심어진 __APOLLO_STATE__에서 직접 추출 (+더보기 클릭)
 *  - 카카오: place-api.map.kakao.com 리뷰 API 응답 가로채기
 *  - 구글:   지도 리뷰 탭 DOM 파싱 (data-review-id 기준)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  naverPlaceId: '1471666703',
  kakaoPlaceId: '825597218',
  googleQuery:  '경희늘푸른한의원 부천 원종사거리',
  outputFile:   path.join(__dirname, '..', 'data', 'reviews.json'),
  maxTotal:     100,
};

const DEBUG = process.argv.includes('--debug');
const DEBUG_DIR = path.join(__dirname, 'debug');
if (DEBUG) fs.mkdirSync(DEBUG_DIR, { recursive: true });

function dump(name, data) {
  if (!DEBUG) return;
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(DEBUG_DIR, name), body);
}

// ─── 날짜 정규화 ─────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

/** 네이버 "7.13.월" / "24.12.25.수" / "2024.12.25." → "YYYY-MM-DD" */
function parseNaverDate(s) {
  if (!s) return '';
  const nums = String(s).match(/\d+/g);
  if (!nums) return '';
  const now = new Date();
  let y, m, d;
  if (nums.length >= 3 && (nums[0].length === 4 || Number(nums[0]) > 12)) {
    y = Number(nums[0]); m = Number(nums[1]); d = Number(nums[2]);
    if (y < 100) y += 2000;
  } else {
    y = now.getFullYear(); m = Number(nums[0]); d = Number(nums[1]);
    if (new Date(y, m - 1, d) > new Date(now.getTime() + 86400000)) y -= 1; // 미래면 작년
  }
  if (!m || !d || m > 12 || d > 31) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 구글 "2주 전" / "3개월 전" / "1년 전" → 대략적인 "YYYY-MM-DD" */
function parseGoogleRelativeDate(s) {
  if (!s) return '';
  const m = String(s).match(/(\d+)?\s*(년|개월|주|일|시간|분)/);
  if (!m) return '';
  const n = Number(m[1] || 1);
  const unitDays = { '년': 365, '개월': 30, '주': 7, '일': 1, '시간': 0, '분': 0 }[m[2]];
  const dt = new Date(Date.now() - n * unitDays * 86400000);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// ─── 품질 필터 ───────────────────────────────────────────
const JUNK_PATTERNS = [
  /^[\d.\-/\s:]+$/,            // 날짜·숫자만
  /사장님\s*Pick/i,
  /좋아요\s*개수/,
  /더보기$/,
  /^(리뷰|후기|사진|동영상)$/,
];

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function isValidReview(r) {
  const t = cleanText(r.text);
  if (t.length < 5 || t.length > 1000) return false;
  return !JUNK_PATTERNS.some((p) => p.test(t));
}

/** 같은 소스에서 내용이 같으면 중복으로 간주 */
function dedupe(reviews) {
  const seen = new Set();
  const out = [];
  for (const r of reviews) {
    const key = `${r.source}|${cleanText(r.text).slice(0, 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// ─── 공통 브라우저 컨텍스트 ──────────────────────────────
async function makeContext(browser) {
  const context = await browser.newContext({
    locale: 'ko-KR',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return context;
}

// ─── 네이버 플레이스 ─────────────────────────────────────
async function crawlNaver(browser) {
  console.log('\n📌 네이버 플레이스 수집 시작...');
  const context = await makeContext(browser);
  const page = await context.newPage();
  const collected = [];

  try {
    await page.goto(
      `https://pcmap.place.naver.com/place/${CONFIG.naverPlaceId}/review/visitor`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(5000);

    // 네이버는 로그인 없는 페이지에 최신 10개만 서버 렌더링으로 심어준다.
    // 추가 로드는 로그인 필요 → 주간 반복 실행으로 누적 수집.
    const raw = await page.evaluate(() => {
      const s = window.__APOLLO_STATE__;
      if (!s) return { reviews: [], authors: {} };
      const reviews = [];
      const authors = {};
      for (const [key, val] of Object.entries(s)) {
        if (key.startsWith('VisitorReviewAuthor:')) {
          authors[key] = val.nickname || val.objectId || '';
        } else if (key.startsWith('VisitorReview:') && val && val.body) {
          reviews.push({
            reviewId: val.reviewId || val.id || key,
            body: val.body,
            nickname: val.nickname || '',
            authorRef: val.author?.__ref || '',
            rating: val.rating,
            created: val.created || val.visited || '',
          });
        }
      }
      return { reviews, authors };
    });
    dump('naver_raw.json', raw);

    for (const r of raw.reviews) {
      collected.push({
        id: `naver_${r.reviewId}`,
        source: 'naver',
        author: r.nickname || raw.authors[r.authorRef] || '네이버 방문자',
        rating: Number(r.rating) || 5,
        date: parseNaverDate(r.created),
        text: cleanText(r.body),
      });
    }
  } catch (e) {
    console.error('  ⚠️ 네이버 수집 실패:', e.message);
  }

  await context.close();
  console.log(`  ✅ 네이버 ${collected.length}개`);
  return collected;
}

// ─── 카카오맵 ────────────────────────────────────────────
async function crawlKakao(browser) {
  console.log('\n🟡 카카오맵 수집 시작...');
  const context = await makeContext(browser);
  const page = await context.newPage();
  const collected = [];
  const rawResponses = [];

  page.on('response', async (res) => {
    try {
      if (!res.url().includes('place-api.map.kakao.com/places/tab/reviews')) return;
      if (res.status() !== 200) return;
      const json = await res.json().catch(() => null);
      if (!json || !Array.isArray(json.reviews)) return;
      rawResponses.push(json);
      for (const r of json.reviews) {
        collected.push({
          id: `kakao_${r.review_id}`,
          source: 'kakao',
          author: '카카오맵 이용자',
          rating: Number(r.star_rating) || 5,
          date: String(r.registered_at || '').slice(0, 10),
          text: cleanText(r.contents),
        });
      }
    } catch (_) {}
  });

  try {
    await page.goto(`https://place.map.kakao.com/${CONFIG.kakaoPlaceId}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(4000);

    // 후기 탭 진입 (직접 로드가 안 됐을 때 대비)
    if (collected.length === 0) {
      const tab = await page.$('a[href*="review"], a:has-text("후기"), [role="tab"]:has-text("후기")');
      if (tab) { await tab.click().catch(() => {}); await page.waitForTimeout(3000); }
    }
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    console.error('  ⚠️ 카카오맵 수집 실패:', e.message);
  }

  dump('kakao_raw.json', rawResponses);
  await context.close();
  console.log(`  ✅ 카카오맵 ${collected.length}개`);
  return collected;
}

// ─── 구글 지도 ───────────────────────────────────────────
async function crawlGoogle(browser) {
  console.log('\n🔵 구글 지도 수집 시작...');
  const context = await makeContext(browser);
  const page = await context.newPage();
  const collected = [];

  try {
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(CONFIG.googleQuery)}?hl=ko`,
      { waitUntil: 'domcontentloaded', timeout: 40000 }
    );
    await page.waitForTimeout(6000);

    // 검색 결과 목록이 뜨면 첫 번째 장소 클릭
    const firstResult = await page.$('a.hfpxzc');
    if (firstResult) {
      await firstResult.click().catch(() => {});
      await page.waitForTimeout(4000);
    }

    // 리뷰 탭 클릭
    const reviewTab = await page.$('button[role="tab"][aria-label*="리뷰"], button[role="tab"]:has-text("리뷰")');
    if (reviewTab) {
      await reviewTab.click().catch(() => {});
      await page.waitForTimeout(3000);
    }

    // 리뷰 패널 스크롤로 추가 로드
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('div[role="main"] div[tabindex="-1"]')
          || document.querySelector('div[role="main"]');
        if (feed) feed.scrollBy(0, 3000);
      });
      await page.waitForTimeout(2000);
    }

    // "자세히" 버튼 펼치기 (긴 리뷰 전문)
    await page.$$eval('button[aria-label="더보기"], button.w8nwRe', (btns) =>
      btns.slice(0, 20).forEach((b) => b.click())
    ).catch(() => {});
    await page.waitForTimeout(1000);

    const reviews = await page.$$eval('div[data-review-id]', (els) => {
      const seen = new Set();
      const out = [];
      for (const el of els) {
        const id = el.getAttribute('data-review-id');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const text = el.querySelector('.wiI7pd, [class*="text"]')?.textContent || '';
        if (!text.trim()) continue;
        const author = el.querySelector('.d4r55')?.textContent
          || el.getAttribute('aria-label') || '구글 이용자';
        const stars = el.querySelector('span[role="img"][aria-label*="별표"]')?.getAttribute('aria-label') || '';
        const starMatch = stars.match(/(\d)/);
        const date = el.querySelector('.rsqaWe')?.textContent || '';
        out.push({ id, author: author.trim(), text: text.trim(), stars: starMatch ? Number(starMatch[1]) : 5, date });
      }
      return out;
    }).catch(() => []);
    dump('google_raw.json', reviews);

    for (const r of reviews) {
      collected.push({
        id: `google_${r.id}`,
        source: 'google',
        author: r.author,
        rating: r.stars,
        date: parseGoogleRelativeDate(r.date),
        text: cleanText(r.text),
      });
    }
  } catch (e) {
    console.error('  ⚠️ 구글 수집 실패:', e.message);
  }

  await context.close();
  console.log(`  ✅ 구글 ${collected.length}개`);
  return collected;
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  let existing = { lastUpdated: '', sources: {}, reviews: [] };
  if (fs.existsSync(CONFIG.outputFile)) {
    try { existing = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf-8')); } catch (_) {}
  }
  const existingIds = new Set(existing.reviews.map((r) => r.id));

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  let naver = [], kakao = [], google = [];
  try {
    // 순차 실행: 동시 실행 시 봇 탐지 위험이 높아짐
    naver = await crawlNaver(browser);
    kakao = await crawlKakao(browser);
    google = await crawlGoogle(browser);
  } finally {
    await browser.close();
  }

  const fresh = dedupe([...naver, ...kakao, ...google].filter(isValidReview));
  const newOnes = fresh.filter((r) => !existingIds.has(r.id));
  console.log(`\n유효 리뷰 ${fresh.length}개 중 새 리뷰 ${newOnes.length}개`);

  // 새 리뷰가 없으면 파일을 건드리지 않는다 (불필요한 배포 방지)
  if (newOnes.length === 0 && existing.reviews.length > 0) {
    console.log('변경 없음 — 저장 생략');
    return;
  }

  const merged = dedupe([...newOnes, ...existing.reviews])
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, CONFIG.maxTotal);

  const count = (src) => merged.filter((r) => r.source === src).length;
  const output = {
    lastUpdated: new Date().toLocaleDateString('ko-KR'),
    sources: {
      naver:  { name: '네이버 플레이스', url: `https://map.naver.com/p/entry/place/${CONFIG.naverPlaceId}`, count: count('naver') },
      kakao:  { name: '카카오맵',        url: `https://place.map.kakao.com/${CONFIG.kakaoPlaceId}`,         count: count('kakao') },
      google: { name: 'Google',          url: '',                                                            count: count('google') },
    },
    reviews: merged,
  };

  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`💾 저장 완료 — 네이버 ${count('naver')} / 카카오맵 ${count('kakao')} / 구글 ${count('google')} (총 ${merged.length}개)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
