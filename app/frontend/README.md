


# 🦀 RustAcademy Web
> Next.js frontend for RustAcademy — Learn Rust, earn XLM, build Web3.

## Overview

RustAcademy Web provides the learner, tutor, and community experience for the platform.

Users can:

* Browse Rust courses
* Complete coding challenges
* Chat with the AI Mentor
* Join community discussions
* Manage rewards and certifications
* Connect Stellar wallets
* Track XP, streaks, and achievements
* Install as an app (PWA) and keep working offline

---

## Features

### 🎓 Learning Platform

* Course catalog
* Lesson player
* Interactive coding environment
* Progress tracking
* Quiz system
* Task submissions

### 🤖 AI Mentor

* Rust tutoring
* Soroban assistance
* Code explanations
* Error debugging
* Personalized recommendations

### 🧑‍🏫 Tutor Portal

* Course creation
* Task management
* Submission reviews
* Earnings dashboard

### 🗣️ Community

* Social feed
* Comments & reactions
* Study groups
* Direct messaging

### 💰 Wallet & Rewards

* Freighter integration
* Reward tracking
* Certificate viewing
* Badge collection

---

## Tech Stack

* Next.js 15
* TypeScript
* Tailwind CSS v4
* shadcn/ui
* Zustand
* TanStack Query
* Framer Motion
* Monaco Editor
* Socket.io Client
* Stellar SDK

---

## Folder Structure

```bash
src/
├── app/
├── components/
├── hooks/
├── lib/
├── providers/
├── store/
├── types/
└── styles/
```

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000

NEXT_PUBLIC_STELLAR_NETWORK=testnet

NEXT_PUBLIC_REWARD_POOL_CONTRACT_ID=
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=
NEXT_PUBLIC_BADGE_CONTRACT_ID=
NEXT_PUBLIC_REPUTATION_CONTRACT_ID=
```

---

## Development

```bash
pnpm install

pnpm dev
```

Runs on:

```bash
http://localhost:3000
```

---

## Build

```bash
pnpm build
pnpm start
```

---

## Testing

```bash
pnpm test
```

---

## Key User Flows

### Learner Journey

```text
Register
  ↓
Connect Wallet
  ↓
Enroll in Course
  ↓
Complete Tasks
  ↓
AI/Tutor Review
  ↓
Earn XLM
  ↓
Receive NFT Certificate
```

---

## PWA & Offline Support

RustAcademy Web is an installable Progressive Web App with offline-first caching.

### How it works

| Piece | File | Role |
| --- | --- | --- |
| Web manifest | `src/app/manifest.ts` | App name, icons, theme, standalone display, and app shortcuts (Generate Link, Dashboard). Served at `/manifest.webmanifest`. |
| Service worker | `public/sw.js` | Precaches the app shell and handles runtime caching (see strategy below). |
| Install/update UI | `src/components/PWAHandler.tsx` | Registers the service worker, shows the install banner, and prompts to refresh when a new version is deployed. Mounted globally in `src/app/layout.tsx`. |
| Offline fallback | `src/app/offline/page.tsx` | Shown for navigations when the network is unreachable and no cached copy exists. |

### Caching strategy

* **Navigations (HTML)** — network-first. Fresh pages when online; the last cached copy (or `/offline`) when the connection drops.
* **Static assets** (`/_next/static`, images, fonts, styles, scripts) — cache-first with runtime population. Hashed Next.js assets are immutable, so cache hits are always safe.
* **Never cached** — `/api/*` routes and cross-origin requests. Payment data is always fetched live.

Bump the `VERSION` constant in `public/sw.js` when changing cache behavior; old caches are cleaned up on activation.

### Install flow

1. On first eligible visit, the browser fires `beforeinstallprompt`; `PWAHandler` shows an install banner (bottom-right on desktop).
2. "Install Now" triggers the native install prompt. "Later" hides the banner for 7 days (stored in `localStorage`).
3. Installed users (standalone display mode, including iOS "Add to Home Screen") never see the banner.
4. When a new service worker is deployed, users get a refresh prompt on their next visit.

### Testing locally

Service workers require a secure context. `localhost` counts, so:

```bash
pnpm build && pnpm start
```

Then in Chrome DevTools → **Application**:

* **Manifest** — verify name, icons, and installability.
* **Service workers** — confirm `sw.js` is activated.
* **Network → Offline** — reload to see cached pages / the offline fallback.

> Note: the dev server (`pnpm dev`) serves `sw.js`, but caching behavior is only meaningful against a production build.

---

Recommended:

* Frontend → Vercel
* Assets → Cloudflare R2





