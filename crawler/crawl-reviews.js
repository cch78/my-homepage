/**
 * 경희늘푸른한의원 리뷰 자동 크롤러
 * 네이버 플레이스 · 카카오맵 · 구글 리뷰 수집 → data/reviews.json 저장
 *
 * 실행: node crawler/crawl-reviews.js
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
  scrollTimes:  6,
};

// ─── 공통 브라우저 컨텍스트 생성 ─────────────────────────
async function makeContext(browser) {
  const context = await browser.newContext({
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return context;
}

// ─── 네이버 플레이스 ──────────────────────────────────────
async function crawlNaver(browser) {
  console.log('\n📌 네이버 플레이스 크롤링 시작...');
  const context = await makeContext(browser);
  const page = await context.newPage();
  const collected = [];

  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url.includes('review') || response.status() !== 200) return;
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const json = await response.json().catch(() => null);
      if (!json) return;

      const items =
        json?.result?.review?.visitorReviews ||
        json?.result?.review?.items ||
        json?.reviews || json?.items || [];

      for (const r of items) {
        const id   = `naver_${r.id || r.reviewId || r.visitId}`;
        const text = r.body || r.reviewContent || r.content || '';
        const author = r.writerNickName || r.authorName || r.nickName || '익명';
        const rating = r.starRating ?? r.rating ?? 5;
        const date   = (r.updateDate || r.createdAt || r.createDate || '').substring(0, 10);
        if (text && id !== 'naver_undefined')
          collected.push({ id, source: 'naver', author, rating: Number(rating), date, text });
      }
    } catch (_) {}
  });

  try {
    await page.goto('https://naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.goto(
      `https://pcmap.place.naver.com/place/${CONFIG.naverPlaceId}/review/visitor`,
      { waitUntil: 'networkidle', timeout: 40000 }
    );
    await page.waitForTimeout(3000);

    for (let i = 0; i < CONFIG.scrollTimes; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
      await page.waitForTimeout(2000);
    }

    if (collected.length === 0) {
      console.log('  API 응답 없음 — CSS 선택자로 재시도...');
      const fallback = await page.$$eval(
        'li[data-pui-component], [class*="reviewItem"], [class*="review_item"]',
        els => els.slice(0, 20).map(el => ({
          author: el.querySelector('[class*="name"], [class*="nick"]')?.textContent?.trim() || '익명',
          text:   el.querySelector('[class*="body"], [class*="text"], [class*="content"]')?.textContent?.trim() || '',
          date:   el.querySelector('[class*="date"], [class*="time"]')?.textContent?.trim() || '',
          rating: el.querySelectorAll('[class*="star"][class*="on"], [class*="ico_star_on"]').length || 5,
        })).filter(r => r.text.length > 5)
      );
      for (const [i, r] of fallback.entries())
        collected.push({ id: `naver_fallback_${Date.now()}_${i}`, source: 'naver', ...r, rating: Number(r.rating) });
    }
  } catch (e) {
    console.error('  페이지 로드 실패:', e.message);
  }

  await context.close();
  const unique = [...new Map(collected.map(r => [r.id, r])).values()];
  console.log(`  ✅ 네이버 ${unique.length}개`);
  return unique;
}

// ─── 카카오맵 ─────────────────────────────────────────────
async function crawlKakao(browser) {
  console.log('\n🟡 카카오맵 크롤링 시작...');
  const context = await makeContext(browser);
  const page = await context.newPage();
  const collected = [];

  // API 응답 인터셉트
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (response.status() !== 200) return;
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      if (!url.includes('comment') && !url.includes('review') && !url.includes('rating')) return;

      const json = await response.json().catch(() => null);
      if (!json) return;

      const items =
        json?.comment?.list ||
        json?.data?.list ||
        json?.list ||
        json?.result?.list ||
        [];

      for (const r of items) {
        const id     = `kakao_${r.id || r.commentid || r.commentId || Math.random()}`;
        const text   = r.contents || r.content || r.comment || r.body || '';
        const author = r.username || r.author || r.nickName || r.name || '익명';
        const rating = r.point ?? r.rating ?? r.starRating ?? 5;
        const date   = (r.date || r.createdAt || r.updateDate || r.commentdate || '').substring(0, 10);
        if (text)
          collected.push({ id, source: 'kakao', author, rating: Number(rating), date, text });
      }
    } catch (_) {}
  });

  try {
    await page.goto('https://map.kakao.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    await page.goto(
      `https://place.map.kakao.com/${CONFIG.kakaoPlaceId}#review`,
      { waitUntil: 'networkidle', timeout: 40000 }
    );
    await page.waitForTimeout(3000);

    for (let i = 0; i < CONFIG.scrollTimes; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
      await page.waitForTimeout(2000);
    }

    // CSS 선택자 폴백
    if (collected.length === 0) {
      console.log('  API 응답 없음 — CSS 선택자로 재시도...');
      const fallback = await page.$$eval(
        '[class*="review"], [class*="comment"], [class*="rating"], li[data-id]',
        els => els.slice(0, 30).map(el => ({
          author: (
            el.querySelector('[class*="name"], [class*="nick"], [class*="user"]')?.textContent ||
            '익명'
          ).trim(),
          text: (
            el.querySelector('[class*="txt"], [class*="content"], [class*="desc"], p')?.textContent ||
            el.textContent || ''
          ).trim().slice(0, 500),
          date: (
            el.querySelector('[class*="date"], [class*="time"], time')?.textContent || ''
          ).trim(),
          rating: el.querySelectorAll('[class*="on"], [class*="fill"], [class*="active"]').length || 5,
        })).filter(r => r.text.length > 5)
      );
      for (const [i, r] of fallback.entries())
        collected.push({ id: `kakao_fallback_${Date.now()}_${i}`, source: 'kakao', ...r, rating: Number(r.rating) || 5 });
    }
  } catch (e) {
    console.error('  페이지 로드 실패:', e.message);
  }

  await context.close();
  const unique = [...new Map(collected.map(r => [r.id, r])).values()];
  console.log(`  ✅ 카카오맵 ${unique.length}개`);
  return unique;
}

// ─── 구글 지도 ────────────────────────────────────────────
async function crawlGoogle(browser) {
  console.log('\n🔵 구글 지도 크롤링 시작...');
  const context = await makeContext(browser);
  const page = await context.newPage();
  const collected = [];

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(CONFIG.googleQuery)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(3000);

    // 첫 번째 결과 클릭
    const firstResult = await page.$('[role="article"] a, .hfpxzc, [data-cid] a, a[aria-label]');
    if (firstResult) {
      await firstResult.click();
      await page.waitForTimeout(3000);
    }

    // 리뷰 탭 클릭
    const reviewTab = await page.$('[data-tab-index="1"], button[aria-label*="리뷰"], button[aria-label*="Reviews"]');
    if (reviewTab) {
      await reviewTab.click();
      await page.waitForTimeout(2000);
    }

    // 스크롤로 리뷰 로드
    const scrollPanel = await page.$('[role="main"]');
    for (let i = 0; i < CONFIG.scrollTimes; i++) {
      if (scrollPanel) await scrollPanel.evaluate(el => el.scrollBy(0, el.clientHeight * 3));
      else await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
      await page.waitForTimeout(2000);
    }

    // 리뷰 추출
    const reviews = await page.$$eval(
      '[data-review-id], [jsdata*="review"], .jJc9Ad, [class*="review"] [class*="content"]',
      els => els.slice(0, 30).map(el => {
        const ratingEl = el.querySelector('[aria-label*="별"], [aria-label*="star"]');
        const ratingMatch = ratingEl?.getAttribute('aria-label')?.match(/\d/);
        return {
          author: (el.querySelector('[class*="name"], .d4r55, [class*="author"]')?.textContent || '익명').trim(),
          text:   (el.querySelector('[class*="text"], [class*="body"], .wiI7pd, [class*="full"]')?.textContent || el.textContent || '').trim().slice(0, 500),
          date:   (el.querySelector('[class*="date"], .rsqaWe, time')?.textContent || '').trim(),
          rating: ratingMatch ? Number(ratingMatch[0]) : 5,
        };
      }).filter(r => r.text.length > 5)
    );

    for (const [i, r] of reviews.entries())
      collected.push({ id: `google_${Date.now()}_${i}`, source: 'google', ...r });

  } catch (e) {
    console.error('  페이지 로드 실패:', e.message);
  }

  await context.close();
  const unique = [...new Map(collected.map(r => [r.id, r])).values()];
  console.log(`  ✅ 구글 ${unique.length}개`);
  return unique;
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  let existing = { lastUpdated: '', sources: {}, reviews: [] };
  if (fs.existsSync(CONFIG.outputFile)) {
    try { existing = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf-8')); } catch (_) {}
  }
  const existingIds = new Set(existing.reviews.map(r => r.id));

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  let naverReviews = [], kakaoReviews = [], googleReviews = [];
  try {
    [naverReviews, kakaoReviews, googleReviews] = await Promise.all([
      crawlNaver(browser),
      crawlKakao(browser),
      crawlGoogle(browser),
    ]);
  } finally {
    await browser.close();
  }

  const allNew = [...naverReviews, ...kakaoReviews, ...googleReviews]
    .filter(r => !existingIds.has(r.id));
  console.log(`\n새 리뷰 ${allNew.length}개 추가`);

  const merged = [...allNew, ...existing.reviews]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, CONFIG.maxTotal);

  const naverCount  = merged.filter(r => r.source === 'naver').length;
  const kakaoCount  = merged.filter(r => r.source === 'kakao').length;
  const googleCount = merged.filter(r => r.source === 'google').length;

  const output = {
    lastUpdated: new Date().toLocaleDateString('ko-KR'),
    sources: {
      naver:  { name: '네이버 플레이스', url: `https://map.naver.com/p/entry/place/${CONFIG.naverPlaceId}`, count: naverCount },
      kakao:  { name: '카카오맵',         url: `https://place.map.kakao.com/${CONFIG.kakaoPlaceId}`,        count: kakaoCount  },
      google: { name: 'Google',            url: '',                                                           count: googleCount },
    },
    reviews: merged,
  };

  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n💾 저장 완료 (네이버 ${naverCount}개 / 카카오맵 ${kakaoCount}개 / 구글 ${googleCount}개, 총 ${merged.length}개)`);
  console.log('\n배포하려면: netlify deploy --prod');
}

main().catch(console.error);
