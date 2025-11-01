# SnapDigest AI

A Chrome extension that transforms how you consume web content by extracting visible text, generating AI-powered summaries, and creating beautiful visual digests—all processed locally on your device using Chrome's built-in AI capabilities.

## 🎯 Problem Statement

Modern web pages are cluttered with ads, navigation menus, sidebars, and distractions that make it difficult to focus on the actual content. Reading long articles is time-consuming, and understanding key information at a glance is challenging. SnapDigest AI solves this by:

1. **Extracting clean text** from any web page, filtering out noise
2. **Generating instant AI summaries** to capture key points in seconds
3. **Creating visual Bento grid digests** that present information in an organized, scannable format
4. **Processing everything locally** for privacy and speed—no data leaves your browser

## 🚀 Features & Functionality

### Core Capabilities

- **Smart Text Extraction**: One-click extraction of all visible text via `document.body.innerText`
- **Interactive Element Exclusion**: Click-to-exclude mode that lets you remove unwanted page elements (ads, navigation, sidebars) before extraction
- **AI-Powered Summarization**: Generate summaries using Chrome's **Summarizer API** with multiple formats:
  - **TL;DR**: Quick overview
  - **Key Points**: Bulleted highlights
  - **Teaser**: Brief preview
  - **Headline**: Single-line summary
- **Visual Bento Grid**: Create structured card layouts using Chrome's **Prompt API** that organize information into digestible visual blocks
- **Right-Click Restoration**: Easily restore excluded elements if you change your mind
- **Copy & Download**: Export extracted text or summaries to clipboard or file
- **Persistent State**: Summaries are saved per-tab and restored when reopening the popup

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
4. Pin the "SnapDigest AI" extension for quick access.
5. Visit any page, click the extension icon, and press **Extract Text** (it also auto-runs on open).
6. Use **Exclude Elements** to enter selection mode; the popup minimizes so you can hover the page and click exactly one element to exclude. The popup reopens with updated text automatically.
7. Right-click a dashed element to restore it, or click **Reset** to clear every exclusion.
8. Click **Summarize** to generate an AI summary of the extracted text.
9. Once you have a summary, click **Render Bento Grid** to create a visual digest in the side panel.

### 💡How Chrome Built-in AI APIs Used

#### 1. **Summarizer API** (`self.Summarizer`)
- **Purpose**: Generate natural language summaries of extracted web content
- **Implementation**: 
  - Checks model availability (`readily`, `after-download`, or `no`)
  - Creates summarizer sessions with configurable options (type, length, output language)
  - Uses streaming API for real-time summary generation
  - Supports multiple summary types and lengths
- **Model**: Gemini Nano (1.5GB, downloaded automatically on first use)

#### 2. **Prompt API** (`self.ai.languageModel`)
- **Purpose**: Generate structured Bento grid layouts from summaries
- **Implementation**:
  - Uses JSON Schema constraints to enforce structured output format
  - Creates visual card layouts with different sizes (small/medium/large) and emphasis styles
  - Generates headers, takeaways, statistics, quotes, tips, and link collections
  - Renders both code preview and live HTML output
- **Model**: Gemini Nano (shared with Summarizer API)

### Privacy & Performance

- **100% On-Device Processing**: All AI operations run locally using Chrome's built-in Gemini Nano model
- **No External API Calls**: Zero data transmission to external servers
- **No Tracking**: No analytics, cookies, or user data collection
- **Fast & Responsive**: Local processing means instant results without network latency

## Technical Architecture

**Built with**: Vanilla JavaScript (Manifest V3) - No external frameworks or dependencies

**Key Components**:
- **popup.js**: Main UI controller with state management via `chrome.storage.local`
- **content.js**: Injected script for text extraction and interactive element selection
- **sidepanel.js**: Bento grid generator using Prompt API with JSON Schema constraints
- **background.js**: Service worker coordinating side panel lifecycle
- **bento.js**: Standalone viewer for generated Bento grids

**Message Passing**: popup ↔ content script ↔ background worker ↔ side panel

## Notes

- The extension only requests the `activeTab`, `scripting`, `tabs`, `storage`, and `sidePanel` permissions.
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

### "Side panel API is not available"

- Ensure you're using Chrome 114 or later
- Check that the extension has the `sidePanel` permission in manifest.json
- Try reloading the extension at `chrome://extensions/`
- Restart Chrome if the issue persists
