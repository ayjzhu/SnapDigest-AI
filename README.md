# Plain Text Snapshot

A Chrome extension that captures the visible text from the active tab and presents it in a clean, scrollable popup with AI-powered summarization and Bento grid visualization.

## Features

- One-click extraction of all visible text via `document.body.innerText`
- Interactive "Exclude Elements" mode that temporarily minimizes the popup so you can click page elements to omit them, flashing the popup with updated text after each exclusion while staying in selection mode
- Right-click any dashed (excluded) element to restore it, or use **Reset** to clear all exclusions
- **AI-Powered Summarization**: Generate summaries using Chrome's built-in Summarizer API with options for type (TL;DR, Key Points, etc.) and length
- **Bento Grid Visualization**: Create beautiful, structured visual summaries using Chrome's built-in Prompt API
- Displays page title, URL, word and character counts with exclusion tally
- Copy-to-clipboard and download-as-text helpers
- Minimal monospace UI with accessible status feedback

## Requirements

### For AI Features (Summarization & Bento Grid)

To use the AI-powered features, you need:

1. **Chrome Version**: Chrome 127 or later (recommended: Chrome 138+)
2. **Operating System**:
   - Windows 10 or 11
   - macOS 13+ (Ventura and onwards)
   - Linux
   - ChromeOS on Chromebook Plus devices (Platform 16389.0.0+)
3. **Hardware**:
   - **Storage**: At least 22 GB of free space for Gemini Nano model
   - **GPU**: More than 4 GB of VRAM, OR
   - **CPU**: 16 GB of RAM or more AND 4 CPU cores or more
4. **Network**: Unlimited data or unmetered connection for initial model download

### Enable AI Features in Chrome

1. Open `chrome://flags/#optimization-guide-on-device-model`
2. Set to **Enabled**
3. Open `chrome://flags/#prompt-api-for-gemini-nano`
4. Set to **Enabled**
5. Restart Chrome
6. Visit `chrome://components/` and check for "Optimization Guide On Device Model"
7. If the version shows "0.0.0.0", click **Check for update** to download Gemini Nano

**Note**: The first time you use AI features, Chrome may need to download the Gemini Nano model (approximately 1.5+ GB). This happens automatically when you click the Summarize or Render Bento Grid buttons.

## Getting Started

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Choose **Load unpacked** and select this folder.
4. Pin the "Plain Text Snapshot" extension for quick access.
5. Visit any page, click the extension icon, and press **Extract Text** (it also auto-runs on open).
6. Use **Exclude Elements** to enter selection mode; the popup minimizes so you can hover the page and click exactly one element to exclude. The popup reopens with updated text automatically.
7. Right-click a dashed element to restore it, or click **Reset** to clear every exclusion.
8. Click **Summarize** to generate an AI summary of the extracted text.
9. Once you have a summary, click **Render Bento Grid** to create a visual digest.

## Testing AI Features

Open `test-prompt-api.html` in Chrome to verify that the Prompt API is available and working on your system.

## Notes

- The extension only requests the `activeTab`, `scripting`, `tabs`, and `storage` permissions.
- Text extraction and AI processing run entirely locally; no data leaves your browser.
- For highly dynamic pages, re-run extraction to capture the freshest content.
- Exclusions are remembered per tab while the page stays loaded; reload the page or press **Reset** to start fresh.
- During selection, the popup minimizes to keep focus on the page; it automatically returns once the update finishes.
- Summaries and Bento grids are stored per-tab and persist until the page is refreshed or the extension is reloaded.

## Troubleshooting

### "Prompt API is not available in this browser"

- Ensure you're using Chrome 127 or later
- Check that AI flags are enabled (see Enable AI Features section above)
- Verify the Gemini Nano model is downloaded at `chrome://components/`
- Check your device meets the hardware requirements
- Try the test page at `test-prompt-api.html` to diagnose the issue

### Model download is slow or fails

- Ensure you have an unmetered (unlimited) internet connection
- Check that you have at least 22 GB of free disk space
- The download may take several minutes depending on your connection speed

### "Summarizer API is not available"

- Follow the same steps as for Prompt API issues
- The Summarizer and Prompt APIs share the same Gemini Nano model
