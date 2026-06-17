<div align="center">
  <img src="static/logo.png" width="120" alt="StrokeIndexr" />

  # StrokeIndexr

  **Your golf game, finally making sense.**

  *A personal golf statistics tracker that runs entirely on your own computer.*
</div>

> **Disclaimer:** StrokeIndexr is an independent, unofficial project and is not affiliated with, endorsed by, or connected to Hole19 Golf or any other third party. It does not access any external API or service without user action. All data is imported by the user from their own personal round history — users retain full ownership of their data.

---

## Features

- **Import rounds from Hole19** — paste a round URL and your full scorecard imports automatically, including every hole
- **Per-hole scorecard view** — TV broadcast-style scoring notation (circles for birdies, squares for bogeys) so you can see at a glance how a round went
- **World Handicap System (WHS) index** — calculated accurately from your last 20 rounds using official WHS rules, including 9-hole round pairing and manual exclusions
- **Course tracker** — stats per course, front/back 9 grouping, and per-tee Course Rating and Slope for accurate handicap calculations
- **Tee colour tracking** — records which tees you played (White, Yellow, Red, Blue) and factors this into your WHS differential
- **AI coaching summaries** — connect your own AI API key (Claude, ChatGPT, Gemini, and others supported) to get a performance review and practice plan based on your recent rounds
- **Date-windowed analysis** — AI summaries cover a 90-day window by default, regenerating only when new rounds are added so you don't waste API tokens
- **Dashboard** — score trends, GIR, putts per round, and a live handicap trend chart
- **Fully private** — everything runs locally on your computer, your data never leaves your machine

---

## What You'll Need

- A Mac, Windows PC, or Linux machine
- Python 3.10 or later (see install steps below)
- A [Hole19](https://hole19golf.com) account with some rounds tracked
- *(Optional)* An API key from an AI provider if you want coaching summaries

---

## Getting Started

### 1. Install Python *(first time only)*

StrokeIndexr needs Python 3.10 or later. If you're not sure whether you have it, the start script will tell you.

**Mac:**

The easiest option is [Homebrew](https://brew.sh) — if you use it for other tools, this is one command:
```bash
brew install python
```
Otherwise, download the installer from [python.org/downloads](https://www.python.org/downloads/), run it, and follow the prompts — no custom settings needed.

**Windows:**

If you have [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) (built into Windows 10/11), open a terminal and run:
```
winget install Python.Python.3.13
```
This handles PATH automatically — no extra steps needed.

Alternatively, download the installer from [python.org/downloads](https://www.python.org/downloads/) and run it. **Important:** tick **"Add Python to PATH"** on the first screen before clicking Install — without this the start script won't be able to find Python.

**Linux:**

Use your distro's package manager:
```bash
# Ubuntu/Debian
sudo apt install python3 python3-pip python3-venv

# Fedora
sudo dnf install python3

# Arch
sudo pacman -S python
```
If you use [Homebrew on Linux](https://brew.sh), `brew install python` also works.

### 2. Download StrokeIndexr

Click the green **Code** button → **Download ZIP**, then unzip it somewhere on your computer.

### 3. Start the app

**Mac:**
1. Double-click **`Start - Mac.command`**
2. If macOS blocks it, go to **System Settings → Privacy & Security** and click **Open Anyway**

**Windows:**
1. Double-click **`Start - Windows.bat`**

**Linux:**
```bash
bash "Start - Linux.sh"
```

The first run will install all required Python packages automatically. This may take a minute or two — you only need to wait once.

If Python isn't installed or is too old, the start script will tell you exactly what to do.

### 4. Open the app

Your browser should open automatically to **http://127.0.0.1:5050**

If it doesn't, open your browser and go to that address manually.

---

## Importing Your First Round

1. Open a round on [hole19golf.com](https://www.hole19golf.com) — you'll find your rounds under **Performance → Rounds**
2. Copy the URL (it'll look like `https://www.hole19golf.com/performance/rounds/XXXXXX`)
3. In StrokeIndexr, go to **Import Round**, paste the URL, and click **Import**
4. You'll be asked which tees you played — pick the right colour and you're done

---

## Setting Up AI Summaries *(Optional)*

StrokeIndexr works great without AI, but if you'd like coaching summaries:

1. Click **⚙ Settings** in the bottom-left of the sidebar
2. Under **AI**, choose your preferred provider and paste in your API key
3. Head to the **AI Analysis** tab and click **Generate Analysis**

Supported providers: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google), Groq, Mistral, OpenRouter, Ollama (local), LM Studio (local).

### Getting a free API key with OpenRouter

[OpenRouter](https://openrouter.ai) is the easiest way to get started for free — it gives you access to a range of AI models through a single API key, including several with no cost.

1. Go to [openrouter.ai](https://openrouter.ai) and create a free account
2. Go to **Keys** and click **Create Key** — copy the key it generates
3. In StrokeIndexr Settings, set the provider to **OpenRouter** and paste your key
4. Leave the model field blank to use the default, or enter a free model name such as `mistralai/mistral-7b-instruct` or `meta-llama/llama-3-8b-instruct`

You can browse all available models and their pricing at [openrouter.ai/models](https://openrouter.ai/models) — filter by "Free" to see options that cost nothing.

> **Note:** Free models on OpenRouter are capable but less powerful than paid options like Claude or GPT-4. For most golf analysis use cases they work well.

---

## Updating StrokeIndexr

When a new version is available, a small notification will appear in the bottom-left of the sidebar. Your data is never affected by an update.

### If you downloaded a ZIP

1. Download the latest ZIP from the [Releases page](https://github.com/f0dders/strokeindexr/releases/latest)
2. Unzip it to a **new folder**
3. Copy your **`data/`** folder from the old folder into the new one
4. Start the app from the new folder as normal

### If you cloned the repo with Git

Double-click the appropriate update script:
- **Mac:** `Update - Mac.command`
- **Windows:** `Update - Windows.bat`
- **Linux:** `bash "Update - Linux.sh"`

Then restart the app.

---

## Stopping the App

Close the terminal window (Mac/Linux) or command prompt window (Windows) that opened when you started the app.

---

## Your Data

All your round data is stored in a single file: `data/golf.db`

Back this file up if you want to keep it safe. You can also copy it to another machine to transfer your history across.

---

## Troubleshooting

**The app won't start on Mac**
> Go to System Settings → Privacy & Security and look for a message about the file being blocked. Click Open Anyway.

**"Port already in use" error**
> The app is probably already running. Check if it's open in your browser at http://127.0.0.1:5050, or restart your computer and try again.

**A round won't import**
> Make sure the round URL is from `hole19golf.com/performance/rounds/`. Private rounds may not be accessible.

**My WHS handicap looks wrong**
> WHS requires at least 3 eligible rounds (exactly 9 or 18 holes). Partially played rounds are automatically excluded. You can also manually exclude a round from within the round detail view.

---

## Tech Stack

Python (Flask) · SQLite · HTML/CSS/JavaScript · No frameworks, no cloud, no tracking.

---

## Licence

Copyright (C) 2026 f0dders

This project is licensed under the [GNU General Public License v3.0](LICENSE). You are free to use, modify and distribute it, but any derivative work must also be open source under the same licence. Commercial use requires separate written permission from the author.
