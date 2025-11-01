const extractButton = document.getElementById('extract-btn');
const refineButton = document.getElementById('refine-btn');
const resetButton = document.getElementById('reset-btn');
const copyTextButton = document.getElementById('copy-text-btn');
const copySummaryButton = document.getElementById('copy-summary-btn');
const downloadButton = document.getElementById('download-btn');

// Debug: Check if buttons exist
if (!extractButton) console.error('Extract button not found!');
if (!refineButton) console.error('Refine button not found!');
if (!resetButton) console.error('Reset button not found!');
const summarizeButton = document.getElementById('summarize-btn');
const summaryType = document.getElementById('summary-type');
const summaryLength = document.getElementById('summary-length');
const summaryContainer = document.getElementById('summary-container');
const summarySection = document.getElementById('summary-section');
const summaryBadge = document.getElementById('summary-badge');
const textContainer = document.getElementById('text-container');
const textSection = document.getElementById('text-section');
const textBadge = document.getElementById('text-badge');
const metadataElement = document.getElementById('metadata');
const pageTitleSection = document.getElementById('page-title-section');
const pageLink = document.getElementById('page-link');
const pageTitle = document.getElementById('page-title');
const bentoButton = document.getElementById('bento-btn');
const bentoOpenPanelButton = document.getElementById('bento-open-panel-btn');
// bentoLink removed - using side panel for viewing instead
const statusElement = document.getElementById('status');
const countElement = document.getElementById('count');
const exclusionSection = document.getElementById('exclusion-section');
const exclusionList = document.getElementById('exclusion-list');
const exclusionBadge = document.getElementById('exclusion-badge');
const selectionBadge = document.getElementById('selection-badge');

// Collapsible controls
let collapseControllers = { text: null, summary: null, exclusion: null };

const makeCollapsible = (section, defaultCollapsed = false) => {
  if (!section) return null;
  section.classList.add('collapsible');
  const header = section.querySelector('h2');
  if (!header) return null;
  header.setAttribute('role', 'button');
  header.tabIndex = 0;
  header.title = 'Click to expand/collapse';
  const setExpanded = (expanded) => {
    section.classList.toggle('collapsed', !expanded);
    header.setAttribute('aria-expanded', String(expanded));
  };
  const toggle = () => setExpanded(section.classList.contains('collapsed'));
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
  setExpanded(!defaultCollapsed);
  return { setExpanded };
};

const focusSection = (targetSection) => {
  if (collapseControllers.text) {
    collapseControllers.text.setExpanded(targetSection === textSection);
  }
  if (collapseControllers.summary) {
    collapseControllers.summary.setExpanded(targetSection === summarySection);
  }
  if (collapseControllers.exclusion) {
    collapseControllers.exclusion.setExpanded(targetSection === exclusionSection);
  }
};

const MESSAGE_TYPES = {
  TEXT: 'PAGE_TEXT_RESULT',
  SELECTION_STATUS: 'PTS_SELECTION_STATUS',
  ELEMENT_EXCLUDED: 'PTS_ELEMENT_EXCLUDED',
  ELEMENT_RESTORED: 'PTS_ELEMENT_RESTORED'
};

const COMMAND_TYPES = {
  EXTRACT: 'PTS_EXTRACT_TEXT',
  START_SELECTION: 'PTS_START_SELECTION',
  STOP_SELECTION: 'PTS_STOP_SELECTION',
  RESET: 'PTS_RESET_EXCLUSIONS'
};

const STATUS_COLORS = {
  info: '#2a7a1d',
  error: '#d93025',
  notice: '#2563eb'
};

const BENTO_BUTTON_LABEL_DEFAULT = (bentoButton?.textContent || 'Render Bento Grid').trim();
const BENTO_BUTTON_LABEL_WORKING = 'Opening side panel…';
const BENTO_PANEL_BUTTON_LABEL_OPEN = 'Open Side Panel';
const BENTO_PANEL_BUTTON_LABEL_CLOSE = 'Hide Side Panel';
const BENTO_PANEL_BUTTON_TOOLTIP_OPEN = 'Show the side panel';
const BENTO_PANEL_BUTTON_TOOLTIP_CLOSE = 'Hide the side panel';
const BENTO_PANEL_BUTTON_LABEL_WORKING = 'Working…';
const BENTO_ACTIVE_JOB_KEY = 'bento_active_job';
const BENTO_LAST_RESULT_KEY = 'bento_last_result';
const SIDE_PANEL_STATE_KEY = 'side_panel_open_state';

const normalizeSidePanelState = (rawState) => {
  if (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) {
    return { ...rawState };
  }
  if (rawState === true) {
    return { __legacy__: true };
  }
  return {};
};

const getCurrentWindowId = async () => {
  try {
    const win = await chrome.windows.getCurrent();
    if (win && typeof win.id === 'number') {
      return win.id;
    }
  } catch {
    // Ignore lookup failures.
  }
  return null;
};

const isSidePanelOpenInState = (state, windowId) => {
  if (typeof windowId === 'number') {
    const key = String(windowId);
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      return Boolean(state[key]);
    }
  }
  return Boolean(state.__legacy__);
};

const getStoredSidePanelState = async (windowId) => {
  try {
    const stored = await chrome.storage.local.get(SIDE_PANEL_STATE_KEY);
    const state = normalizeSidePanelState(stored?.[SIDE_PANEL_STATE_KEY]);
    return isSidePanelOpenInState(state, windowId);
  } catch {
    return false;
  }
};

