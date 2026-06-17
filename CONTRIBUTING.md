# Contributing to StrokeIndexr

Thanks for your interest in contributing. StrokeIndexr is a personal project that's been opened up to the community — contributions are welcome, but the project has a clear direction and not everything will be a fit. Reading this first will save us both time.

---

## Ways to contribute

You don't have to write code to contribute:

- **Bug reports** — something broken? Open an issue.
- **Feature suggestions** — have an idea? Open an issue and describe the problem it solves.
- **Testing** — especially on Windows or Linux. The app is primarily developed on Mac.
- **Documentation** — clearer README sections, better troubleshooting tips, setup guides for specific platforms.
- **Code** — bug fixes, improvements, new features (see below).

---

## Reporting a bug

Open an issue and include:

- Your OS and Python version
- Steps to reproduce the problem
- What you expected to happen vs what actually happened
- Any error messages from the terminal

The more specific, the faster it gets fixed.

---

## Suggesting a feature

Open an issue before writing any code. Describe the problem you're trying to solve rather than jumping straight to a solution — sometimes there's a simpler way, or it's something already in progress.

Features that fit the project:

- Things that help golfers understand their game better
- Improvements to the import flow, stats, or visualisations
- Accessibility and usability improvements
- Performance improvements
- Containerisation / deployment options (Docker etc. — see below)

Features that don't fit:

- Anything that requires a third-party account or cloud service as a hard dependency
- Social features (leaderboards, sharing, following other players)
- Changes that break the self-hosted, privacy-first core experience

---

## Pull requests

- **Open an issue first** for anything beyond a trivial bug fix, so we can agree it's worth doing before you spend time on it
- Keep PRs focused — one thing per PR
- The app should run correctly before you submit
- Describe what you changed and why in the PR description
- No new third-party dependencies without prior discussion

---

## Code style

- Python backend, vanilla HTML/CSS/JS frontend — no frameworks
- Keep it simple and readable; this is a tool people will want to self-host and modify
- No build steps, no transpilation, no bundlers — what you see is what runs

---

## On Docker and cloud deployment

The app currently runs as a local Python process. Containerisation (Docker, etc.) is on the long-term radar as a way to make self-hosting easier and to open up cloud deployment options. If you're interested in contributing work in this area, open an issue first to discuss approach — it's welcome in principle.

The core principle to preserve: **the self-hosted, fully private experience should always remain free and fully functional.**

---

## Questions and discussion

Open a GitHub Issue for bug reports and feature requests. For general questions or discussion, use the Discussions tab if enabled.

Please don't send direct messages for support requests — keeping things in the open means others can benefit from the answers.

---

## Licence

By contributing, you agree that your contributions will be licensed under the same [GPL v3 licence](LICENSE) as the rest of the project. Copyright remains with the original author.
