---
name: record-demo
description: Start the Skill Atlas web view and record a demo video of it in a real browser, with a visible cursor and human-paced typing. Use when asked to record, film or make a video or demo of the app.
argument-hint: "[repository URL] [filter] [organization URL]"
---

# Record a demo

`record.mjs` starts the app on a free port, opens it in Chromium with Playwright, plays a
scenario, and saves a `.webm` video. You can change what it scans; you don't need to edit the script.

The scenario:

1. Open the empty page.
2. Type the repository link and press **Scan**.
3. Scroll through the skills.
4. Type a filter, press **Filter**, and scroll through the matches.
5. Optional: scan an organization, show the live progress bar, and expand the first project
   that has skills.

## 1. Prerequisites

- `node --version` is 24 or newer, and `npm ci` has been run in the repository.
- Playwright is installed **outside the repository**, so `package.json` stays unchanged. This is
  needed only once per machine:

  ```console
  DEMO_DEPS="$HOME/.cache/skill-atlas-demo"
  mkdir -p "$DEMO_DEPS"
  npm install --prefix "$DEMO_DEPS" --no-save playwright@1
  npx --prefix "$DEMO_DEPS" playwright install chromium
  ```

- Scans call the live GitHub API, so you need network access. Set `GITHUB_TOKEN` so the scan
  isn't limited by the rate limit or shortened by a "tree is too large" warning:
  `export GITHUB_TOKEN=$(gh auth token)`.

## 2. Record

From the repository root:

```console
PLAYWRIGHT_DIR="$HOME/.cache/skill-atlas-demo" node .claude/skills/record-demo/record.mjs \
  --repo https://github.com/JetBrains/kotlin --filter gradle
```

It prints `Demo video: <path>`. By default the video goes in `recordings/`, which git ignores.

Options. Map the skill's arguments to these in order:

| Option | Default | Meaning |
|---|---|---|
| `--repo <url>` | `https://github.com/JetBrains/kotlin` | Repository to scan first. |
| `--filter <text>` | `gradle` | Filter to type; `--filter ''` skips it. |
| `--org <url>` | none | Organization to scan last. Pick a small one: every project is scanned. |
| `--out <file.webm>` | `recordings/skill-atlas-<time>.webm` | Where to save the video. |
| `--pace <n>` | `1` | Speed: `2` is twice as fast. Use `3` for a quick check. |
| `--url <base>` | none | Record an app that is already running instead of starting one. |
| `--headed` | off | Show the browser window while recording. |

If the app shows an error, or a step times out, the script exits with code 1. It still saves the
partial video and prints the reason. Fix the cause before you record again, for example a missing
token or a wrong link. Don't hand over a video that shows an error.

## 3. Check the video

Before you hand it over, look at it. Seek to about 15%, 40% and 75% of the video and take a
screenshot of each frame. Check that it shows the typed link, the skills and the filtered count.
For example, open the file in Playwright and screenshot a `<video>` element at those times.

If `ffmpeg` is installed and the user wants MP4 or GIF:

```console
ffmpeg -i recordings/<name>.webm -c:v libx264 -pix_fmt yuv420p recordings/<name>.mp4
ffmpeg -i recordings/<name>.webm -vf "fps=12,scale=960:-1" recordings/<name>.gif
```

## 4. Report

Give the user the path of the video, its length, what the scenario showed, and any warnings the
page showed during the scan.
