# Plain Text Snapshot

A Chrome extension that captures the visible text from the active tab and presents it in a clean, scrollable popup.

## Features

- One-click extraction of all visible text via `document.body.innerText`
- Interactive "Exclude Elements" mode that temporarily minimizes the popup so you can click a page element, one at a time, to omit it from the text
- Right-click any dashed (excluded) element to restore it, or use **Reset** to clear all exclusions
- Displays page title, URL, word and character counts with exclusion tally
- Copy-to-clipboard and download-as-text helpers
- Minimal monospace UI with accessible status feedback

## Getting Started

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Choose **Load unpacked** and select this folder.
4. Pin the "Plain Text Snapshot" extension for quick access.
5. Visit any page, click the extension icon, and press **Extract Text** (it also auto-runs on open).
6. Use **Exclude Elements** to enter selection mode; the popup minimizes so you can hover the page and click exactly one element to exclude. The popup reopens with updated text automatically.
7. Right-click a dashed element to restore it, or click **Reset** to clear every exclusion.

## Notes

- The extension only requests the `activeTab`, `scripting`, and `tabs` permissions.
- Text extraction runs entirely locally; no data leaves your browser.
- For highly dynamic pages, re-run extraction to capture the freshest content.
- Exclusions are remembered per tab while the page stays loaded; reload the page or press **Reset** to start fresh.
- During selection, the popup minimizes to keep focus on the page; it automatically returns once the update finishes.
