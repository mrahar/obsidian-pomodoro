# 🍅 Obsidian Pomodoro

A focused Pomodoro timer for [Obsidian](https://obsidian.md) that automatically logs your sessions to your daily note — no prompts, no interruptions.

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22obsidian-pomodoro%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)
![GitHub release](https://img.shields.io/github/v/release/mrahar/obsidian-pomodoro)
![License](https://img.shields.io/github/license/mrahar/obsidian-pomodoro)

---

## Features

- **⏱️ Wall-clock timer** — keeps ticking even when Obsidian is in the background or closed. On reopen, it picks up exactly where it left off.
- **📓 Auto-log to daily note** — when a session ends, it silently writes a row to your daily journal table. No pop-up, no typing.
- **🎵 Ambient sounds** — multiple sounds can play simultaneously with individual volume controls.
- **🎚️ Sound presets** — save up to 3 custom sound mixes and load them instantly.
- **🔔 Bell on completion** — a soft meditation bell plays at the end of every work or break session.
- **💾 Full persistence** — timer state, task name, and sound volumes are saved to disk and restored on next launch.
- **🌙 RTL / Persian-optimized** — built for Persian daily notes with Shamsi timestamps and right-to-left layout.

---

## How it works

1. Open the Pomodoro panel from the ribbon icon **🍅** or via command palette (`Pomodoro: open panel`).
2. Type what you're working on in the task field.
3. Hit **شروع** (Start). The timer runs — even if you close Obsidian.
4. When 25 minutes are up, a bell rings and a row is added to your daily note automatically:

| زمان | دسته | پروژه | توضیح | ⏱️ |
|:----:|------|-------|-------|:--:|
| ۱۴:۳۰ | 💻 کدنویسی | obsidian-pomodoro | رفع باگ تایمر | ۲۵ |

---

## Sessions

| Type | Duration |
|------|----------|
| 🍅 Work | 25 min |
| ☕ Short break | 5 min |
| 🌿 Long break | 15 min |

---

## Installation

> This plugin is not yet listed in the Obsidian Community Plugins browser. Install manually or via BRAT.

### Option A — Manual

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/mrahar/obsidian-pomodoro/releases).
2. Create a folder: `<your-vault>/.obsidian/plugins/obsidian-pomodoro/`
3. Copy the three files into that folder.
4. In Obsidian → Settings → Community Plugins → enable **Obsidian Pomodoro**.

### Option B — BRAT

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat).
2. In BRAT settings, click **Add Beta Plugin** and paste:
   ```
   mrahar/obsidian-pomodoro
   ```
3. Enable the plugin in Community Plugins.

---

## Daily Note Integration

The plugin appends to a `## 🍅 پومودورو‌های امروز` section in your daily note. For best results, add this table to your daily note template:

```markdown
## 🍅 پومودورو‌های امروز

| زمان | دسته | پروژه | توضیح | ⏱️ |
|:----:|------|-------|-------|:--:|
```

If the section doesn't exist, the plugin will create it automatically.

---

## Ambient Sounds

Click the **🎵 صداها** tab to access ambient sounds. You can:

- Toggle multiple sounds on/off simultaneously
- Adjust each sound's volume independently
- Save your current mix as a **preset** (up to 3 slots)
- Load any preset with a single click
- Double-click a preset name to rename it
- Reset all sounds and volumes to default with **↺ ریست**

---

## Built with

Vibe-coded with [Claude](https://claude.ai) (Anthropic).

---

## License

MIT
