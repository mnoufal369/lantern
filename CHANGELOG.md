# Release notes

## 0.8.1: Check for updates when you want to
- **Loods → Check for Updates…** in the menu bar (Help on Windows), and a
  **Check for updates** button next to the version in Settings. Until now the
  app only looked on launch and every six hours, with no way to ask.
- It always answers. If there's nothing new you get a short "You're on the
  latest version" note rather than a button that appears to do nothing, and if
  GitHub can't be reached it says that instead.
- Asking by hand also brings back a banner you dismissed earlier.

## 0.8.0: Pilot is now Loods
- **New name.** *Loods* is Dutch for the harbour pilot — the specialist who
  boards a vessel and guides it safely into port. It says what the app does
  without sounding like every other AI assistant.
- **New icon**: signal flag “H” of the international code, which means
  *I have a pilot on board*. White hoist, red fly, and it still reads at 16px.
- **The window has a logo again.** The mark and the name now sit top-left in the
  header, where there was nothing before.
- The terminal command is now `loods` (the old `pilot` command is removed when
  you install, since nothing answers `pilot://` any more), and links are
  `loods://`.
- Your sessions, settings and API key carry over automatically — the app
  migrates its data folder across the rename.
- Self-update no longer hardcodes the app's name, so a future rename can't
  break it again. **This one update has to be installed by hand**, because the
  version you have is looking for a file called `Pilot.app`.

## 0.7.2: Restore a session by its ID
- **Paste a session ID into Terminal history** to reopen any Claude Code
  conversation — including ones older than the list reaches. It shows the
  session's title, folder and branch so you can check it's the right one
  before importing. A bare ID works, so does a `claude --resume` line or the
  path of a transcript file.
- A session **already open in Pilot** now offers to switch to it, instead of
  quietly being missing from the list.
- If a session's project folder has since been deleted, Pilot says so rather
  than failing on your first message.

## 0.7.1: Updates that ask first
- **Pilot no longer disappears mid-sentence.** Choosing to update now downloads
  the new version in the background while you keep working, then asks before
  restarting. Nothing is replaced until you say yes.
- **You can watch it happen.** The banner shows a real progress bar as it
  downloads — or the current build step, if you installed from source.
- **"Later" is a real answer.** The update waits, and Pilot offers it again the
  next time you open it.
- **Quitting mid-task asks too.** If an agent is still working, quitting now
  warns you first rather than stopping it silently.
- The installer waits for Pilot to actually close before replacing it, instead
  of guessing at one second.

## 0.7.0: You can see it thinking
- **Signs of life.** While an agent works you get a playful status word, the sidebar
  status glows in that agent's colour, and the message box is ringed by a slowly
  turning band of colour.
- **Sub-agents.** When an agent hands work to helpers, it says which ones it is
  waiting on.
- **Jump to latest.** Scrolled up mid-answer? A button appears to take you back
  to the bottom.
- **New Frontend Dev agent** in the presets: it studies your existing components,
  hooks and design tokens before writing anything, and follows your code style.
- Closing a tab now keeps you in the session and moves to the tab beside it.
- Shift and Return adds a new line reliably, and the message box hints at the
  handful of shortcuts worth knowing.
- Files you have touched drop off the list once their changes are undone.
- Token counts read as 18.3k rather than 18277, and the Copy button no longer
  lands on top of nearby text.

## 0.6.0 — Branching conversations
Community PR #2 — thank you!

- **Branch a session**: fork any conversation into a new tab — same history
  up to that point, then each side continues independently. Great for trying
  two approaches against the same context.
- **Colour tags** on session tabs, so a busy sidebar stays scannable.
- Smarter top bar: items collapse gracefully on narrow windows, and long
  file names truncate intelligently mid-path.

## 0.5.7 — A message box you can actually read
- The composer grows with what you type or paste (wrapped lines included),
  up to ~12 lines before scrolling — no more squinting at two visible lines.
- Update checks now compare against the latest published release instead of
  the branch, so they work on any machine (no git needed) and only fire for
  real releases. Releases carry just the dmg and the Windows installer now.

## 0.5.6 — Downloads, simplified
- Self-update now installs straight from the **dmg** — releases need only the
  dmg (macOS) and Setup exe (Windows). This release carries the mac zip one
  last time so older installs can hop over; future releases drop it.

