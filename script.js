// Header scroll effect
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 50);
});

// Mobile hamburger menu
const hamburger = document.getElementById('hamburger');
const nav = document.getElementById('nav');
hamburger.addEventListener('click', () => {
  nav.classList.toggle('open');
  hamburger.classList.toggle('active');
});

// Close nav when link clicked
nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    hamburger.classList.remove('active');
  });
});

// Show/hide top button
const topBtn = document.getElementById('topBtn');
window.addEventListener('scroll', () => {
  topBtn.style.opacity = window.scrollY > 400 ? '1' : '0';
  topBtn.style.pointerEvents = window.scrollY > 400 ? 'auto' : 'none';
});
topBtn.style.opacity = '0';

// Contact form submission
const form = document.getElementById('contactForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  if (!name || !phone) {
    alert('이름과 연락처를 입력해 주세요.');
    return;
  }
  alert(`${name}님의 상담 신청이 접수되었습니다.\n빠른 시일 내에 연락드리겠습니다.`);
  form.reset();
});

// Scroll reveal animation
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(
  '.service-card, .condition-item, .info-card, .loc-item, .about-content, .about-img-wrap'
).forEach(el => {
  el.classList.add('reveal');
  observer.observe(el);
});

// Add CSS for reveal animation dynamically
const style = document.createElement('style');
style.textContent = `
  .reveal {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.55s ease, transform 0.55s ease;
  }
  .reveal.visible {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(style);

// Add staggered delay to grid items
document.querySelectorAll('.services-grid, .conditions-grid, .info-grid').forEach(grid => {
  Array.from(grid.children).forEach((child, i) => {
    child.style.transitionDelay = `${i * 0.08}s`;
  });
});

// ─── 실시간 리뷰 게시판 ───────────────────────────────────
const REVIEW_PAGE_SIZE = 6;
let allReviews = [];
let shownCount = 0;

const SOURCE_CONFIG = {
  naver:  { label: '네이버 플레이스', color: '#03c75a', textColor: '#fff' },
  google: { label: 'Google',          color: '#4285F4', textColor: '#fff' },
  kakao:  { label: '카카오맵',         color: '#e8b000', textColor: '#3c1e1e' },
};

function renderReviewCard(r) {
  const src = SOURCE_CONFIG[r.source] || { label: r.source, color: '#888', textColor: '#fff' };
  const stars = '★'.repeat(Math.min(r.rating, 5)) + '☆'.repeat(Math.max(5 - r.rating, 0));
  const safeText = r.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="live-review-card">
      <div class="lrc-header">
        <span class="lrc-source" style="background:${src.color};color:${src.textColor}">${src.label}</span>
        <span class="lrc-stars">${stars}</span>
      </div>
      <p class="lrc-text">${safeText}</p>
      <div class="lrc-footer">
        <span class="lrc-author">${r.author}</span>
        <span class="lrc-date">${r.date || ''}</span>
      </div>
    </div>`;
}

function renderStats(data) {
  const statsEl = document.getElementById('live-reviews-stats');
  if (!statsEl) return;
  statsEl.innerHTML = Object.entries(data.sources)
    .filter(([, s]) => s.count > 0)
    .map(([key, s]) => {
      const cfg = SOURCE_CONFIG[key] || { color: '#888', textColor: '#fff' };
      return `<div class="lrs-item">
        <span class="lrs-badge" style="background:${cfg.color};color:${cfg.textColor}">${s.name}</span>
        <span class="lrs-count">리뷰 ${s.count}개</span>
      </div>`;
    }).join('');
}

function showMoreReviews() {
  const grid = document.getElementById('live-reviews-grid');
  const next = allReviews.slice(shownCount, shownCount + REVIEW_PAGE_SIZE);
  next.forEach(r => grid.insertAdjacentHTML('beforeend', renderReviewCard(r)));
  shownCount += next.length;

  const moreBtn = document.getElementById('live-reviews-more');
  if (moreBtn) moreBtn.style.display = shownCount >= allReviews.length ? 'none' : 'block';
}

async function loadReviews() {
  try {
    const res = await fetch('./data/reviews.json');
    if (!res.ok) return;
    const data = await res.json();

    if (!data.reviews?.length) {
      document.getElementById('live-reviews-grid').innerHTML =
        '<p class="reviews-empty">아직 수집된 리뷰가 없습니다.<br>크롤러를 실행하면 자동으로 채워집니다.</p>';
      return;
    }

    allReviews = data.reviews;

    const updatedEl = document.getElementById('reviews-last-updated');
    if (updatedEl && data.lastUpdated) updatedEl.textContent = `마지막 업데이트: ${data.lastUpdated}`;

    renderStats(data);

    document.getElementById('live-reviews-grid').innerHTML = '';
    showMoreReviews();

    const moreBtn = document.getElementById('reviews-load-more');
    if (moreBtn) moreBtn.addEventListener('click', showMoreReviews);

  } catch (_) {}
}

loadReviews();
