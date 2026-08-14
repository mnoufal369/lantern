# Third-party notices

Lantern's own source code is licensed under the [MIT License](LICENSE),
© 2026 Mohammad Noufal. **That licence covers this repository's code only.**
Distributed builds also contain third-party components, listed below, under
their own terms.

## Anthropic components — proprietary, not MIT

Lantern is a client for the Claude Code agent runtime. The SDK, and the
per-platform runtime binaries embedded in the macOS `.dmg` and Windows
installer, are Anthropic's proprietary software:

| Component | Version | Terms |
| --- | --- | --- |
| `@anthropic-ai/claude-agent-sdk` | 0.3.223 | © Anthropic PBC. All rights reserved. |
| `@anthropic-ai/claude-agent-sdk-darwin-arm64` | 0.3.223 | © Anthropic PBC. All rights reserved. |
| `@anthropic-ai/claude-agent-sdk-darwin-x64` | 0.3.223 | © Anthropic PBC. All rights reserved. |
| `@anthropic-ai/claude-agent-sdk-win32-x64` | 0.3.223 | © Anthropic PBC. All rights reserved. |

Use of these components is governed by Anthropic's legal agreements:
<https://code.claude.com/docs/en/legal-and-compliance>. Nothing in Lantern's MIT
licence grants any right to Anthropic's software, and no redistribution right is
implied by its inclusion here.

Two consequences worth stating plainly:

- **Lantern is not affiliated with, endorsed by, or sponsored by Anthropic.**
  "Claude" and "Claude Code" are Anthropic's marks, referred to here only to
  describe what Lantern works with.
- **Every user authenticates with their own credentials** — their existing Claude
  Code login or their own Anthropic API key. Lantern operates no servers, proxies
  no requests, and never shares or resells access to Anthropic's services.

## Open-source components

Bundled in distributed builds:

| Component | Version | Licence |
| --- | --- | --- |
| Electron | 37.10.3 | MIT (includes Chromium and Node.js under their own licences) |
| React, React DOM | 19.2.8 | MIT |
| zustand | 5.0.14 | MIT |
| electron-store | 11.0.2 | MIT |
| simple-git | 3.36.0 | MIT |
| parse-diff | 0.12.0 | MIT |
| anser | 2.3.5 | MIT |
| Tailwind CSS | 4.3.3 | MIT |
| lucide-react | 0.544.0 | ISC |
| diff | 9.0.0 | BSD-3-Clause |

Full licence texts ship inside the application bundle and are available in each
package's directory under `node_modules/` in a source checkout.

## Your code and your data

Lantern stores sessions, transcripts and settings only on the machine it runs on,
and has no telemetry. It does send the code an agent needs to Anthropic's API in
order to work — exactly as Claude Code does in a terminal. If you point it at
code belonging to someone else (a customer, for instance), that transfer is
yours to have a lawful basis for.
