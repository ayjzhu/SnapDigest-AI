const extractButton = document.getElementById('extract-btn');
const refineButton = document.getElementById('refine-btn');
const resetButton = document.getElementById('reset-btn');
const copyButton = document.getElementById('copy-btn');
const downloadButton = document.getElementById('download-btn');
const summarizeButton = document.getElementById('summarize-btn');
const summaryType = document.getElementById('summary-type');
const summaryLength = document.getElementById('summary-length');
const summaryContainer = document.getElementById('summary-container');
const summarySection = document.getElementById('summary-section');
const summaryBadge = document.getElementById('summary-badge');
const textContainer = document.getElementById('text-container');
const textBadge = document.getElementById('text-badge');
const metadataElement = document.getElementById('metadata');
const statusElement = document.getElementById('status');
const countElement = document.getElementById('count');
const exclusionSection = document.getElementById('exclusion-section');
const exclusionList = document.getElementById('exclusion-list');
const selectionBadge = document.getElementById('selection-badge');

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
let minimized = false;
let previewTimer = null;
let pendingPreview = false;

const PREVIEW_DURATION_MS = 1700;

const setStatus = (message, tone = 'info') => {
  statusElement.textContent = message || '';
  statusElement.style.color = STATUS_COLORS[tone] || STATUS_COLORS.info;
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

const ensureContentScript = async (tabId) => {
  if (injectedTabs.has(tabId)) {
    return;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  injectedTabs.add(tabId);
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
  const exclusionSuffix = excludedCount ? ` · ${excludedCount} exclusion${excludedCount === 1 ? '' : 's'}` : '';
  countElement.textContent = `${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} characters${exclusionSuffix}`;
};

const renderExclusions = (items = []) => {
  exclusionList.innerHTML = '';
  if (!items.length) {
    exclusionSection.hidden = true;
    return;
  }
  exclusionSection.hidden = false;
  items.forEach((descriptor) => {
    const listItem = document.createElement('li');
    listItem.textContent = descriptor;
    exclusionList.appendChild(listItem);
  });
};

const populateText = ({ text, title, url, excludedCount = 0, excluded = [] }) => {
  latestText = text || '';
  latestExcludedCount = excludedCount;
  textContainer.textContent = latestText;
  metadataElement.textContent = title ? `${title} — ${url}` : url;
  updateCounts(latestText, excludedCount);
  renderExclusions(excluded);
  const hasText = latestText.length > 0;
  
  // Update text badge
  if (hasText) {
    const wordCount = latestText.trim().split(/\s+/).length;
    textBadge.textContent = `${wordCount} words`;
  } else {
    textBadge.textContent = '';
  }
  
  copyButton.disabled = !hasText;
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
};

const extractPageText = async (clearSummary = true) => {
  copyButton.disabled = true;
  downloadButton.disabled = true;
  summarizeButton.disabled = true;
  refineButton.disabled = true;
  resetButton.disabled = true;
  
  // Clear old summary when extracting new text (but not on initial load)
  if (clearSummary) {
    latestSummary = '';
    latestSummaryType = '';
    latestSummaryLength = '';
    summaryContainer.textContent = '';
    summarySection.hidden = true;
    summaryBadge.textContent = '';
    
    // Clear stored summary
    try {
      const tab = await getActiveTab();
      const key = `summary_${tab.id}`;
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.warn('Failed to clear summary:', error);
    }
  }
  
  setStatus('Extracting…', 'notice');
  try {
    const tab = await getActiveTab();
    currentTabId = tab.id;
    await ensureContentScript(tab.id);
    await sendMessageToTab(tab.id, { type: COMMAND_TYPES.EXTRACT });
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to extract text.', 'error');
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
    copyButton.disabled = true;
    downloadButton.disabled = true;
    summarizeButton.disabled = true;
    resetButton.disabled = true;
    setStatus('Selection mode active. Hover an element and click to exclude. Press Esc to cancel.', 'notice');
  } else {
    clearPreviewTimer();
    document.body.classList.remove('selection-preview');
    restorePopup(true);
    copyButton.disabled = !latestText;
    downloadButton.disabled = !latestText;
    summarizeButton.disabled = !latestText;
    resetButton.disabled = latestExcludedCount === 0;
  }
};

const toggleSelectionMode = async () => {
  try {
    const tab = currentTabId
      ? { id: currentTabId }
      : await getActiveTab();
    currentTabId = tab.id;
    await ensureContentScript(tab.id);
    const command = selectionActive ? COMMAND_TYPES.STOP_SELECTION : COMMAND_TYPES.START_SELECTION;
    await sendMessageToTab(tab.id, { type: command });
    if (!selectionActive) {
      // Optimistically update UI; will be confirmed via selection status message.
      pendingPreview = false;
      document.body.classList.add('selection-active');
      if (selectionBadge) {
        selectionBadge.hidden = false;
      }
      refineButton.textContent = 'Finish Selecting';
      refineButton.disabled = false;
      setStatus('Preparing selection mode…', 'notice');
      minimizePopup();
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
      updateSelectionUI(active);
      if (!active) {
        if (reason === 'cancelled') {
          setStatus('Selection cancelled.', 'info');
        } else if (reason === 'reset') {
          setStatus('Cleared exclusions.', 'info');
        } else if (reason === 'complete' && latestText) {
          setStatus('Selection applied. Refreshing text…', 'notice');
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

const handleCopy = async () => {
  if (!latestText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestText);
    setStatus('Copied to clipboard.', 'info');
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
};

const handleSummarize = async () => {
  if (!latestText) {
    return;
  }
  summarizeButton.disabled = true;
  setStatus('Summarizing...', 'notice');
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
    const options = {
      type: currentType,
      length: currentLength,
      format: 'plain-text'
    };

    // Add download progress monitor if model needs downloading
    if (availability === 'after-download') {
      options.monitor = (m) => {
        m.addEventListener('downloadprogress', (e) => {
          setStatus(`Downloading model: ${Math.round(e.loaded * 100)}%`, 'notice');
        });
      };
    }

    // Create the summarizer
    const summarizer = await self.Summarizer.create(options);

    // Generate summary
    setStatus('Generating summary...', 'notice');
    const summary = await summarizer.summarize(latestText);
    
    // Display and save the summary
    displaySummary(summary, currentType, currentLength);
    await saveSummary(summary, currentType, currentLength);
    setStatus('Summary complete.', 'info');
    
    // Clean up
    summarizer.destroy();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Failed to summarize.', 'error');
  } finally {
    summarizeButton.disabled = !latestText;
  }
};

chrome.runtime.onMessage.addListener(handleMessage);
extractButton.addEventListener('click', () => extractPageText(true));
refineButton.addEventListener('click', toggleSelectionMode);
resetButton.addEventListener('click', async () => {
  if (!currentTabId) {
    const tab = await getActiveTab();
    currentTabId = tab.id;
  }
  try {
    await ensureContentScript(currentTabId);
    resetButton.disabled = true;
    await sendMessageToTab(currentTabId, { type: COMMAND_TYPES.RESET });
    setStatus('Clearing exclusions…', 'notice');
    
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
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to reset exclusions.', 'error');
  }
});
copyButton.addEventListener('click', handleCopy);
downloadButton.addEventListener('click', handleDownload);
summarizeButton.addEventListener('click', handleSummarize);

// Initialize: restore saved summary and auto-trigger extraction
const initializePopup = async () => {
  // Try to load saved summary first
  const savedSummary = await loadSummary();
  if (savedSummary && savedSummary.summary) {
    displaySummary(savedSummary.summary, savedSummary.type, savedSummary.length);
  }
  
  // Auto-trigger extraction (without clearing the restored summary)
  extractPageText(false);
};

initializePopup();