const setStoredSidePanelState = async (windowId, isOpen) => {
  try {
    const stored = await chrome.storage.local.get(SIDE_PANEL_STATE_KEY);
    const state = normalizeSidePanelState(stored?.[SIDE_PANEL_STATE_KEY]);
    if (typeof windowId === 'number') {
      const key = String(windowId);
      if (isOpen) {
        state[key] = true;
      } else {
        delete state[key];
      }
      delete state.__legacy__;
    } else if (isOpen) {
      state.__legacy__ = true;
    } else {
      delete state.__legacy__;
    }
    await chrome.storage.local.set({ [SIDE_PANEL_STATE_KEY]: state });
  } catch {
    // Ignore storage update failures.
  }
};

const INTERNAL_PAGE_PROTOCOLS = new Set([
  'about:',
  'chrome:',
  'chrome-error:',
  'chrome-extension:',
  'chrome-native:',
  'chrome-untrusted:',
  'data:',
  'devtools:',
  'edge:',
  'view-source:'
]);

const RESTRICTED_HOSTS = new Set(['chrome.google.com']);

const getTabAccessError = (tab) => {
  const url = tab?.url || '';
  if (!url) {
    return 'Unable to detect the active tab URL.';
  }
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol;
    if (INTERNAL_PAGE_PROTOCOLS.has(protocol)) {
      return 'Chrome blocks extensions from running on internal pages. Switch to a normal website and try again.';
    }
    if (protocol === 'file:') {
      return 'Chrome requires “Allow access to file URLs” to be enabled for this extension before it can read local files.';
    }
    if (RESTRICTED_HOSTS.has(parsed.hostname)) {
      return 'Chrome Web Store pages do not allow extensions to inject code. Open a different site and try again.';
    }
  } catch {
    return 'Unable to access the active tab.';
  }
  return null;
};

if (bentoOpenPanelButton) {
  bentoOpenPanelButton.removeAttribute('title');
  bentoOpenPanelButton.dataset.tooltip = BENTO_PANEL_BUTTON_TOOLTIP_OPEN;
  bentoOpenPanelButton.setAttribute('aria-label', BENTO_PANEL_BUTTON_TOOLTIP_OPEN);
}

const injectedTabs = new Set();
const fallbackWidth = Math.max(360, (window.outerWidth || document.documentElement.offsetWidth || 320) + 40);
const fallbackHeight = Math.max(260, (window.outerHeight || document.documentElement.offsetHeight || 320) + 40);
const defaultPopupSize = { width: fallbackWidth, height: fallbackHeight };
const MINIMIZED_HEIGHT = 120;

let latestText = '';
let latestExcludedCount = 0;
let latestSummary = '';
let latestSummaryType = '';
let latestSummaryLength = '';
let selectionActive = false;
let currentTabId = null;
let currentTabUrl = '';
let minimized = false;
let previewTimer = null;
let pendingPreview = false;
let latestArticleTitle = '';
let latestArticleUrl = '';
let bentoInProgress = false;
let bentoJobActive = false;
let bentoResultAvailable = false;

const PREVIEW_DURATION_MS = 1700;

const setStatus = (message, tone = 'info', streaming = false) => {
  statusElement.textContent = message || '';
  statusElement.style.color = STATUS_COLORS[tone] || STATUS_COLORS.info;
  statusElement.classList.toggle('streaming', streaming);
};

const getSiteNameFromUrl = (url = '') => {
  if (!url) {
    return '';
  }
  try {
    const hostname = new URL(url).hostname || '';
    return hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

const getArticleMeta = () => {
  const url = latestArticleUrl || '';
  return {
    title: latestArticleTitle || '',
    url,
    siteName: getSiteNameFromUrl(url)
  };
};

const deriveSummaryForPrompt = () => {
  const summaryText = (latestSummary || '').trim();
  const normalized = summaryText.replace(/\r\n/g, '\n');
  const bulletCandidates = normalized
    .split('\n')
    .map((line) => line.replace(/^[\s•*-]+/, '').trim())
    .filter(Boolean);
  const sentenceCandidates = summaryText
    ? summaryText
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [];
  const fallbackHeadline = sentenceCandidates[0] || bulletCandidates[0] || latestArticleTitle || 'Article digest';
  const abstract = sentenceCandidates.slice(0, 2).join(' ') || summaryText || fallbackHeadline;
  let bullets = bulletCandidates;
  if (!bullets.length) {
    bullets = sentenceCandidates;
  }
  if (!bullets.length && summaryText) {
    bullets = [summaryText];
  }
  return {
    headline: fallbackHeadline,
    abstract,
    bullets: bullets.slice(0, 8),
    quotes: [],
    stats: [],
    links: []
  };
};

const updateSidePanelAccess = async () => {
  if (!bentoOpenPanelButton) {
    return;
  }
  
  const windowId = await getCurrentWindowId();
  
  // Request fresh state from background to ensure accuracy
  let isPanelOpen = false;
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_SIDE_PANEL_STATE', 
      windowId 
    });
    if (response && typeof response.isOpen === 'boolean') {
      isPanelOpen = response.isOpen;
    } else {
      // Fallback to stored state if background doesn't respond
      isPanelOpen = await getStoredSidePanelState(windowId);
    }
  } catch (error) {
    // Fallback to stored state if message fails
    isPanelOpen = await getStoredSidePanelState(windowId);
  }
  
  // Button is always enabled for toggling
  bentoOpenPanelButton.disabled = false;
  
  // Update button text based on state
  const labelElement = bentoOpenPanelButton.querySelector('.label');
  if (labelElement) {
    labelElement.textContent = isPanelOpen ? BENTO_PANEL_BUTTON_LABEL_CLOSE : BENTO_PANEL_BUTTON_LABEL_OPEN;
  }
  
  // Update tooltip
  const tooltip = isPanelOpen ? BENTO_PANEL_BUTTON_TOOLTIP_CLOSE : BENTO_PANEL_BUTTON_TOOLTIP_OPEN;
  bentoOpenPanelButton.setAttribute('aria-label', tooltip);
  bentoOpenPanelButton.dataset.tooltip = tooltip;
  
  // Add visual indicator class when panel is open
  bentoOpenPanelButton.classList.toggle('panel-is-open', isPanelOpen);
};

