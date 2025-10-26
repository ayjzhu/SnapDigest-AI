chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'BENTO_OPEN_PANEL') {
    (async () => {
      try {
        // Check if the sidePanel API is available
        if (!chrome.sidePanel) {
          throw new Error('Side panel API is not available. Please ensure you are using Chrome 114+ and the extension has the "sidePanel" permission.');
        }
        
        const windowId =
          message.windowId ||
          sender?.tab?.windowId ||
          (await chrome.windows.getCurrent()).id;
        
        if (!windowId) {
          throw new Error('Unable to determine the window ID.');
        }
        
        // Open the side panel
        await chrome.sidePanel.open({ windowId });
        sendResponse({ ok: true });
      } catch (error) {
        console.error('Failed to open side panel:', error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }
});
