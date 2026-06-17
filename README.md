<div align="center">
  <img src="static/logo.png" width="120" alt="StrokeIndexr" />

  # StrokeIndexr

  **Your golf game, finally making sense.**

  *A personal golf statistics tracker that runs entirely on your own computer.*
</div>

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
- [Python 3.10 or later](https://www.python.org/downloads/) installed
- A [Hole19](https://hole19golf.com) account with some rounds tracked
- *(Optional)* An API key from an AI provider if you want coaching summaries

---

## Getting Started

### 1. Download

Click the green **Code** button → **Download ZIP**, then unzip it somewhere on your computer.

### 2. First-time setup

You only need to do this once.

**Mac:**
1. Double-click **`Start - Mac.command`**
2. If macOS blocks it, go to **System Settings → Privacy & Security** and click **Open Anyway**

**Windows:**
1. Double-click **`Start - Windows.bat`**

**Linux:**
```bash
bash "Start - Linux.sh"
```

The first run will install all required packages automatically. This may take a minute or two.

### 3. Open the app

Your browser should open automatically to **http://127.0.0.1:5050**

If it doesn't, just open your browser and go to that address manually.

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

If you want a free option, [Groq](https://groq.com) offers a generous free tier that works well for golf analysis.

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