const applyBentoLink = (descriptor) => {
  // bentoLink UI element removed - just track state for side panel
  if (descriptor && descriptor.resultKey) {
    bentoResultAvailable = true;
  } else {
    bentoResultAvailable = false;
  }
  updateSidePanelAccess();
};

const hydrateBentoLink = async () => {
  try {
    const stored = await chrome.storage.local.get(BENTO_LAST_RESULT_KEY);
    applyBentoLink(stored[BENTO_LAST_RESULT_KEY]);
  } catch {
    applyBentoLink(null);
  }
};

const hydrateBentoJobState = async () => {
  try {
    const stored = await chrome.storage.local.get(BENTO_ACTIVE_JOB_KEY);
    bentoJobActive = Boolean(stored[BENTO_ACTIVE_JOB_KEY]);
  } catch {
    bentoJobActive = false;
  }
  updateSidePanelAccess();
};

const requestSidePanel = async () => {
  const windowInfo = await chrome.windows.getCurrent().catch(() => null);
  const windowId = windowInfo?.id;

  if (!chrome?.sidePanel?.open) {
    if (!chrome?.runtime?.sendMessage) {
      throw new Error('Side panel API is not available in this context.');
    }
    const message = { type: 'BENTO_OPEN_PANEL' };
    if (windowId) {
      message.windowId = windowId;
    }
    const result = await chrome.runtime.sendMessage(message).catch((error) => {
      throw new Error(error?.message || 'Unable to open the side panel.');
    });
    if (result && result.ok === false) {
      throw new Error(result.error || 'Unable to open the side panel.');
    }
    await setStoredSidePanelState(windowId ?? null, true);
    return;
  }

  if (!windowId) {
    throw new Error('Unable to determine the window ID.');
  }

  try {
    await chrome.sidePanel.open({ windowId });
  } catch (error) {
    throw new Error(error?.message || 'Unable to open the side panel.');
  }
  await setStoredSidePanelState(windowId, true);
};

const queueBentoJob = async () => {
  const trimmedSummary = (latestSummary || '').trim();
  if (!trimmedSummary) {
    throw new Error('Generate a summary before rendering the Bento view.');
  }
  const articleMeta = getArticleMeta();
  if (!articleMeta.url) {
    throw new Error('Missing article URL. Re-run extraction and summary.');
  }
  const tabId = await ensureCurrentTab();
  const active = await chrome.storage.local.get(BENTO_ACTIVE_JOB_KEY);
  if (active[BENTO_ACTIVE_JOB_KEY]) {
    bentoJobActive = true;
    updateSidePanelAccess();
    return { jobId: active[BENTO_ACTIVE_JOB_KEY], reused: true };
  }
  const summaryBundle = deriveSummaryForPrompt();
  const jobId = `bento_job_${Date.now()}`;
  const payload = {
    id: jobId,
    tabId,
    status: 'pending',
    articleMeta,
    summaryBundle,
    summaryMeta: {
      type: latestSummaryType,
      length: latestSummaryLength
    },
    createdAt: Date.now()
  };
  await chrome.storage.local.set({
    [jobId]: payload,
    [BENTO_ACTIVE_JOB_KEY]: jobId
  });
  bentoJobActive = true;
  updateSidePanelAccess();
  try {
    await chrome.storage.local.remove(BENTO_LAST_RESULT_KEY);
  } catch (error) {
    console.warn('Failed to clear previous Bento result:', error);
  }
  return { jobId, reused: false };
};

const clearBentoState = (removeStored = false) => {
  if (removeStored) {
    chrome.storage.local.remove(BENTO_LAST_RESULT_KEY).catch(() => {});
  }
  applyBentoLink(null);
};

const refreshBentoControls = () => {
  if (!bentoButton) {
    updateSidePanelAccess();
    return;
  }
  if (bentoInProgress) {
    bentoButton.disabled = true;
    bentoButton.title = 'Generating Bento Grid...';
    updateSidePanelAccess();
    return;
  }
  const hasSummary = Boolean(latestSummary && latestSummary.trim().length);
  bentoButton.disabled = !hasSummary;
  bentoButton.title = hasSummary ? 'Generate Bento Grid visualization' : 'Generate a summary first to create a Bento Grid';
  if (!hasSummary) {
    clearBentoState(true);
  }
  updateSidePanelAccess();
};

