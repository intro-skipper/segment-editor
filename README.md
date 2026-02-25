# Jellyfin Segment Editor

<div align="center">
  <p>
    <img alt="Segment Editor" src="images/logo_rounded.png" />
  </p>
  <p>
    Segment editing UI for Jellyfin (Intro/Recap/Outro/Preview/...).
  </p>
</div>

Manage Jellyfin Media Segment positions the simple way. This tool is in early stages of development.

- Create/Edit/Delete all kind of Segments (Intro, Outro, ...)
- Player to copy timestamps while you watch

It can run in two modes:

- Embedded in Jellyfin as a plugin page (recommended)
- Standalone web app that connects to a Jellyfin server you provide

## Install (Jellyfin plugin)

The web app is shipped to Jellyfin as the "Segment Editor" server plugin:

- Plugin repo: https://github.com/intro-skipper/segment-editor-plugin

Add the Intro Skipper plugin repository to Jellyfin, then install "Segment Editor" from the Catalog:

```
https://intro-skipper.org/manifest.json
```

> [!NOTE]
> This URL returns a manifest based on the Jellyfin version used to access it.
> It will not return a manifest when viewed in a browser (no Jellyfin version is provided).

## Requirements

- Jellyfin Server 10.10+
- A segments provider that exposes segment read/write endpoints:
  - [Intro Skipper](https://github.com/intro-skipper/intro-skipper) (Jellyfin 10.10.2+)
  - [MediaSegments API](https://github.com/intro-skipper/jellyfin-plugin-ms-api) (Jellyfin 10.10.0 / 10.10.1)
- Standalone mode only: Jellyfin API key (recommended) or a username/password login

## Usage

### Plugin mode

- Open Jellyfin Web UI -> Dashboard -> "Segment Editor".
- Direct URL: `http://myserver:8096/SegmentEditor`
- Authentication is inherited from the Jellyfin web UI (no manual API key entry).

Plugin packaging repo: https://github.com/intro-skipper/segment-editor-plugin

### Standalone mode

- Start the app, open Settings, and enter your Jellyfin server URL.
- Authenticate using an API key (recommended) or username/password.

API keys can be created in Jellyfin: Dashboard -> API Keys.

> [!IMPORTANT]
> In standalone mode, credentials are stored in the browser via `localStorage` (`segment-editor-api`).
> Treat API keys as secrets.

## Development

Prereqs: Node.js (LTS) and `pnpm` (see `package.json` -> `packageManager`).

```bash
pnpm install
pnpm dev
```

- Dev server: http://localhost:3000
- Tests: `pnpm test`
- Lint: `pnpm lint`
- Format/fix: `pnpm check`

## Build

### Standalone build

```bash
pnpm build
```

- Output: `dist/`

### Jellyfin plugin build

```bash
pnpm build:plugin
```

- Output: `dist-plugin/`
- Uses base path `/SegmentEditor/` and non-hashed asset filenames to support embedding.

## Hosting notes

The player/subtitle stack benefits from `SharedArrayBuffer`.
If you host the standalone build yourself, you may need cross-origin isolation headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

(`vite dev` and `vite preview` set these headers automatically; see `vite.config.ts`.)
