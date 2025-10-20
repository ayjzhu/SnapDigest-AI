# Plain Text Snapshot

A Chrome extension that captures the visible text from the active tab and presents it in a clean, scrollable popup.

## Features

- One-click extraction of all visible text via `document.body.innerText`
- Interactive "Exclude Elements" mode to remove nav bars, language pickers, or other noise directly on the page
- Displays page title, URL, word and character counts with exclusion tally
- Copy-to-clipboard and download-as-text helpers
- Minimal monospace UI with accessible status feedback

## Getting Started

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Choose **Load unpacked** and select this folder.
4. Pin the "Plain Text Snapshot" extension for quick access.
5. Visit any page, click the extension icon, and press **Extract Text** (it also auto-runs on open).
6. Use **Exclude Elements** to enter selection mode, then hover and click page regions to omit them from the captured text. Press **Finish Selecting** or hit `Esc` when done.

## Notes

- The extension only requests the `activeTab`, `scripting`, and `tabs` permissions.
- Text extraction runs entirely locally; no data leaves your browser.
- For highly dynamic pages, re-run extraction to capture the freshest content.
- Exclusions are remembered per tab while the page stays loaded; reload the page to reset them.
