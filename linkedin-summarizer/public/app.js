/* ── DataPulse AI — Frontend ──────────────────────────────── */

const API = ''; // same origin (relative)

const state = {
  category: 'all',
  page: 1,
  loading: false,
  allLoaded: false,
};

const AVATAR_COLORS = {
  'VentureBeat AI':       '#0077b5',
  'MIT Technology Review':'#a8132a',
  'Towards Data Science': '#1da462',
  'KDnuggets':            '#ff6900',
  'NVIDIA Blog':          '#76b900',
  'OpenAI Blog':          '#412991',
  'Google DeepMind':      '#4285f4',
  'AI News':              '#e63946',
};

function getAvatar(source) {
  const color = AVATAR_COLORS[source] || '#0a66c2';
  const initial = source ? source[0].toUpperCase() : 'A';
  return { color, initial };
}

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCard(post, index) {
  const { color, initial } = getAvatar(post.source);
  const delay = (index % 10) * 60;
  return `
  <article class="post-card" style="animation-delay:${delay}ms" data-url="${escapeHtml(post.link)}">
    <div class="post-meta">
      <div class="source-avatar" style="background:${color}">${initial}</div>
      <div class="source-info">
        <div class="source-name">${escapeHtml(post.source)}</div>
        <div class="post-date">${timeAgo(post.pubDate)}</div>
      </div>
      <span class="category-tag">${escapeHtml(post.category)}</span>
    </div>

    <h2 class="post-title">
      <a href="${escapeHtml(post.link)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(post.title)}
      </a>
    </h2>

    <div class="summary-box">
      <div class="summary-label-small">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        Claude Summary
      </div>
      ${escapeHtml(post.summary)}
    </div>

    <div class="post-footer">
      <a class="read-full-link" href="${escapeHtml(post.link)}" target="_blank" rel="noopener noreferrer">
        Read full article
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </a>
      <div class="post-actions">
        <button class="share-btn" onclick="copyLink('${escapeHtml(post.link)}', this)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          Share
        </button>
      </div>
    </div>
  </article>`;
}

async function fetchPosts(append = false) {
  if (state.loading) return;
  state.loading = true;

  const feed = document.getElementById('postFeed');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const emptyState = document.getElementById('emptyState');

  if (!append) {
    feed.innerHTML = `<div class="skeleton-wrap">
      ${Array(5).fill('<div class="skeleton-card"></div>').join('')}
    </div>`;
    state.page = 1;
    state.allLoaded = false;
    loadMoreWrap.style.display = 'none';
    emptyState.style.display = 'none';
  }

  try {
    const res = await fetch(`${API}/api/posts?category=${encodeURIComponent(state.category)}&page=${state.page}&limit=10`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    document.getElementById('postCount').textContent =
      `${data.total} post${data.total !== 1 ? 's' : ''} · Page ${data.page} of ${data.pages}`;
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();

    if (!append) feed.innerHTML = '';

    if (data.posts.length === 0 && !append) {
      emptyState.style.display = 'block';
    } else {
      data.posts.forEach((post, i) => {
        feed.insertAdjacentHTML('beforeend', renderCard(post, i));
      });
    }

    if (data.page >= data.pages) {
      state.allLoaded = true;
      loadMoreWrap.style.display = 'none';
    } else {
      loadMoreWrap.style.display = 'block';
    }
  } catch (err) {
    feed.innerHTML = `<div class="post-card" style="text-align:center;color:var(--muted);padding:40px">
      <p style="margin-bottom:12px">Failed to load posts. Make sure the server is running.</p>
      <button class="btn btn-outline" onclick="fetchPosts()">Try Again</button>
    </div>`;
  } finally {
    state.loading = false;
  }
}

function setCategory(cat) {
  state.category = cat;
  // Update sidebar buttons
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === cat);
  });
  fetchPosts(false);
}

