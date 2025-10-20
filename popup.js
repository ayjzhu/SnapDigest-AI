const extractButton = document.getElementById('extract-btn');
const refineButton = document.getElementById('refine-btn');
const resetButton = document.getElementById('reset-btn');
const copyButton = document.getElementById('copy-btn');
const downloadButton = document.getElementById('download-btn');
const textContainer = document.getElementById('text-container');
const metadataElement = document.getElementById('metadata');
const statusElement = document.getElementById('status');
const countElement = document.getElementById('count');
const exclusionSection = document.getElementById('exclusion-section');
const exclusionList = document.getElementById('exclusion-list');

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
let selectionActive = false;
let currentTabId = null;
let minimized = false;

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
  document.body.classList.add('selection-minimized');
  try {
    window.resizeTo(defaultPopupSize.width, MINIMIZED_HEIGHT);
  } catch (error) {
    // Ignore resize failures silently; popup body class still communicates state.
  }
  minimized = true;
};

const restorePopup = () => {
  if (!minimized) {
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
  copyButton.disabled = !hasText;
  downloadButton.disabled = !hasText;
  resetButton.disabled = excludedCount === 0;
  refineButton.disabled = !hasText && !selectionActive;
  if (!selectionActive) {
    refineButton.textContent = 'Exclude Elements';
  }
  if (hasText && !selectionActive) {
    setStatus('Extraction complete.');
    restorePopup();
  }
};

const extractPageText = async () => {
  copyButton.disabled = true;
  downloadButton.disabled = true;
  refineButton.disabled = true;
  resetButton.disabled = true;
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
  refineButton.textContent = active ? 'Finish Selecting' : 'Exclude Elements';
  refineButton.disabled = !latestText && !active;
  if (active) {
    minimizePopup();
    copyButton.disabled = true;
    downloadButton.disabled = true;
    resetButton.disabled = true;
    setStatus('Selection mode active. Hover an element and click to exclude. Press Esc to cancel.', 'notice');
  } else {
    restorePopup();
    copyButton.disabled = !latestText;
    downloadButton.disabled = !latestText;
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
    restorePopup();
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
        setStatus(`Excluded ${descriptor}.`, 'info');
      }
      if (typeof excludedCount === 'number') {
        refineButton.disabled = false;
      }
      break;
    }
    case MESSAGE_TYPES.ELEMENT_RESTORED: {
      const { descriptor, all } = message.payload || {};
      if (descriptor) {
        setStatus(all ? 'Cleared all exclusions.' : `Restored ${descriptor}.`, 'info');
      }
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

chrome.runtime.onMessage.addListener(handleMessage);
extractButton.addEventListener('click', extractPageText);
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
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to reset exclusions.', 'error');
  }
});
copyButton.addEventListener('click', handleCopy);
downloadButton.addEventListener('click', handleDownload);

// Auto-trigger extraction when the popup opens for convenience.
extractPageText();
