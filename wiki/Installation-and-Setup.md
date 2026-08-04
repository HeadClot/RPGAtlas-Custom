# Installation & Setup

RPGAtlas runs in your web browser, but it can't just be opened from a file on your disk — browsers
block the saving and asset features that the editor needs unless the files are *served* over a tiny
local web address (`http://localhost`). Don't worry: you don't have to understand any of that. On
Windows there's a one-click launcher that runs the right server for you.

---

## Windows: the easy way (recommended)

1. **Download RPGAtlas** and unzip it somewhere you'll remember, like your Desktop or Documents.
   Keep all the files together in the `RPGAtlas` folder.
2. **Double-click `RPGAtlas.exe`.**
3. A small black window appears and your web browser opens to the editor automatically. That's it —
   you're making games.

Downloaded copies ship the editor **pre-built**, so there is nothing else to install — no Python, no
Node.js, no admin rights.

**Keep the little black window open** while you work. It runs the local server that powers the
editor; closing it stops RPGAtlas. When you're done for the day, close the browser tab and then close
that window.

The launcher uses the first free port between **8080 and 8099** (the address is printed in the black
window, usually `http://localhost:8080/`). If you'd rather it not open a browser tab by itself —
say, from a script or shortcut — start it with the `--no-browser` flag:

```
RPGAtlas.exe --no-browser
```

### Running from a source checkout (git clone)

The editor's *source* is TypeScript, which browsers can't run directly — it needs the Vite dev
server. That means two one-time steps before the double-click works:

1. **Install [Node.js](https://nodejs.org/)** (version 18 or newer) — take the big green "LTS"
   download and click through the installer.
2. Open a terminal in the RPGAtlas folder (in File Explorer, click the address bar, type `cmd`,
   press Enter) and run:

   ```
   npm install
   ```

   Wait for it to finish — this downloads the editor's tooling into a `node_modules` folder.

`RPGAtlas.exe` then detects the tooling and boots the dev server automatically. If you skip a step,
the launcher tells you: it asks you to run `npm install` if the setup is missing, or to install
Node.js if it can't find it.

### Put RPGAtlas on your Desktop

Want to launch it like any other app? Double-click **`Create Desktop Shortcut.cmd`** once. An
RPGAtlas icon appears on your Desktop — use it any time to start the engine.

### "Windows protected your PC" / unknown publisher

The first time you run `RPGAtlas.exe`, Windows SmartScreen may warn you because the launcher is
**unsigned** (code-signing certificates cost money, and this is free software). The launcher only
starts a local server and opens your browser — it doesn't change anything on your system.

To run it: click **More info**, then **Run anyway**.

---

## Any platform: the manual way

If you're on macOS or Linux, or you'd rather not use the `.exe`:

- **Downloaded (pre-built) copy** — any static file server works, e.g. with
  [Python](https://www.python.org/) (most Macs and Linux machines already have it):

  ```
  cd RPGAtlas
  python -m http.server 8080
  ```

- **Source checkout** — you need [Node.js](https://nodejs.org/) 18 or newer:

  ```
  cd RPGAtlas
  npm install   # one-time setup
  npm run dev
  ```

Then open the printed **http://localhost:…** address in your browser. That page *is* the editor.

> **Why a server at all?** Browsers refuse to let a page saved on your disk (`file://...`) use
> `localStorage` (where your work is auto-saved) or scan folders for custom art — and a source
> checkout's TypeScript editor additionally needs the dev server (Vite) to translate it on the fly.
> Serving over `http://localhost` solves all of it. Nothing leaves your computer; "localhost" means
> "this machine."

---

## First launch: what you'll see

When the editor opens you'll already have a complete sample game loaded, called **Atlas Quest**. It's
there so you can poke around immediately:

- Hit **▶ Playtest** (top toolbar) to play it.
- Or open **`play.html`** directly (e.g. `http://localhost:8080/play.html`) to play the bundled
  sample without the editor.

When you're ready to make your own, choose **File ▸ New Project** — and head to
[Make Your First Game](Your-First-Game).

---

## Saving your work

RPGAtlas **auto-saves to your browser** as you go (using `localStorage`). That's convenient, but it
lives inside *one browser on one computer*. For real safety:

- **File ▸ Save / Export Project** writes a `.json` file you control — back this up like any document.
- **File ▸ Open Project** loads a `.json` back in.

Treat the `.json` as your master copy. See [Publishing Your Game](Publishing-Your-Game) for turning a
project into something other people can play.

> **Heads up:** Clearing your browser data, or using a different browser/computer, means the
> auto-save won't be there. Always keep a recent `.json` backup.

---

## Building the launcher from source (advanced)

If you cloned the source and there's no `RPGAtlas.exe` yet, you can build it on Windows — the only
tool required is the .NET Framework compiler that ships with Windows:

```
tools\build-engine-launcher.ps1
```

This generates the app icon and produces `RPGAtlas.exe` in the project root.

**Next:** [Make Your First Game →](Your-First-Game)