## 0.5.5 — Fresh public start
- Downloads now live exclusively on [GitHub Releases](https://github.com/mnoufal369/ai-pilot/releases):
  the `.dmg` for macOS, the Setup `.exe` for Windows. (The mac zip asset stays —
  it's what the in-app self-updater downloads.)
- Repository history was restarted clean for the public release.

## 0.5.4 — Public!
- The repository is public now: the intro page ships via GitHub Pages, the
  README got a proper landing treatment, and MIT license is formalized.
- Self-update no longer needs GitHub credentials — anyone with the app can
  click **Update now** and get the latest release.

## 0.5.3 — One-click updates for everyone
- **Zip installs now self-update too.** "Update now" downloads the latest
  prebuilt build straight from the project's releases (using the GitHub
  access already on your Mac) and swaps itself in — no Node, no repo clone,
  no terminal. Requires read access to the repository, same as before.
- Releases are now published with `yarn release` as part of every ship.

## 0.5.1 — Wearing the wings
- The Pilot mark (paper plane, pulsing lead dot) now sits in the top bar next
  to a larger, sharper wordmark.

## 0.5.0 — One-click self-update
- The update banner now has an **Update now** button (for installs built from
  the repo): Pilot pulls main, rebuilds, reinstalls and restarts itself — no
  terminal needed. Progress is logged to `self-update.log` in the app's data
  folder. Zip installs keep the copyable command instead.
- New Session explains when repo suggestions need the GitHub CLI, instead of
  showing nothing (0.4.5), and mode buttons always respond even when a
  session's engine is asleep (0.4.4).

## 0.4.2 — Your org, one keystroke away
- Set your **GitHub organisation** in Settings and New Session pre-fills
  `github.com/<org>/` and suggests the org's repositories as you type
  (powered by the `gh` CLI when available).
- The "New tab" button got a visible label, and New Session opens prefilled
  from your active session — same agent, same folder.

## 0.4.0 — Context meter, instant tabs, and `pilot .`
- **Context meter**: the header now shows how full the agent's memory is
  (e.g. `34% ctx` with a tiny bar) next to cost and tokens — amber past 70%,
  red past 90%, when the agent starts forgetting the oldest turns.
- **New tab on this project**: one click in the header (or via ⌘K) opens a
  fresh conversation on the same folder with the same agent — no more
  re-picking paths for every session.
- **`pilot .` from the terminal**: like `code .` — opens (or focuses) the
  Pilot tab for the current folder. Installed automatically by
  `yarn setup:mac`; works from any folder: `pilot ~/projects/api`.

## 0.3.2 — Slash commands from the first keystroke
- The `/` menu is never empty anymore: fresh installs start with the standard
  commands (`/review`, `/security-review`, `/init`, `/compact`) and switch to
  the full list your agent reports — including custom commands — as soon as
  any session runs.

## 0.3.1 — Slash commands in every session
- Sessions created on older versions (or not yet started) now pick up the
  agent's command list instead of showing none.

## 0.3.0 — The feedback round
Thanks to everyone who sent notes — every one of these came from you.

- **Copy anything**: hover any response for a copy button; bash commands and
  their output each have one too (code snippets already did).
- **Token counts** next to the price in the session header, in both modes.
- **`/` commands**: type `/` to see your agent's real commands (review,
  security-review, …), filter as you type, or send anything with arguments
  ("/review-pr 123") verbatim.
- **Image drop fixed**: dragging a picture into the chat attaches it (with a
  preview) instead of opening the New Session dialog. Folders still start
  sessions.
- **Permission dialog behaves**: long commands collapse to a preview, the
  "always allow" note clamps to two lines, and the buttons can never be pushed
  off screen again.
- **Long responses fold** to ~30 lines with "Show the rest".
- **Updates announce themselves**: when a new version lands, a banner appears
  in the app with the update command ready to copy (`git pull && yarn setup:mac`).

## 0.2.2 — New wings
- New app icon: the paper plane with the red lead dot.
- Fixed the macOS **"Pilot is damaged"** dead end for shared builds — bundles
  are now properly ad-hoc signed, so a shared DMG/zip shows a
  one-time, recoverable "Open Anyway" prompt instead. Added `yarn dist:share`
  (arm64 / x64 / universal) with signature verification before packaging, and
  a one-command install: `yarn setup:mac`.

## 0.2.1 — Just Pilot
- The product is simply **Pilot** now — branding cleaned up everywhere.

## 0.2.0 — The hardening release
A full architect + QA + product review of the app, with every finding fixed.

- **Safer approvals**: "always allow" rules match precisely — chained commands
  (`a; b`, `a && b`) always re-ask, and risky commands are only remembered as
  exact matches. Interrupt also cancels pending permission prompts.
- **Live tool results**: diffs, outputs and spinners update reliably.
- **Nothing gets lost**: transcripts snapshot mid-turn, failed sends hand the
  draft back, crashed agents resume on the next message, session costs
  survive restarts.
- **Notifications** when an agent finishes, errors, or needs approval while
  Pilot is in the background — click to jump to the session.
- **Archived sessions** can be restored or permanently deleted (with cleanup).
- **Onboarding** now sets up your Claude connection, not just the UI mode.
- **Cost controls**: usage view in Settings (7-day / all-time / per agent) and
  a live budget bar when an agent has a spending cap.
- **QA niceties**: `#123` fetches a pull request, ⌘F searches a conversation,
  one click copies the session as a report, recent folders/repos are chips in
  New Session.
- **Quality gates**: 26 automated tests and CI on every change.