const setBentoButtonState = (inProgress) => {
  if (!bentoButton) {
    return;
  }
  bentoInProgress = inProgress;
  bentoButton.textContent = inProgress ? BENTO_BUTTON_LABEL_WORKING : BENTO_BUTTON_LABEL_DEFAULT;
  if (inProgress) {
    bentoButton.disabled = true;
  } else {
    refreshBentoControls();
  }
};

const handleGenerateBentoRequest = async () => {
  if (!bentoButton) {
    return;
  }
  setBentoButtonState(true);
  try {
    const { reused } = await queueBentoJob();
    if (!reused) {
      applyBentoLink(null);
    }
    await requestSidePanel();
    setStatus(
      reused
        ? 'Bento render already running in the side panel.'
        : 'Bento render started in the side panel.',
      'notice'
    );
  } catch (error) {
    console.error('Failed to launch Bento builder:', error);
    setStatus(error.message || 'Unable to launch Bento builder.', 'error');
  } finally {
    setBentoButtonState(false);
  }
};

const toggleSidePanel = async () => {
  const windowId = await getCurrentWindowId();

  let isPanelOpen = false;
  isPanelOpen = await getStoredSidePanelState(windowId);

  if (!chrome?.sidePanel?.open) {
    if (!chrome?.runtime?.sendMessage) {
      throw new Error('Side panel API is not available in this context.');
    }
    const fallbackMessage = { type: 'BENTO_TOGGLE_PANEL' };
    if (windowId) {
      fallbackMessage.windowId = windowId;
    }
    const result = await chrome.runtime.sendMessage(fallbackMessage).catch((error) => {
      throw new Error(error?.message || 'Unable to toggle the side panel.');
    });
    if (result && result.ok === false) {
      throw new Error(result.error || 'Unable to toggle the side panel.');
    }
    return;
  }

  if (!windowId) {
    throw new Error('Unable to determine the window ID.');
  }

  if (isPanelOpen) {
    try {
      await chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL_INTERNAL' });
    } catch {
      // Ignore errors if the panel context is already gone.
    }
    await setStoredSidePanelState(windowId, false);
    return;
  }

  try {
    await chrome.sidePanel.open({ windowId });
  } catch (error) {
    throw new Error(error?.message || 'Unable to open the side panel.');
  }
  await setStoredSidePanelState(windowId, true);
};

const handleOpenSidePanelOnly = async () => {
  if (!bentoOpenPanelButton) {
    return;
  }
  
  bentoOpenPanelButton.disabled = true;
  const labelElement = bentoOpenPanelButton.querySelector('.label');
  
  if (labelElement) {
    labelElement.textContent = BENTO_PANEL_BUTTON_LABEL_WORKING;
  }
  bentoOpenPanelButton.setAttribute('aria-label', BENTO_PANEL_BUTTON_LABEL_WORKING);
  bentoOpenPanelButton.dataset.tooltip = BENTO_PANEL_BUTTON_LABEL_WORKING;
  
  try {
    await toggleSidePanel();
    setStatus('Side panel toggled.', 'notice');
  } catch (error) {
    console.error('Failed to toggle side panel:', error);
    setStatus(error.message || 'Unable to toggle the side panel.', 'error');
  } finally {
    // Small delay to let the state update
    setTimeout(async () => {
      await updateSidePanelAccess();
    }, 300);
  }
};

const ensureCurrentTab = async () => {
  if (currentTabId) {
    return currentTabId;
  }
  const tab = await getActiveTab();
  currentTabId = tab.id;
  currentTabUrl = tab.url || currentTabUrl;
  return currentTabId;
};

const getActiveTab = () =>
  new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tabs || tabs.length === 0) {
        reject(new Error('No active tab detected.'));
        return;
      }
      resolve(tabs[0]);
    });
  });

const getTabById = (tabId) =>
  new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });

const ensureContentScript = async (tabId) => {
  if (injectedTabs.has(tabId)) {
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    injectedTabs.add(tabId);
  } catch (error) {
    const message = error?.message || error?.toString?.() || 'Unable to inject content script.';
    if (message.includes('Cannot access contents of the page') || message.includes('Cannot access contents of url')) {
      throw new Error('Chrome blocks extensions from running on this page. Open a normal website and try again.');
    }
    throw error instanceof Error ? error : new Error(message);
  }
};

const sendMessageToTab = (tabId, message, attempt = 0) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        const messageText = runtimeError.message || '';
        const missingReceiver = messageText.includes('Receiving end does not exist');
        if (missingReceiver && attempt < 1) {
          setTimeout(() => {
            sendMessageToTab(tabId, message, attempt + 1).then(resolve).catch(reject);
          }, 75);
          return;
        }
        if (messageText.includes('The message port closed before a response was received.')) {
          resolve(response);
          return;
        }
        reject(new Error(messageText));
        return;
      }
      resolve(response);
    });
  });

const minimizePopup = () => {
  if (minimized) {
    return;
  }
  document.body.classList.remove('selection-preview');
  document.body.classList.add('selection-minimized');
  try {
    window.resizeTo(defaultPopupSize.width, MINIMIZED_HEIGHT);
  } catch (error) {
    // Ignore resize failures silently; popup body class still communicates state.
  }
  minimized = true;
};

