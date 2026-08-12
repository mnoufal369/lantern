# Release notes

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
