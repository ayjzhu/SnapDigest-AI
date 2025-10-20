(() => {
  const MESSAGE_TYPE = 'PAGE_TEXT_RESULT';

  const collectText = () => {
    if (!document.body) {
      return '';
    }
    return document.body.innerText || '';
  };

  const dispatch = () => {
    try {
      const payload = {
        text: collectText(),
        title: document.title || '',
        url: window.location.href
      };
      chrome.runtime.sendMessage({ type: MESSAGE_TYPE, payload });
    } catch (error) {
      console.error('Plain Text Snapshot: extraction failed', error);
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPE,
        payload: { text: '', title: document.title || '', url: window.location.href }
      });
    }
  };

  const scheduleDispatch = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(dispatch, { timeout: 500 });
    } else {
      setTimeout(dispatch, 200);
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scheduleDispatch();
  } else {
    window.addEventListener('DOMContentLoaded', scheduleDispatch, { once: true });
  }
})();