const restorePopup = (force = false) => {
  if (!minimized && !force) {
    return;
  }
  document.body.classList.remove('selection-minimized');
  if (defaultPopupSize.width && defaultPopupSize.height) {
    try {
      window.resizeTo(defaultPopupSize.width, defaultPopupSize.height);
    } catch (error) {
      // Ignore resize failures silently.
    }
  }
  minimized = false;
};

const clearPreviewTimer = () => {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
};

const showSelectionPreview = () => {
  if (!selectionActive) {
    return;
  }
  clearPreviewTimer();
  document.body.classList.add('selection-preview');
  restorePopup(true);
  previewTimer = setTimeout(() => {
    document.body.classList.remove('selection-preview');
    if (selectionActive) {
      minimizePopup();
    }
  }, PREVIEW_DURATION_MS);
};

const updateCounts = (text, excludedCount = 0) => {
  if (!text) {
    countElement.textContent = '';
    return;
  }
  const trimmed = text.trim();
  const charCount = trimmed.length;
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  countElement.textContent = `${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} characters`;
};

const updateDividers = () => {
  // Manage divider visibility based on adjacent sections
  const divider1 = document.getElementById('divider-1');
  const divider2 = document.getElementById('divider-2');
  const divider3 = document.getElementById('divider-3');
  const divider4 = document.getElementById('divider-4');
  
  // Divider 1: between page title and action bar
  if (divider1) {
    divider1.hidden = pageTitleSection?.hidden !== false;
  }
  
  // Divider 2: between action bar and text section
  if (divider2) {
    divider2.hidden = false; // Always show if we have actions
  }
  
  // Divider 3: between text section and summary section
  if (divider3) {
    divider3.hidden = textSection?.classList.contains('empty') || summarySection?.hidden !== false;
  }
  
  // Divider 4: between summary section and exclusion section
  if (divider4) {
    divider4.hidden = summarySection?.hidden !== false || exclusionSection?.hidden !== false;
  }
};

const renderExclusions = (items = []) => {
  exclusionList.innerHTML = '';
  if (!items.length) {
    exclusionSection.hidden = true;
    if (exclusionBadge) {
      exclusionBadge.textContent = '';
    }
    updateDividers();
    return;
  }
  exclusionSection.hidden = false;
  
  // Update exclusion badge
  if (exclusionBadge) {
    const count = items.length;
    exclusionBadge.textContent = `${count} exclusion${count === 1 ? '' : 's'}`;
  }
  
  items.forEach((descriptor) => {
    const listItem = document.createElement('li');
    listItem.textContent = descriptor;
    exclusionList.appendChild(listItem);
  });
  updateDividers();
};

const populateText = ({ text, title, url, excludedCount = 0, excluded = [] }) => {
  latestText = text || '';
  latestExcludedCount = excludedCount;
  latestArticleTitle = title || '';
  latestArticleUrl = url || '';
  textContainer.textContent = latestText;
  
  // Update page title section
  if (pageTitleSection && pageLink && pageTitle) {
    if (title || url) {
      pageTitleSection.hidden = false;
      pageTitle.textContent = title || url || 'Untitled';
      pageLink.href = url || '#';
      if (!url) {
        pageLink.style.pointerEvents = 'none';
        pageLink.style.cursor = 'default';
      } else {
        pageLink.style.pointerEvents = '';
        pageLink.style.cursor = '';
      }
    } else {
      pageTitleSection.hidden = true;
    }
  }
  
  updateCounts(latestText, excludedCount);
  renderExclusions(excluded);
  const hasText = latestText.length > 0;
  
  // Show/hide text section based on content
  if (hasText) {
    textSection.classList.remove('empty');
  } else {
    textSection.classList.add('empty');
  }
  
  if (copyTextButton) copyTextButton.disabled = !hasText;
  downloadButton.disabled = !hasText;
  summarizeButton.disabled = !hasText;
  resetButton.disabled = excludedCount === 0;
  refineButton.disabled = !hasText && !selectionActive;
  if (!selectionActive) {
    refineButton.textContent = 'Exclude Elements';
  }
  if (hasText && !selectionActive) {
    setStatus('Extraction complete.');
    restorePopup(true);
  }
  if (!hasText) {
    clearBentoState(true);
  }
  refreshBentoControls();
  updateDividers();
};

const setupCollapsibleSections = () => {
  // Initialize collapsible behavior
  collapseControllers.text = makeCollapsible(textSection, false);
  collapseControllers.summary = makeCollapsible(summarySection, false); // Expanded by default
  collapseControllers.exclusion = makeCollapsible(exclusionSection, true);
};

