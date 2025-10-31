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

const isSidePanelOpenInState = (state, windowId) => {
  if (typeof windowId === 'number') {
    const key = String(windowId);
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      return Boolean(state[key]);
    }
  }
  return Boolean(state.__legacy__);
};

const getSidePanelStateForWindow = async (windowId) => {
  try {
    const stored = await chrome.storage.local.get(SIDE_PANEL_STATE_KEY);
    const state = normalizeSidePanelState(stored?.[SIDE_PANEL_STATE_KEY]);
    return isSidePanelOpenInState(state, windowId);
  } catch {
    return false;
  }
};

const setSidePanelStateForWindow = async (windowId, isOpen) => {
  try {
    const stored = await chrome.storage.local.get(SIDE_PANEL_STATE_KEY);
    const state = normalizeSidePanelState(stored?.[SIDE_PANEL_STATE_KEY]);
    const key = typeof windowId === 'number' ? String(windowId) : null;
    if (key) {
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
    // Ignore storage update errors
  }
};

if (chrome.sidePanel?.onShown?.addListener) {
  chrome.sidePanel.onShown.addListener(({ windowId }) => {
    setSidePanelStateForWindow(windowId, true);
  });
}

if (chrome.sidePanel?.onHidden?.addListener) {
  chrome.sidePanel.onHidden.addListener(({ windowId }) => {
    setSidePanelStateForWindow(windowId, false);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }
  
  if (message.type === 'GET_SIDE_PANEL_STATE') {
    (async () => {
      try {
        const windowId = message.windowId || sender?.tab?.windowId || (await chrome.windows.getCurrent()).id;
        const isOpen = await getSidePanelStateForWindow(windowId);
        sendResponse({ isOpen });
      } catch (error) {
        console.error('Failed to get side panel state:', error);
        sendResponse({ isOpen: false });
      }
    })();
    return true;
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
        await setSidePanelStateForWindow(windowId, true);
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
    (async () => {
      try {
        const windowId =
          message.windowId ||
          sender?.tab?.windowId ||
          (await chrome.windows.getCurrent()).id;
        await setSidePanelStateForWindow(windowId, false);
      } catch {
        // Ignore state update errors
      }
    })();
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

        const isPanelOpen = await getSidePanelStateForWindow(windowId);

        let nextState = 'opened';
        if (isPanelOpen) {
          nextState = 'closed';
          try {
            await chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL_INTERNAL' });
          } catch {
            // Ignore errors if the panel context is already gone.
          }
          await setSidePanelStateForWindow(windowId, false);
        } else {
          await chrome.sidePanel.open({ windowId });
          await setSidePanelStateForWindow(windowId, true);
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
