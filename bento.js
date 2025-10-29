(() => {
  const COLS = {
    s: 'card-span-s',
    m: 'card-span-m',
    l: 'card-span-l'
  };

  const esc = (value = '') =>
    String(value).replace(/[&<>"']/g, (match) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[match]));

  const clampPercent = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return 0;
    }
    return Math.min(100, Math.max(0, num));
  };

  const statusEl = document.getElementById('bento-status');
  const setStatusText = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.hidden = !text;
  };

  const renderCard = (card) => {
    const sizeClass = COLS[card.size] || COLS.s;
    const baseClass = 'card';
    const emphasisClass = card.emphasis === 'dark' ? 'darkcard' : '';
    const accentTitle = card.emphasis === 'accent' ? 'grad-text' : '';
    const tag = card.tag ? `<span class="tag">${esc(card.tag)}</span>` : '';
    const bodyClass = 'card-body';
    const listClass = `card-list${card.emphasis === 'dark' ? ' card-list--dark' : ''}`;

    let markup = `
      <div class="${baseClass} ${emphasisClass} ${sizeClass}">
        <div class="card-block">
        ${tag}
        <h3 class="card-title ${accentTitle}">${esc(card.title)}</h3>
        ${card.body ? `<p class="${bodyClass}">${esc(card.body)}</p>` : ''}
        ${
          Array.isArray(card.bullets) && card.bullets.length
            ? `<ul class="${listClass}">
                ${card.bullets.slice(0, 6).map((bullet) => `<li>${esc(bullet)}</li>`).join('')}
              </ul>`
            : ''
        }`;

    if (typeof card.progressLeftPct === 'number' && typeof card.progressRightPct === 'number') {
      const leftPct = clampPercent(card.progressLeftPct);
      const rightPct = clampPercent(card.progressRightPct);
      markup += `
        <div class="progress-pair">
          <div>
            <div class="progress-labels">
              <span>${esc(card.progressLabelLeft || 'Left')}</span>
              <span>${Math.round(leftPct)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill grad-bg" style="width:${leftPct}%"></div>
            </div>
          </div>
          <div>
            <div class="progress-labels progress-labels--muted">
              <span>${esc(card.progressLabelRight || 'Right')}</span>
              <span>${Math.round(rightPct)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill progress-fill--muted" style="width:${rightPct}%"></div>
            </div>
          </div>
        </div>`;
    }

    if (Array.isArray(card.sourceAnchors) && card.sourceAnchors.length) {
      const links = card.sourceAnchors.slice(0, 3).map((url, index) => {
        const safeUrl = esc(url);
        return `<a href="${safeUrl}" target="_blank" rel="noopener">${index + 1}</a>`;
      }).join(' • ');
      markup += `<div class="card-sources">Sources: ${links}</div>`;
    }

    markup += '</div></div>';
    return markup;
  };

  const renderBento = (modelJson) => {
    const header = modelJson.header || {};
    document.getElementById('hdr-title').textContent = header.title || 'Digest';
    document.getElementById('hdr-subtitle').textContent = header.subtitle || '';
    const cta = document.getElementById('hdr-cta');
    cta.textContent = (header.cta && header.cta.label) || 'Read original';
    cta.href = (header.cta && header.cta.url) || '#';

    const grid = document.getElementById('bento-grid');
    grid.innerHTML = Array.isArray(modelJson.cards)
      ? modelJson.cards.map(renderCard).join('')
      : '';
  };

  const loadPayload = async (key) => {
    if (!chrome?.storage?.local?.get) {
      throw new Error('Bento renderer must be opened from the extension.');
    }
    const record = await chrome.storage.local.get(key);
    return record[key];
  };

  const bootstrap = async () => {
    const key = decodeURIComponent(window.location.hash.replace('#', '').trim());
    if (!key) {
      setStatusText('No Bento payload key provided.');
      return;
    }
    try {
      const payload = await loadPayload(key);
      if (!payload || !payload.data) {
        setStatusText('Bento payload not found or expired.');
        return;
      }
      renderBento(payload.data);
      if (payload.article?.title) {
        document.title = `${payload.article.title} | Bento Digest`;
      }
      const descriptor = payload.article?.title || payload.article?.url || '';
      setStatusText(descriptor ? `Generated from ${descriptor}` : '');
    } catch (error) {
      console.error('Failed to load Bento payload:', error);
      setStatusText(error.message || 'Unable to load Bento data.');
    }
  };

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