const extractPageText = async (clearSummary = true) => {
  console.log('extractPageText called, clearSummary:', clearSummary);
  if (copyTextButton) copyTextButton.disabled = true;
  downloadButton.disabled = true;
  summarizeButton.disabled = true;
  refineButton.disabled = true;
  resetButton.disabled = true;
  
  setStatus('Extracting…', 'notice');
  try {
    const tab = await getActiveTab();
    console.log('Active tab:', tab);
    currentTabId = tab.id;
    currentTabUrl = tab.url || currentTabUrl;

    const accessError = getTabAccessError(tab);
    if (accessError) {
      throw new Error(accessError);
    }

    if (clearSummary) {
      latestSummary = '';
      latestSummaryType = '';
      latestSummaryLength = '';
      summaryContainer.textContent = '';
      summarySection.hidden = true;
      summaryBadge.textContent = '';
      if (copySummaryButton) copySummaryButton.disabled = true;
      clearBentoState(true);
      refreshBentoControls();
      updateDividers();
      
      try {
        const key = `summary_${tab.id}`;
        await chrome.storage.local.remove(key);
      } catch (error) {
        console.warn('Failed to clear summary:', error);
      }
    }

    await ensureContentScript(tab.id);
    const response = await sendMessageToTab(tab.id, { type: COMMAND_TYPES.EXTRACT });
    console.log('Received response from content script:', response);
    
    // Handle the response directly if it contains extraction data
    if (response && typeof response.text !== 'undefined') {
      populateText(response);
    } else {
      console.warn('No data in sendMessageToTab response, waiting for runtime message...');
      // The old flow via handleMessage will still work as fallback
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to extract text.', 'error');
  } finally {
    const hasText = latestText.length > 0;
    if (copyTextButton) copyTextButton.disabled = !hasText;
    downloadButton.disabled = !hasText;
    summarizeButton.disabled = !hasText;
    refineButton.disabled = !hasText && !selectionActive;
    resetButton.disabled = latestExcludedCount === 0;
    refreshBentoControls();
  }
};

const updateSelectionUI = (active) => {
  selectionActive = active;
  pendingPreview = false;
  refineButton.textContent = active ? 'Finish Selecting' : 'Exclude Elements';
  refineButton.disabled = !latestText && !active;
  if (selectionBadge) {
    selectionBadge.hidden = !active;
  }
  document.body.classList.toggle('selection-active', active);
  if (active) {
    clearPreviewTimer();
    minimizePopup();
    if (copyTextButton) copyTextButton.disabled = true;
    downloadButton.disabled = true;
    summarizeButton.disabled = true;
    resetButton.disabled = true;
    setStatus('Selection mode active. Hover an element and click to exclude. Press Esc to cancel.', 'notice');
  } else {
    clearPreviewTimer();
    document.body.classList.remove('selection-preview');
    restorePopup(true);
    if (copyTextButton) copyTextButton.disabled = !latestText;
    downloadButton.disabled = !latestText;
    summarizeButton.disabled = !latestText;
    resetButton.disabled = latestExcludedCount === 0;
  }
};

const toggleSelectionMode = async () => {
  try {
    let tab = null;
    if (currentTabId) {
      try {
        tab = await getTabById(currentTabId);
      } catch {
        tab = null;
      }
    }
    if (!tab) {
      tab = await getActiveTab();
    }
    currentTabId = tab.id;
    currentTabUrl = tab.url || currentTabUrl;

    const accessError = getTabAccessError(tab);
    if (accessError) {
      throw new Error(accessError);
    }

    await ensureContentScript(tab.id);
    
    const wasActive = selectionActive;
    const command = wasActive ? COMMAND_TYPES.STOP_SELECTION : COMMAND_TYPES.START_SELECTION;
    
    console.log('Toggle selection mode:', wasActive ? 'stopping' : 'starting');
    
    await sendMessageToTab(tab.id, { type: command });
    
    if (!wasActive) {
      // Starting selection mode - optimistically update UI
      pendingPreview = false;
      document.body.classList.add('selection-active');
      if (selectionBadge) {
        selectionBadge.hidden = false;
      }
      refineButton.textContent = 'Finish Selecting';
      refineButton.disabled = false;
      setStatus('Preparing selection mode…', 'notice');
      minimizePopup();
    } else {
      // Stopping selection mode - optimistically update UI immediately
      console.log('Stopping selection - updating UI');
      selectionActive = false;
      refineButton.textContent = 'Exclude Elements';
      refineButton.disabled = !latestText;
      if (selectionBadge) {
        selectionBadge.hidden = true;
      }
      document.body.classList.remove('selection-active', 'selection-preview');
      restorePopup(true);
      
      // Re-enable buttons
      if (copyTextButton) copyTextButton.disabled = !latestText;
      downloadButton.disabled = !latestText;
      summarizeButton.disabled = !latestText;
      resetButton.disabled = latestExcludedCount === 0;
      
      setStatus('Finishing selection…', 'notice');
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to toggle selection.', 'error');
    selectionActive = false;
    refineButton.textContent = 'Exclude Elements';
    refineButton.disabled = !latestText;
    clearPreviewTimer();
    document.body.classList.remove('selection-active', 'selection-preview');
    if (selectionBadge) {
      selectionBadge.hidden = true;
    }
    restorePopup(true);
  }
};

const handleMessage = (message, sender) => {
  if (!message || !message.type) {
    return;
  }

  if (sender?.tab?.id) {
    currentTabId = sender.tab.id;
    currentTabUrl = sender.tab.url || currentTabUrl;
  }

  switch (message.type) {
    case MESSAGE_TYPES.TEXT:
      populateText(message.payload || {});
      if (selectionActive && pendingPreview) {
        showSelectionPreview();
        pendingPreview = false;
      }
      break;
    case MESSAGE_TYPES.SELECTION_STATUS: {
      const { active = false, reason } = message.payload || {};
      console.log('Received SELECTION_STATUS:', { active, reason, currentState: selectionActive });
      
      // Only update UI if state actually changed (avoid redundant updates)
      if (selectionActive !== active) {
        updateSelectionUI(active);
      }
      
      if (!active) {
        if (reason === 'cancelled') {
          setStatus('Selection cancelled.', 'info');
        } else if (reason === 'reset') {
          setStatus('Cleared exclusions.', 'info');
        } else if (reason === 'complete') {
          setStatus('Selection applied. Refreshing text…', 'notice');
          // Auto-extract text after finishing selection to show updated content
          extractPageText(false);
        }
      }
      break;
    }
    case MESSAGE_TYPES.ELEMENT_EXCLUDED: {
      const { descriptor, excludedCount } = message.payload || {};
      if (descriptor) {
        setStatus(`Excluded ${descriptor}. Continue selecting or press Finish when you're done.`, 'notice');
      }
      if (typeof excludedCount === 'number') {
        refineButton.disabled = false;
      }
      pendingPreview = true;
      break;
    }
    case MESSAGE_TYPES.ELEMENT_RESTORED: {
      const { descriptor, all } = message.payload || {};
      if (descriptor) {
        setStatus(all ? 'Cleared all exclusions.' : `Restored ${descriptor}.`, 'info');
      }
      pendingPreview = true;
      break;
    }
    default:
      break;
  }
};

const handleCopyText = async () => {
  if (!latestText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestText);
    setStatus('Extracted text copied to clipboard.', 'info');
    
    // Visual feedback on button
    if (copyTextButton) {
      copyTextButton.classList.add('copied');
      setTimeout(() => {
        copyTextButton.classList.remove('copied');
      }, 600);
    }
  } catch (error) {
    console.error(error);
    setStatus('Clipboard copy failed.', 'error');
  }
};

const handleCopySummary = async () => {
  if (!latestSummary) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestSummary);
    setStatus('Summary copied to clipboard.', 'info');
    
    // Visual feedback on button
    if (copySummaryButton) {
      copySummaryButton.classList.add('copied');
      setTimeout(() => {
        copySummaryButton.classList.remove('copied');
      }, 600);
    }
  } catch (error) {
    console.error(error);
    setStatus('Clipboard copy failed.', 'error');
  }
};

