(() => {
  const BENTO_JSON_SCHEMA = {
    type: 'object',
    properties: {
      header: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          cta: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              url: { type: 'string' }
            },
            required: ['label', 'url']
          }
        },
        required: ['title', 'subtitle']
      },
      cards: {
        type: 'array',
        minItems: 4,
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['lead', 'takeaway', 'stat', 'quote', 'list', 'links', 'tip'] },
            title: { type: 'string' },
            body: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            tag: { type: 'string' },
            progressLabelLeft: { type: 'string' },
            progressLabelRight: { type: 'string' },
            progressLeftPct: { type: 'number', minimum: 0, maximum: 100 },
            progressRightPct: { type: 'number', minimum: 0, maximum: 100 },
            size: { type: 'string', enum: ['s', 'm', 'l'] },
            emphasis: { type: 'string', enum: ['default', 'accent', 'dark'] },
            sourceAnchors: { type: 'array', items: { type: 'string' } }
          },
          required: ['kind', 'title', 'size']
        }
      }
    },
    required: ['header', 'cards']
  };

  const BENTO_ACTIVE_JOB_KEY = 'bento_active_job';
  const BENTO_LAST_RESULT_KEY = 'bento_last_result';
  const STAGE_SEQUENCE = ['waiting', 'preparing', 'checking', 'downloading', 'prompting', 'rendering', 'complete'];

  const statusEl = document.getElementById('panel-status');
  const articleTitleEl = document.getElementById('job-article-title');
  const articleLinkEl = document.getElementById('job-article-link');
  const progressFill = document.getElementById('progress-fill');
  const stageElements = new Map(
    Array.from(document.querySelectorAll('.stage')).map((el) => [el.dataset.stage, el])
  );
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const previewRoot = document.getElementById('preview-root');
  const openFullButton = document.getElementById('open-full');
  const downloadButton = document.getElementById('download-html');
  const activityLogEl = document.getElementById('activity-log');

  const COLS = {
    s: 'card-span-s',
    m: 'card-span-m',
    l: 'card-span-l'
  };

  let activeJobId = null;
  let jobInFlight = false;
  let currentLayout = null;
  let currentResultKey = '';
  let currentArticleMeta = {};

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

  const setStatusText = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', Boolean(isError));
  };

  const logActivity = (message) => {
    if (!activityLogEl) return;
    const entry = document.createElement('p');
    entry.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
    activityLogEl.appendChild(entry);
    while (activityLogEl.childNodes.length > 10) {
      activityLogEl.removeChild(activityLogEl.firstChild);
    }
    activityLogEl.scrollTop = activityLogEl.scrollHeight;
  };

  const setProgress = (value) => {
    if (!progressFill) return;
    const clamped = Math.max(0, Math.min(1, value));
    progressFill.style.width = `${Math.round(clamped * 100)}%`;
  };

  const updateStageDetail = (stageId, detail) => {
    const el = stageElements.get(stageId);
    if (!el) return;
    const detailEl = el.querySelector('.stage-detail');
    if (detailEl && detail) {
      detailEl.textContent = detail;
    }
  };

  const setStage = (stageId, detail) => {
    const targetIndex = STAGE_SEQUENCE.indexOf(stageId);
    stageElements.forEach((el, key) => {
      const idx = STAGE_SEQUENCE.indexOf(key);
      el.classList.toggle('active', key === stageId);
      el.classList.toggle('complete', idx !== -1 && idx < targetIndex);
    });
    if (detail) {
      updateStageDetail(stageId, detail);
    }
  };

  const setJobMeta = (article = {}) => {
    currentArticleMeta = article || {};
    articleTitleEl.textContent = article.title || 'No article selected';
    if (article.url) {
      articleLinkEl.href = article.url;
      articleLinkEl.hidden = false;
    } else {
      articleLinkEl.hidden = true;
      articleLinkEl.removeAttribute('href');
    }
  };

  const enableActions = (enabled) => {
    openFullButton.disabled = !enabled;
    downloadButton.disabled = !enabled;
  };

  const resetPreview = () => {
    currentLayout = null;
    currentResultKey = '';
    previewRoot.innerHTML = '';
    previewPlaceholder.hidden = false;
    enableActions(false);
    setProgress(0);
    setStage('waiting');
  };

  const formatArrayForPrompt = (value) => {
    if (Array.isArray(value) && value.length) {
      return JSON.stringify(value);
    }
    return '[]';
  };

  const buildBentoPrompt = (articleMeta, summaryBundle) => `System:
You are a UI content composer. Produce compact, factual bento cards from a news/blog article.
Return strictly VALID JSON matching the provided JSON Schema. No markdown. No extra keys.

User:
Here is the article context:
- Title: ${articleMeta.title || 'Unknown'}
- URL: ${articleMeta.url || 'Unknown'}
- Domain: ${articleMeta.siteName || 'Unknown'}

Summaries to use (already computed by the Summarizer API):
- Headline: ${summaryBundle.headline || ''}
- One-sentence abstract: ${summaryBundle.abstract || ''}
- Key bullets (≤8): ${formatArrayForPrompt(summaryBundle.bullets)}
- Notable quotes (speaker + quote): ${formatArrayForPrompt(summaryBundle.quotes)}
- Important numbers (label + value + unit): ${formatArrayForPrompt(summaryBundle.stats)}
- Relevant links (label + url): ${formatArrayForPrompt(summaryBundle.links)}

Task:
1) Create a concise header:
   - title: a crisp 4–8 word headline using the article’s topic.
   - subtitle: a single informative line (≤22 words).
   - cta: label "Read original" and url = ${articleMeta.url || 'Unknown'}.

2) Create 6–8 cards balancing these kinds:
   - lead (1): the big idea; use size "l".
   - takeaway (2–3): key ideas; size "m" or "s".
   - stat (1): one or two metrics; may use progress bars if comparative % available.
   - quote (0–1): one impactful quotation with attribution in body.
   - list or links (1): short bullet list (3–6 bullets) or curated links.

3) Populate fields:
   - title: ≤ 60 chars.
   - body: ≤ 220 chars, plain text.
   - bullets: optional, 3–6 items, short.
   - tag: 1–2 word category (e.g., “Overview”, “Impact”, “Market”).
   - size: s/m/l per layout guidelines.
   - emphasis: "default", "accent" for a highlight, or "dark" for contrast.
   - For a comparative stat, include progressLabelLeft/Right and progressLeftPct/progressRightPct.

4) Output strictly valid JSON that matches the schema. No commentary.`;

  const normalizeBentoResponse = (raw) => {
    if (!raw) {
      throw new Error('Prompt API returned no data.');
    }
    if (typeof raw === 'string') {
      return JSON.parse(raw);
    }
    if (typeof raw === 'object') {
      if ('output' in raw) {
        const output = raw.output;
        if (typeof output === 'string') {
          return JSON.parse(output);
        }
        if (output && typeof output === 'object') {
          return output;
        }
      }
      return raw;
    }
    throw new Error('Unexpected Prompt API response.');
  };

  const getLanguageModelApi = () => {
    if (typeof self.LanguageModel !== 'undefined') {
      return self.LanguageModel;
    }
    if (self?.ai?.languageModel) {
      return self.ai.languageModel;
    }
    if (window?.ai?.languageModel) {
      return window.ai.languageModel;
    }
    if (chrome?.ai?.languageModel) {
      return chrome.ai.languageModel;
    }
    if (globalThis?.ai?.languageModel) {
      return globalThis.ai.languageModel;
    }
    return null;
  };

  const renderCard = (card) => {
    const sizeClass = COLS[card.size] || COLS.s;
    const emphasis = card.emphasis === 'dark' ? 'darkcard' : 'card';
    const accentTitle = card.emphasis === 'accent' ? 'grad-text' : '';
    const tag = card.tag ? `<span class="tag">${esc(card.tag)}</span>` : '';
    const bodyClass = 'card-body';
    const listClass = `card-list${card.emphasis === 'dark' ? ' card-list--dark' : ''}`;

    let markup = `
      <div class="${emphasis} ${sizeClass}">
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
              <div class="progress-fill" style="background: linear-gradient(90deg, #c084fc, #7e22ce); width:${leftPct}%"></div>
            </div>
          </div>
          <div>
            <div class="progress-labels">
              <span>${esc(card.progressLabelRight || 'Right')}</span>
              <span>${Math.round(rightPct)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="background:#94a3b8; width:${rightPct}%"></div>
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

    markup += '</div>';
    return markup;
  };

  const renderPreview = (layout) => {
    if (!layout || !Array.isArray(layout.cards)) {
      return;
    }
    previewRoot.innerHTML = layout.cards.map(renderCard).join('');
    previewPlaceholder.hidden = true;
  };

  const loadPayload = async (key) => {
    const stored = await chrome.storage.local.get(key);
    return stored[key];
  };

  const persistResult = async (job, layout) => {
    const resultKey = `bento_payload_${job.id}`;
    const payload = {
      data: layout,
      article: job.articleMeta,
      summary: job.summaryBundle,
      generatedAt: Date.now()
    };

    await chrome.storage.local.set({
      [resultKey]: payload,
      [job.id]: { ...job, status: 'complete', resultKey, completedAt: payload.generatedAt },
      [BENTO_LAST_RESULT_KEY]: {
        jobId: job.id,
        resultKey,
        article: job.articleMeta,
        generatedAt: payload.generatedAt
      }
    });
    await chrome.storage.local.remove(BENTO_ACTIVE_JOB_KEY);
    return { resultKey, payload };
  };

  const generateBentoLayout = async (articleMeta, summaryBundle) => {
    setStage('checking', 'Checking Prompt API availability…');
    setProgress(0.25);
    const languageModelApi = getLanguageModelApi();
    if (!languageModelApi) {
      throw new Error('Prompt API is not available in this browser.');
    }
    let availability = 'readily';
    if (typeof languageModelApi.availability === 'function') {
      try {
        availability = await languageModelApi.availability();
      } catch (error) {
        console.warn('Prompt API availability check failed:', error);
        throw new Error('Unable to check Prompt API availability.');
      }
    }
    if (availability === 'no') {
      throw new Error('Prompt API is not available on this device.');
    }

    const createOptions = {
      temperature: 0.2,
      topK: 1,
      maxOutputTokens: 2048
    };

    if (availability === 'after-download' || availability === 'downloadable') {
      setStage('downloading', 'Downloading Gemini Nano…');
      createOptions.monitor = (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          if (typeof event.loaded === 'number') {
            const percent = Math.round(event.loaded * 100);
            setProgress(0.25 + Math.min(0.25, percent / 400));
            updateStageDetail('downloading', `Downloading model… ${percent}%`);
          }
        });
      };
    }

    const session = await languageModelApi.create(createOptions);
    try {
      setStage('prompting', 'Generating Bento cards…');
      setProgress(0.6);
      const prompt = buildBentoPrompt(articleMeta, summaryBundle);
      const response = await session.prompt(prompt, { responseConstraint: BENTO_JSON_SCHEMA });
      const parsed = normalizeBentoResponse(response);
      if (!parsed || !parsed.header || !Array.isArray(parsed.cards)) {
        throw new Error('Prompt API returned incomplete Bento data.');
      }
      return parsed;
    } finally {
      if (typeof session.destroy === 'function') {
        session.destroy();
      }
    }
  };

  const processJob = async (job) => {
    if (!job) {
      return;
    }
    jobInFlight = true;
    activeJobId = job.id;
    setJobMeta(job.articleMeta);
    previewRoot.innerHTML = '';
    previewPlaceholder.hidden = false;
    enableActions(false);
    setProgress(0);
    setStage('preparing', 'Packaging summary payload…');
    setProgress(0.15);
    setStatusText('Packaging summary for Bento render…');
    logActivity('Packaging summary payload.');
    try {
      const layout = await generateBentoLayout(job.articleMeta, job.summaryBundle);
      setStage('rendering', 'Rendering Bento preview…');
      setProgress(0.85);
      renderPreview(layout);
      const { resultKey } = await persistResult(job, layout);
      currentLayout = layout;
      currentResultKey = resultKey;
      enableActions(true);
      setProgress(1);
      setStage('complete', 'Bento grid ready.');
      setStatusText('✓ Bento grid ready. Use the buttons below to view or save.');
      logActivity('Bento render completed successfully.');
    } catch (error) {
      console.error('Bento generation error:', error);
      setStatusText(error.message || 'Unable to render Bento grid.', true);
      logActivity(`⚠ ${error.message || 'Bento render failed.'}`);
      await chrome.storage.local.set({
        [job.id]: { ...job, status: 'error', error: error.message, completedAt: Date.now() }
      });
      await chrome.storage.local.remove(BENTO_ACTIVE_JOB_KEY);
    } finally {
      jobInFlight = false;
    }
  };

  const hydrateJob = async (jobId) => {
    if (!jobId) {
      return;
    }
    if (jobInFlight && jobId === activeJobId) {
      return;
    }
    const stored = await chrome.storage.local.get(jobId);
    const job = stored[jobId];
    if (!job) {
      setStatusText('Bento job metadata not found. Re-run from the popup.', true);
      return;
    }
    setJobMeta(job.articleMeta);
    setStatusText('Resuming Bento render…');
    logActivity('Resuming Bento job.');
    if (job.status === 'complete' && job.resultKey) {
      const payload = await loadPayload(job.resultKey);
      if (payload?.data) {
        currentLayout = payload.data;
        currentResultKey = job.resultKey;
        renderPreview(payload.data);
        enableActions(true);
        setProgress(1);
        setStage('complete', 'Bento grid ready.');
        setStatusText('Loaded the latest Bento grid.');
        return;
      }
    }
    await chrome.storage.local.set({
      [job.id]: { ...job, status: 'running', startedAt: Date.now() }
    });
    await processJob(job);
  };

  const hydrateLastResult = async () => {
    const stored = await chrome.storage.local.get(BENTO_LAST_RESULT_KEY);
    const descriptor = stored[BENTO_LAST_RESULT_KEY];
    if (!descriptor || !descriptor.resultKey) {
      setStatusText('Waiting for a Bento request…');
      resetPreview();
      return;
    }
    const payload = await loadPayload(descriptor.resultKey);
    if (payload?.data) {
      setJobMeta(payload.article || descriptor.article || {});
      currentLayout = payload.data;
      currentResultKey = descriptor.resultKey;
      renderPreview(payload.data);
      enableActions(true);
      setProgress(1);
      setStage('complete', 'Latest Bento grid ready.');
      setStatusText('Showing the most recent Bento grid.');
    } else {
      setStatusText('Waiting for a Bento request…');
      resetPreview();
    }
  };

  const handleOpenFull = () => {
    if (!currentResultKey) {
      return;
    }
    const targetUrl = chrome.runtime.getURL(`bento.html#${encodeURIComponent(currentResultKey)}`);
    chrome.tabs.create({ url: targetUrl });
  };

  const sanitizeFilename = (value) =>
    (value || 'bento-digest').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'bento-digest';

  const buildExportHtml = (layout, article = {}) => {
    const dataString = JSON.stringify(layout).replace(/<\/script>/gi, '<\\/script>');
    const title = article.title ? `${article.title} | Bento Digest` : 'Bento Digest';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font-family: Inter,ui-sans-serif,system-ui; background:#f8fafc; margin:0; color:#0f172a; }
  .shell { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
  .grad-text { background: linear-gradient(90deg,#C084FC,#7E22CE); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .grad-bg { background: linear-gradient(90deg,#C084FC,#7E22CE); }
  .card { background:#fff; border:1px solid #f1f5f9; border-radius:20px; padding:24px; box-shadow:0 6px 18px rgba(15,23,42,0.08); }
  .darkcard { background:#0f172a; color:#e2e8f0; border-color:#0f172a; }
  .tag { display:inline-block; padding:4px 12px; border-radius:999px; font-size:0.75rem; font-weight:600; background:#f1f5f9; color:#475569; text-transform:uppercase; letter-spacing:0.04em; }
  .grid { display:grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap:1rem; }
  @media (min-width:768px){ .grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media (min-width:1024px){ .grid { grid-template-columns: repeat(4,minmax(0,1fr)); } }
  .card-span-s { grid-column: span 1; }
  .card-span-m { grid-column: span 1; }
  .card-span-l { grid-column: span 1; }
  @media (min-width:768px){ .card-span-m { grid-column: span 2; } .card-span-l { grid-column: span 2; } }
  @media (min-width:1024px){ .card-span-l { grid-column: span 4; } }
  .card-title { margin:8px 0 4px; font-size:1.25rem; }
  .card-body { margin:0; color:#475569; font-size:0.95rem; }
  .darkcard .card-body, .darkcard .card-list li { color:#e2e8f0; }
  .card-list { margin:0; padding-left:1.2rem; color:#0f172a; }
  .progress-track { width:100%; height:10px; border-radius:999px; background:#e2e8f0; overflow:hidden; }
  .progress-fill { height:100%; border-radius:inherit; }
</style>
</head>
<body>
  <div class="shell">
    <header class="text-center">
      <h1 class="grad-text" id="hdr-title"></h1>
      <p id="hdr-subtitle"></p>
      <a id="hdr-cta" class="grad-bg" style="display:inline-block;margin-top:16px;padding:12px 20px;border-radius:12px;color:#fff;text-decoration:none;font-weight:700;" target="_blank" rel="noopener">Read original</a>
    </header>
    <section class="grid" id="bento-grid"></section>
  </div>
<script>
const COLS = { s: 'card-span-s', m: 'card-span-m', l: 'card-span-l' };
const esc = ${esc.toString()};
const clampPercent = ${clampPercent.toString()};
const data = ${dataString};
const renderCard = ${renderCard.toString()};
(function renderBento(modelJson){
  const header = modelJson.header || {};
  document.getElementById('hdr-title').textContent = header.title || 'Bento Digest';
  document.getElementById('hdr-subtitle').textContent = header.subtitle || '';
  const cta = document.getElementById('hdr-cta');
  cta.textContent = (header.cta && header.cta.label) || 'Read original';
  cta.href = (header.cta && header.cta.url) || '#';
  document.getElementById('bento-grid').innerHTML = Array.isArray(modelJson.cards) ? modelJson.cards.map(renderCard).join('') : '';
})(data);
</script>
</body>
</html>`;
  };

  const handleDownload = () => {
    if (!currentLayout) {
      return;
    }
    const html = buildExportHtml(currentLayout, currentArticleMeta);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const fileName = `${sanitizeFilename(currentArticleMeta?.title)}.html`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const bootstrap = async () => {
    resetPreview();
    await hydrateLastResult();
    const stored = await chrome.storage.local.get(BENTO_ACTIVE_JOB_KEY);
    if (stored[BENTO_ACTIVE_JOB_KEY]) {
      await hydrateJob(stored[BENTO_ACTIVE_JOB_KEY]);
    }
  };

  openFullButton.addEventListener('click', handleOpenFull);
  downloadButton.addEventListener('click', handleDownload);

  // Track side panel visibility state
  const SIDE_PANEL_STATE_KEY = 'side_panel_open_state';
  
  // Mark panel as open when loaded
  chrome.storage.local.set({ [SIDE_PANEL_STATE_KEY]: true }).catch(() => {});
  
  // Mark panel as closed when the window/panel is about to unload
  const markPanelClosed = () => {
    chrome.storage.local.set({ [SIDE_PANEL_STATE_KEY]: false }).catch(() => {});
  };
  
  window.addEventListener('beforeunload', markPanelClosed);
  window.addEventListener('pagehide', markPanelClosed);
  window.addEventListener('unload', markPanelClosed);
  
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(changes, BENTO_ACTIVE_JOB_KEY)) {
      const newJobId = changes[BENTO_ACTIVE_JOB_KEY].newValue;
      if (newJobId) {
        hydrateJob(newJobId);
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, BENTO_LAST_RESULT_KEY) && !jobInFlight) {
      hydrateLastResult();
    }
  });

  // Listen for close message from background/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'CLOSE_SIDE_PANEL_INTERNAL') {
      // Close the sidepanel using window.close()
      window.close();
      sendResponse({ ok: true });
      return true;
    }
  });

  bootstrap();
})();