async function loadCategories() {
  try {
    const res = await fetch(`${API}/api/categories`);
    const data = await res.json();
    const sidebar = document.getElementById('categoryList');
    const mobile = document.getElementById('categoryPillsMobile');

    sidebar.innerHTML = '';
    mobile.innerHTML = '';

    data.categories.forEach(cat => {
      const label = cat === 'all' ? 'All Topics' : cat;
      const isActive = cat === state.category;

      const btn = document.createElement('button');
      btn.className = `category-btn${isActive ? ' active' : ''}`;
      btn.dataset.category = cat;
      btn.textContent = label;
      btn.addEventListener('click', () => setCategory(cat));
      sidebar.appendChild(btn);

      const pill = btn.cloneNode(true);
      pill.addEventListener('click', () => setCategory(cat));
      mobile.appendChild(pill);
    });
  } catch {}
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    btn.style.color = '#1da462';
    btn.style.borderColor = '#1da462';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  });
}

// ── Modal ──────────────────────────────────────────────────────
const overlay = document.getElementById('modalOverlay');
const tabBtns = document.querySelectorAll('.form-tab');

document.getElementById('openSummarizeModal').addEventListener('click', () => {
  overlay.style.display = 'flex';
});
document.getElementById('closeModal').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  overlay.style.display = 'none';
  resetModal();
}

function resetModal() {
  document.getElementById('postUrl').value = '';
  document.getElementById('postTitleUrl').value = '';
  document.getElementById('postTitleText').value = '';
  document.getElementById('postText').value = '';
  document.getElementById('summaryResult').style.display = 'none';
  document.getElementById('summaryError').style.display = 'none';
}

document.getElementById('clearModal').addEventListener('click', resetModal);

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('submitSummarize').addEventListener('click', async () => {
  const activeTab = document.querySelector('.form-tab.active').dataset.tab;
  const summaryResult = document.getElementById('summaryResult');
  const summaryError = document.getElementById('summaryError');
  const submitBtn = document.getElementById('submitSummarize');
  const submitLabel = document.getElementById('submitLabel');
  const btnSpinner = document.getElementById('btnSpinner');

  let payload = {};
  if (activeTab === 'url') {
    const url = document.getElementById('postUrl').value.trim();
    const title = document.getElementById('postTitleUrl').value.trim();
    if (!url) { alert('Please enter a URL.'); return; }
    payload = { url, title };
  } else {
    const text = document.getElementById('postText').value.trim();
    const title = document.getElementById('postTitleText').value.trim();
    if (!text) { alert('Please paste some post text.'); return; }
    payload = { text, title };
  }

  summaryResult.style.display = 'none';
  summaryError.style.display = 'none';
  submitLabel.textContent = 'Summarizing...';
  btnSpinner.style.display = 'block';
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed');

    document.getElementById('summaryText').textContent = data.summary;
    const linkEl = document.getElementById('summaryLink');
    if (payload.url) {
      linkEl.href = payload.url;
      linkEl.style.display = 'inline';
    } else {
      linkEl.style.display = 'none';
    }
    summaryResult.style.display = 'block';
  } catch (err) {
    document.getElementById('errorText').textContent = err.message || 'Something went wrong.';
    summaryError.style.display = 'flex';
  } finally {
    submitLabel.textContent = 'Generate Summary';
    btnSpinner.style.display = 'none';
    submitBtn.disabled = false;
  }
});

// ── Refresh ────────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.style.opacity = '0.5';
  try {
    await fetch(`${API}/api/refresh`, { method: 'POST' });
    await fetchPosts(false);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '';
  }
});

// ── Load more ──────────────────────────────────────────────────
document.getElementById('loadMoreBtn').addEventListener('click', () => {
  if (!state.allLoaded) {
    state.page += 1;
    fetchPosts(true);
  }
});

// ── Init ────────────────────────────────────────────────────────
(async function init() {
  await loadCategories();
  await fetchPosts(false);
})();