const handleDownload = () => {
  if (!latestText) {
    return;
  }
  const blob = new Blob([latestText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'page-text.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setStatus('Download ready.', 'info');
};

const saveSummary = async (summary, type, length) => {
  try {
    const tab = await getActiveTab();
    const key = `summary_${tab.id}`;
    await chrome.storage.local.set({
      [key]: {
        summary,
        type,
        length,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.warn('Failed to save summary:', error);
  }
};

const loadSummary = async () => {
  try {
    const tab = await getActiveTab();
    const key = `summary_${tab.id}`;
    const result = await chrome.storage.local.get(key);
    if (result[key]) {
      return result[key];
    }
  } catch (error) {
    console.warn('Failed to load summary:', error);
  }
  return null;
};

const displaySummary = (summary, type, length) => {
  latestSummary = summary;
  latestSummaryType = type;
  latestSummaryLength = length;
  summaryContainer.textContent = summary;
  summarySection.hidden = false;
  
  // Update summary badge
  const wordCount = summary.trim().split(/\s+/).length;
  summaryBadge.textContent = `${wordCount} words · ${type} · ${length}`;
  
  // Enable copy summary button
  if (copySummaryButton) copySummaryButton.disabled = false;
  
  refreshBentoControls();
  updateDividers();
};

// Determine a supported output language for the Summarizer API.
// The API currently supports a limited set; prefer the user's UI language,
// falling back to English.
const getPreferredOutputLanguage = () => {
  const supported = ['en', 'es', 'ja'];
  const candidates = [];
  const docLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  if (docLang) candidates.push(docLang);
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages.map((l) => String(l).toLowerCase()));
  }
  if (navigator.language) {
    candidates.push(String(navigator.language).toLowerCase());
  }
  for (const cand of candidates) {
    const hit = supported.find((code) => cand.startsWith(code));
    if (hit) return hit;
  }
  return 'en';
};

const handleSummarize = async () => {
  if (!latestText) {
    return;
  }
  summarizeButton.disabled = true;
  
  // Clear previous summary and show section
  summaryContainer.textContent = '';
  summarySection.hidden = false;
  summaryBadge.textContent = 'generating...';
  summaryBadge.classList.add('generating'); // Start flashing animation immediately
  clearBentoState(true);
  refreshBentoControls();
  updateDividers();
  
  // Focus summary and minimize other sections
  focusSection(summarySection);
  
  // Scroll summary section into view
  setTimeout(() => {
    summarySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
  
  try {
    // Check if the Summarizer API is available
    if (typeof self.Summarizer === 'undefined') {
      throw new Error('Summarizer API is not available in this browser.');
    }

    // Check availability
    const availability = await self.Summarizer.availability();
    if (availability === 'no') {
      throw new Error('Summarizer API is not available on this device.');
    }

    // Create summarizer options
    const currentType = summaryType.value;
    const currentLength = summaryLength.value;
    const preferredLanguage = getPreferredOutputLanguage();
    const options = {
      type: currentType,
      length: currentLength,
      format: 'plain-text',
      sharedContext: '',
      outputLanguage: preferredLanguage
    };

    // Add download progress monitor if model needs downloading
    if (availability === 'after-download') {
      options.monitor = (m) => {
        m.addEventListener('downloadprogress', (e) => {
          setStatus(`Downloading model: ${Math.round(e.loaded * 100)}%`, 'notice', true);
        });
      };
    }

    // Create the summarizer
    const summarizer = await self.Summarizer.create(options);

    // Generate streaming summary - status shown in badge, not in status area
    const stream = await summarizer.summarizeStreaming(latestText, {
      context: '',
      outputLanguage: preferredLanguage
    });

    let fullSummary = '';
    let previousLength = 0;

    for await (const chunk of stream) {
      // Chrome may yield either incremental deltas or the full text-so-far.
      const piece = typeof chunk === 'string'
        ? chunk
        : (chunk?.text ?? chunk?.content ?? String(chunk ?? ''));

      // If piece already contains the accumulated text, treat it as full text-so-far.
      if (piece.startsWith(fullSummary)) {
        fullSummary = piece;
      } else {
        fullSummary += piece;
      }

      summaryContainer.textContent = fullSummary;
      
      // Auto-scroll to bottom of summary container as text grows
      summaryContainer.scrollTop = summaryContainer.scrollHeight;

      const trimmed = fullSummary.trim();
      const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
      
      // Update badge with flashing animation during generation (removed "so far")
      summaryBadge.textContent = `generating... ${wordCount} words`;
      summaryBadge.classList.add('generating');

      if (fullSummary.length - previousLength > 20) {
        previousLength = fullSummary.length;
      }
    }

    // Display and save the final summary
    displaySummary(fullSummary, currentType, currentLength);
    await saveSummary(fullSummary, currentType, currentLength);
    
    // Remove generating class after completion
    summaryBadge.classList.remove('generating');
    setStatus('✓ Summary complete.', 'info', false);

    // Clean up
    summarizer.destroy();
  } catch (error) {
    console.error('Summarization error:', error);
    summaryBadge.classList.remove('generating');
    summaryBadge.textContent = 'error';
    setStatus(error.message || 'Failed to summarize.', 'error');
    // Keep whatever partial summary we have visible for the user.
  } finally {
    summarizeButton.disabled = !latestText;
  }
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(changes, BENTO_LAST_RESULT_KEY)) {
    applyBentoLink(changes[BENTO_LAST_RESULT_KEY].newValue);
  }
  if (Object.prototype.hasOwnProperty.call(changes, BENTO_ACTIVE_JOB_KEY)) {
    bentoJobActive = Boolean(changes[BENTO_ACTIVE_JOB_KEY].newValue);
    updateSidePanelAccess();
  }
  if (Object.prototype.hasOwnProperty.call(changes, SIDE_PANEL_STATE_KEY)) {
    updateSidePanelAccess();
  }
});

// Refresh side panel state when popup becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateSidePanelAccess();
  }
});

