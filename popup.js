const extractButton = document.getElementById('extract-btn');
const copyButton = document.getElementById('copy-btn');
const downloadButton = document.getElementById('download-btn');
const textContainer = document.getElementById('text-container');
const metadataElement = document.getElementById('metadata');
const statusElement = document.getElementById('status');
const countElement = document.getElementById('count');

const MESSAGE_TYPE = 'PAGE_TEXT_RESULT';
let latestText = '';

const setStatus = (message, isError = false) => {
  statusElement.textContent = message || '';
  statusElement.style.color = isError ? '#d93025' : '#2a7a1d';
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

const executeContentScript = (tabId) =>
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });

const updateCounts = (text) => {
  if (!text) {
    countElement.textContent = '';
    return;
  }
  const trimmed = text.trim();
  const charCount = trimmed.length;
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  countElement.textContent = `${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} characters`;
};

const populateText = ({ text, title, url }) => {
  latestText = text || '';
  textContainer.textContent = latestText;
  metadataElement.textContent = title ? `${title} — ${url}` : url;
  updateCounts(latestText);
  const hasText = latestText.length > 0;
  copyButton.disabled = !hasText;
  downloadButton.disabled = !hasText;
};

const extractPageText = async () => {
  copyButton.disabled = true;
  downloadButton.disabled = true;
  setStatus('Extracting…');
  try {
    const tab = await getActiveTab();
    await executeContentScript(tab.id);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to extract text.', true);
  }
};

const handleMessage = (message, sender) => {
  if (!message || message.type !== MESSAGE_TYPE) {
    return;
  }
  if (sender?.tab?.id) {
    setStatus('Extraction complete.');
  }
  populateText(message.payload || {});
};

const handleCopy = async () => {
  if (!latestText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestText);
    setStatus('Copied to clipboard.');
  } catch (error) {
    console.error(error);
    setStatus('Clipboard copy failed.', true);
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
  setStatus('Download ready.');
};

chrome.runtime.onMessage.addListener(handleMessage);
extractButton.addEventListener('click', extractPageText);
copyButton.addEventListener('click', handleCopy);
downloadButton.addEventListener('click', handleDownload);

// Auto-trigger extraction when the popup opens for convenience.
extractPageText();
