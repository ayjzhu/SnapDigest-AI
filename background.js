const SIDE_PANEL_STATE_KEY = 'side_panel_open_state';

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
  
  if (message.type === 'BENTO_CLOSE_PANEL') {
    // Forward close message to sidepanel
    chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL_INTERNAL' }).catch(() => {
      // Sidepanel might not be open, ignore error
    });
    sendResponse({ ok: true });
    return true;
  }
  
  if (message.type === 'BENTO_TOGGLE_PANEL') {
    (async () => {
      try {
        if (!chrome.sidePanel) {
          throw new Error('Side panel API is not available.');
        }

        const windowId =
          message.windowId ||
          sender?.tab?.windowId ||
          (await chrome.windows.getCurrent()).id;

        if (!windowId) {
          throw new Error('Unable to determine the window ID.');
        }

        let isPanelOpen = false;
        try {
          const stored = await chrome.storage.local.get(SIDE_PANEL_STATE_KEY);
          isPanelOpen = Boolean(stored?.[SIDE_PANEL_STATE_KEY]);
        } catch {
          // Ignore storage errors and assume the panel is closed.
        }

        let nextState = 'opened';
        if (isPanelOpen) {
          nextState = 'closed';
          try {
            await chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL_INTERNAL' });
          } catch {
            // Ignore errors if the panel context is already gone.
          }
          await chrome.storage.local.set({ [SIDE_PANEL_STATE_KEY]: false }).catch(() => {});
        } else {
          await chrome.sidePanel.open({ windowId });
          await chrome.storage.local.set({ [SIDE_PANEL_STATE_KEY]: true }).catch(() => {});
        }

        sendResponse({ ok: true, state: nextState });
      } catch (error) {
        console.error('Failed to toggle side panel:', error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }
});