chrome.runtime.onMessage.addListener(handleMessage);

// Event listeners with null checks
if (extractButton) {
  extractButton.addEventListener('click', () => {
    console.log('Extract button clicked!');
    extractPageText(true);
  });
} else {
  console.error('extractButton is null - cannot attach event listener');
}

if (refineButton) {
  refineButton.addEventListener('click', toggleSelectionMode);
}

if (resetButton) {
  resetButton.addEventListener('click', async () => {
    if (!currentTabId) {
    const tab = await getActiveTab();
    currentTabId = tab.id;
  }
  try {
    await ensureContentScript(currentTabId);
    resetButton.disabled = true;
    setStatus('Resetting…', 'notice', true);
    await sendMessageToTab(currentTabId, { type: COMMAND_TYPES.RESET });
    
    // Clear stored summary when resetting
    const key = `summary_${currentTabId}`;
    await chrome.storage.local.remove(key);
    
    // Clear summary UI
    latestSummary = '';
    latestSummaryType = '';
    latestSummaryLength = '';
    summaryContainer.textContent = '';
    summarySection.hidden = true;
    summaryBadge.textContent = '';
    if (copySummaryButton) copySummaryButton.disabled = true;
    clearBentoState(true);
    refreshBentoControls();
    updateDividers();
    
    setStatus('✓ Reset complete.', 'info', false);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to reset.', 'error', false);
  }
  });
}

if (copyTextButton) copyTextButton.addEventListener('click', handleCopyText);
if (copySummaryButton) copySummaryButton.addEventListener('click', handleCopySummary);
if (downloadButton) downloadButton.addEventListener('click', handleDownload);
if (summarizeButton) summarizeButton.addEventListener('click', handleSummarize);
if (bentoButton) bentoButton.addEventListener('click', handleGenerateBentoRequest);
if (bentoOpenPanelButton) bentoOpenPanelButton.addEventListener('click', handleOpenSidePanelOnly);

// Initialize: restore saved summary and auto-trigger extraction
const initializePopup = async () => {
  // Setup collapsible sections
  setupCollapsibleSections();
  
  // Reset selection state UI on popup open (popup should always start fresh)
  selectionActive = false;
  document.body.classList.remove('selection-active', 'selection-minimized', 'selection-preview');
  if (selectionBadge) {
    selectionBadge.hidden = true;
  }
  refineButton.textContent = 'Exclude Elements';
  
  await hydrateBentoLink();
  await hydrateBentoJobState();
  
  // Update side panel state with fresh query from background
  // This ensures the button shows the correct state on popup open
  await updateSidePanelAccess();
  
  refreshBentoControls();
  
  // Try to load saved summary first
  const savedSummary = await loadSummary();
  if (savedSummary && savedSummary.summary) {
    displaySummary(savedSummary.summary, savedSummary.type, savedSummary.length);
  }
  
  // Auto-trigger extraction (without clearing the restored summary)
  extractPageText(false);
};

initializePopup();
