(() => {
  if (window.__PTS_contentInjected) {
    return;
  }
  window.__PTS_contentInjected = true;

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

  const STYLE_ID = 'pts-selection-style';
  const OVERLAY_ID = 'pts-selection-overlay';
  const EXCLUDED_CLASS = 'pts-excluded-element';

  const excludedElements = new Map();
  let selectionActive = false;
  let overlay = null;
  let cleanupSelection = null;
  let currentCandidate = null;

  const sendMessage = (type, payload = {}) => {
    try {
      chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      console.warn('Plain Text Snapshot: message dispatch failed', error);
    }
  };

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  pointer-events: none;
  z-index: 2147483647;
  border: 2px solid #2563eb;
  background: rgba(37, 99, 235, 0.12);
  border-radius: 4px;
  transition: all 0.05s ease-out;
}
.${EXCLUDED_CLASS} {
  outline: 2px dashed #d93025 !important;
  outline-offset: 2px !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
  };

  const describeElement = (element) => {
    if (!element || !(element instanceof Element)) {
      return '';
    }
    const tag = element.tagName ? element.tagName.toLowerCase() : 'node';
    const id = element.id ? `#${element.id}` : '';
    const classTokens = Array.from(element.classList || []).slice(0, 2);
    const classes = classTokens.length ? `.${classTokens.join('.')}` : '';
    const ariaLabel = element.getAttribute('aria-label');
    const label = ariaLabel ? ` [${ariaLabel}]` : '';
    return `${tag}${id}${classes}${label}`;
  };

  const pruneExcluded = () => {
    for (const [element] of excludedElements) {
      if (!element || !element.isConnected) {
        excludedElements.delete(element);
      }
    }
  };

  const getExcludedDescriptors = () => Array.from(excludedElements.values());

  const withElementsTemporarilyHidden = (callback) => {
    const snapshots = [];
    excludedElements.forEach((descriptor, element) => {
      if (!element || !element.isConnected) {
        excludedElements.delete(element);
        return;
      }
      snapshots.push({
        element,
        display: element.style.getPropertyValue('display'),
        priority: element.style.getPropertyPriority('display'),
        ariaHidden: element.getAttribute('aria-hidden')
      });
      element.setAttribute('aria-hidden', 'true');
      element.style.setProperty('display', 'none', 'important');
    });
    const result = callback();
    snapshots.forEach(({ element, display, priority, ariaHidden }) => {
      if (!element || !element.isConnected) {
        return;
      }
      if (ariaHidden === null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', ariaHidden);
      }
      if (display) {
        element.style.setProperty('display', display, priority || '');
      } else {
        element.style.removeProperty('display');
      }
    });
    return result;
  };

  const collectText = () => {
    if (!document.body) {
      return '';
    }
    return withElementsTemporarilyHidden(() => document.body.innerText || '');
  };

  const dispatchText = () => {
    try {
      pruneExcluded();
      const payload = {
        text: collectText(),
        title: document.title || '',
        url: window.location.href,
        excludedCount: excludedElements.size,
        excluded: getExcludedDescriptors()
      };
      sendMessage(MESSAGE_TYPES.TEXT, payload);
    } catch (error) {
      console.error('Plain Text Snapshot: extraction failed', error);
      sendMessage(MESSAGE_TYPES.TEXT, {
        text: '',
        title: document.title || '',
        url: window.location.href,
        excludedCount: excludedElements.size,
        excluded: getExcludedDescriptors()
      });
    }
  };

  const ensureOverlay = () => {
    if (overlay && overlay.isConnected) {
      return overlay;
    }
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
    return overlay;
  };

  const removeOverlay = () => {
    if (overlay && overlay.isConnected) {
      overlay.remove();
    }
    overlay = null;
  };

  const highlightElement = (element) => {
    if (!selectionActive) {
      return;
    }
    const target = element instanceof Element ? element : null;
    if (!target || target.id === OVERLAY_ID) {
      if (overlay) {
        overlay.style.display = 'none';
      }
      return;
    }
    const rect = target.getBoundingClientRect();
    const overlayElement = ensureOverlay();
    overlayElement.style.display = 'block';
    overlayElement.style.top = `${rect.top}px`;
    overlayElement.style.left = `${rect.left}px`;
    overlayElement.style.width = `${rect.width}px`;
    overlayElement.style.height = `${rect.height}px`;
  };

  const addExcludedElement = (element) => {
    if (!element || !(element instanceof Element)) {
      return null;
    }
    if (element === document.documentElement) {
      return null;
    }
    if (excludedElements.has(element)) {
      return null;
    }
    const descriptor = describeElement(element) || 'element';
    excludedElements.set(element, descriptor);
    element.classList.add(EXCLUDED_CLASS);
    return descriptor;
  };

  const removeExcludedElement = (element) => {
    if (!element || !(element instanceof Element)) {
      return null;
    }
    if (!excludedElements.has(element)) {
      return null;
    }
    const descriptor = excludedElements.get(element) || describeElement(element) || 'element';
    excludedElements.delete(element);
    element.classList.remove(EXCLUDED_CLASS);
    return descriptor;
  };

  const resetExclusions = () => {
    if (!excludedElements.size) {
      dispatchText();
      return;
    }
    excludedElements.forEach((descriptor, element) => {
      if (element && element.classList) {
        element.classList.remove(EXCLUDED_CLASS);
      }
    });
    excludedElements.clear();
    sendMessage(MESSAGE_TYPES.ELEMENT_RESTORED, { descriptor: 'all exclusions', all: true });
    dispatchText();
  };

  const stopSelection = (reason = 'complete') => {
    if (!selectionActive) {
      return;
    }
    selectionActive = false;
    if (cleanupSelection) {
      cleanupSelection();
      cleanupSelection = null;
    }
    removeOverlay();
    currentCandidate = null;
    sendMessage(MESSAGE_TYPES.SELECTION_STATUS, { active: false, reason });
  };

  const startSelection = () => {
    if (selectionActive) {
      return;
    }
    if (!document.body) {
      return;
    }
    ensureStyles();
    ensureOverlay();
    selectionActive = true;

    const pointerMoveHandler = (event) => {
      if (!selectionActive) {
        return;
      }
      const path = event.composedPath ? event.composedPath() : [event.target];
      const candidate = path.find((node) => node instanceof Element && node.id !== OVERLAY_ID) || null;
      currentCandidate = candidate;
      highlightElement(candidate);
    };

    const preventDefault = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };

    const clickHandler = (event) => {
      if (!selectionActive) {
        return;
      }
      preventDefault(event);
      const path = event.composedPath ? event.composedPath() : [event.target];
      const candidate = path.find((node) => node instanceof Element && node.id !== OVERLAY_ID) || currentCandidate;
      const descriptor = addExcludedElement(candidate);
      if (descriptor) {
        sendMessage(MESSAGE_TYPES.ELEMENT_EXCLUDED, {
          descriptor,
          excludedCount: excludedElements.size
        });
        dispatchText();
      }
      stopSelection('complete');
    };

    const keydownHandler = (event) => {
      if (event.key === 'Escape') {
        preventDefault(event);
        stopSelection('cancelled');
      }
    };

    const realignOverlay = () => {
      if (!selectionActive || !currentCandidate) {
        return;
      }
      highlightElement(currentCandidate);
    };

    const contextMenuHandler = (event) => {
      if (!selectionActive) {
        return;
      }
      const path = event.composedPath ? event.composedPath() : [event.target];
      const candidate = path.find((node) => node instanceof Element && node.classList?.contains(EXCLUDED_CLASS));
      if (!candidate) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      const descriptor = removeExcludedElement(candidate);
      if (descriptor) {
        sendMessage(MESSAGE_TYPES.ELEMENT_RESTORED, { descriptor, excludedCount: excludedElements.size });
        dispatchText();
      }
      stopSelection('complete');
    };

    const cleanup = [];
    const register = (target, type, handler, options = true) => {
      target.addEventListener(type, handler, options);
      cleanup.push(() => target.removeEventListener(type, handler, options));
    };

    register(document, 'mousemove', pointerMoveHandler, true);
    register(document, 'click', clickHandler, true);
    register(document, 'mousedown', preventDefault, true);
    register(document, 'mouseup', preventDefault, true);
    register(document, 'contextmenu', contextMenuHandler, true);
    register(document, 'keydown', keydownHandler, true);
    register(window, 'scroll', realignOverlay, true);
    register(window, 'resize', realignOverlay, true);

    cleanupSelection = () => {
      cleanup.forEach((fn) => {
        try {
          fn();
        } catch (error) {
          console.warn('Plain Text Snapshot: selection cleanup failed', error);
        }
      });
    };

    sendMessage(MESSAGE_TYPES.SELECTION_STATUS, { active: true });
  };

  const handleCommand = (message) => {
    switch (message.type) {
      case COMMAND_TYPES.EXTRACT:
        dispatchText();
        break;
      case COMMAND_TYPES.START_SELECTION:
        startSelection();
        break;
      case COMMAND_TYPES.STOP_SELECTION:
        stopSelection('complete');
        break;
      case COMMAND_TYPES.RESET:
        stopSelection('reset');
        resetExclusions();
        break;
      default:
        break;
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) {
      return;
    }
    handleCommand(message);
  });

  const globalRestoreHandler = (event) => {
    if (selectionActive) {
      return;
    }
    const path = event.composedPath ? event.composedPath() : [event.target];
    const candidate = path.find((node) => node instanceof Element && node.classList?.contains(EXCLUDED_CLASS));
    if (!candidate) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    const descriptor = removeExcludedElement(candidate);
    if (descriptor) {
      sendMessage(MESSAGE_TYPES.ELEMENT_RESTORED, { descriptor, excludedCount: excludedElements.size });
      dispatchText();
    }
  };

  document.addEventListener('contextmenu', globalRestoreHandler, true);

  const scheduleInitialDispatch = () => {
    const trigger = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => dispatchText(), { timeout: 500 });
      } else {
        setTimeout(() => dispatchText(), 200);
      }
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      trigger();
    } else {
      window.addEventListener('DOMContentLoaded', trigger, { once: true });
    }
  };

  scheduleInitialDispatch();
})();
