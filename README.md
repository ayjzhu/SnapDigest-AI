# SnapDigest AI

> Transform web content into clean summaries and visual digests—powered entirely by Chrome's built-in AI

A Chrome extension that extracts visible text, generates AI-powered summaries, and creates beautiful Bento grid layouts—all processed locally on your device using Chrome's built-in Gemini Nano model.

[![Chrome](https://img.shields.io/badge/Chrome-127%2B-blue?logo=google-chrome)](https://www.google.com/chrome/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

## ✨ Features

- **🔍 Smart Text Extraction** - One-click extraction of all visible text from any webpage
- **🎯 Interactive Element Exclusion** - Click to remove unwanted elements (ads, navigation, sidebars)
- **🤖 AI-Powered Summaries** - Generate instant summaries using Chrome's Summarizer API
  - TL;DR, Key Points, Teaser, and Headline formats
  - Multiple length options (short, medium, long)
- **📊 Visual Bento Grids** - Create structured card layouts using Chrome's Prompt API
- **🔄 Element Restoration** - Right-click to restore excluded elements
- **💾 Export Options** - Copy to clipboard or download as text file
- **🔒 Privacy First** - 100% on-device processing, zero external API calls
- **⚡ Fast & Responsive** - No network latency, instant results

## 📋 Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Technical Architecture](#technical-architecture)
- [Troubleshooting](#troubleshooting)
- [Privacy & Security](#privacy--security)
- [License](#license)

## 🔧 Requirements

### Browser & System

- **Chrome Version**: 127 or later (recommended: Chrome 138+)
- **Operating System**:
  - Windows 10 or 11
  - macOS 13+ (Ventura or later)
  - Linux
  - ChromeOS (Platform 16389.0.0+)

### Hardware (for AI Features)

- **Storage**: 22 GB free space (for Gemini Nano model)
- **GPU**: 4 GB+ VRAM, **OR**
- **CPU/RAM**: 4+ CPU cores AND 16 GB+ RAM
- **Network**: Unlimited data connection (for initial model download)

### Enable Chrome AI Features

1. Navigate to `chrome://flags/#optimization-guide-on-device-model`
2. Set to **Enabled**
3. Navigate to `chrome://flags/#prompt-api-for-gemini-nano`
4. Set to **Enabled**
5. **Restart Chrome**
6. Visit `chrome://components/`
7. Find "Optimization Guide On Device Model"
8. If version shows "0.0.0.0", click **Check for update** to download Gemini Nano (~1.5 GB)

> **Note**: The Gemini Nano model downloads automatically on first use. Ensure you have sufficient storage and an unmetered internet connection.

## 📦 Installation

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the extension folder
5. Pin the extension icon for quick access

## 🚀 Usage

### Basic Text Extraction

1. Navigate to any webpage
2. Click the SnapDigest AI extension icon
3. Text is automatically extracted (or click **Extract Text**)

### Interactive Element Exclusion

1. Click **Exclude Elements** to enter selection mode
2. The popup minimizes - hover over page elements
3. Click any element to exclude it from extraction
4. Right-click excluded elements (dashed outline) to restore them
5. Click **Reset** to clear all exclusions

### AI Summarization

1. After extracting text, click **Summarize**
2. Select summary format:
   - **TL;DR** - Quick overview
   - **Key Points** - Bulleted highlights
   - **Teaser** - Brief preview
   - **Headline** - Single-line summary
3. Choose summary length (short, medium, long)
4. View streaming results in real-time

### Bento Grid Visualization

1. Generate a summary first
2. Click **Render Bento Grid**
3. Visual digest opens in side panel
4. Structured cards display:
   - Headers and takeaways
   - Statistics and metrics
   - Quotes and highlights
   - Tips and actionable items
   - Related links

### Export Options

- **Copy to clipboard**: Click copy button
- **Download as file**: Click download button
- Supports both extracted text and summaries

## 🔬 How It Works

### Chrome Built-in AI APIs

#### 1. Summarizer API (`self.Summarizer`)

- **Purpose**: Generate natural language summaries of extracted web content
- **Implementation**:
  - Checks model availability (`readily`, `after-download`, or `no`)
  - Creates summarizer sessions with configurable options (type, length, output language)
  - Uses streaming API for real-time summary generation
  - Supports multiple summary types and lengths
- **Model**: Gemini Nano (1.5GB, downloaded automatically on first use)

#### 2. Prompt API (`self.ai.languageModel`)

- **Purpose**: Generate structured Bento grid layouts from summaries
- **Implementation**:
  - Uses JSON Schema constraints to enforce structured output format
  - Creates visual card layouts with different sizes (small/medium/large) and emphasis styles
  - Generates headers, takeaways, statistics, quotes, tips, and link collections
  - Renders both code preview and live HTML output
- **Model**: Gemini Nano (shared with Summarizer API)

## 🏗️ Technical Architecture

**Tech Stack**: Vanilla JavaScript (Manifest V3) - No external frameworks or dependencies

**Key Components**:

- **popup.js**: Main UI controller with state management via `chrome.storage.local`
- **content.js**: Injected script for text extraction and interactive element selection
- **sidepanel.js**: Bento grid generator using Prompt API with JSON Schema constraints
- **background.js**: Service worker coordinating side panel lifecycle
- **bento.js**: Standalone viewer for generated Bento grids

**Message Passing Flow**:

```plaintext
popup ↔ content script ↔ background worker ↔ side panel
```

**Permissions**:

- `activeTab` - Access current tab content
- `scripting` - Inject content scripts
- `tabs` - Tab management
- `storage` - Persist summaries and state
- `sidePanel` - Display Bento grids

## 🔒 Privacy & Security

- **100% On-Device Processing** - All AI operations run locally using Chrome's built-in Gemini Nano model
- **No External API Calls** - Zero data transmission to external servers
- **No Tracking** - No analytics, cookies, or user data collection
- **Fast & Responsive** - Local processing means instant results without network latency
- **Minimal Permissions** - Only requests essential Chrome extension permissions

## 🐛 Troubleshooting

### "Prompt API is not available in this browser"

**Solutions**:

- Ensure you're using Chrome 127 or later
- Verify AI flags are enabled (see [Enable Chrome AI Features](#enable-chrome-ai-features))
- Check Gemini Nano model is downloaded at `chrome://components/`
- Confirm your device meets the hardware requirements
- Restart Chrome after enabling flags

### "Summarizer API is not available"

**Solutions**:

- Follow the same steps as Prompt API issues
- Both APIs share the same Gemini Nano model
- Ensure model download completed successfully

### Model download is slow or fails

**Solutions**:

- Use an unmetered (unlimited) internet connection
- Verify at least 22 GB of free disk space
- Allow several minutes for download (1.5+ GB model)
- Check `chrome://components/` for download status
- Try manually clicking "Check for update" for "Optimization Guide On Device Model"

### "Side panel API is not available"

**Solutions**:

- Ensure Chrome 114 or later
- Verify `sidePanel` permission in `manifest.json`
- Reload extension at `chrome://extensions/`
- Restart Chrome if issue persists

### Extraction not working on dynamic pages

**Solutions**:

- Wait for page to fully load before extraction
- Click **Extract Text** manually to refresh
- Check browser console for JavaScript errors

## 📝 Additional Notes

- Text extraction and AI processing run entirely locally - no data leaves your browser
- For highly dynamic pages, re-run extraction to capture fresh content
- Exclusions are remembered per tab until page reload
- During selection mode, popup minimizes automatically and returns after update
- Summaries and Bento grids persist per-tab until page refresh or extension reload

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with Chrome's experimental [Built-in AI APIs](https://developer.chrome.com/docs/ai/built-in)
- Powered by [Gemini Nano](https://deepmind.google/technologies/gemini/nano/) on-device model

---

Made with ❤️ for a better web reading experience
