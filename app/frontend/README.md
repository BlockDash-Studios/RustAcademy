


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

### 👤 Public Profiles

* Username-based payment pages (`/[username]`)
* Real-time profile fetching from backend API
* Error handling with fallback UI
* Server-side validation and metadata generation
* localStorage fallback for additional profile metadata
* 404 error pages with navigation

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

# RustAcademy Backend API URL (overrides NEXT_PUBLIC_API_URL for profile endpoints)
NEXT_PUBLIC_RustAcademy_API_URL=http://localhost:4000

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

RustAcademy Web is an installable Progressive Web App with offline-first caching and safe refresh timing.

### Architecture Overview

| Component | File | Role |
| --- | --- | --- |
| Web Manifest | `src/app/manifest.ts` | App metadata: name, icons, theme, standalone display, and shortcuts (Generate Link, Dashboard). Served at `/manifest.webmanifest`. |
| Service Worker | `public/sw.js` | Precaches app shell and offline page. Implements network-first for navigations and cache-first for assets. Handles stale-while-revalidate for better offline UX. |
| Install/Update Handler | `src/components/PWAHandler.tsx` | Registers service worker, manages install/update prompts with safe timing and dismissal logic. |
| Online Status Provider | `src/lib/onlineStatus.tsx` | Real-time online/offline state management. Available globally via `useOnlineStatus()` hook. |
| Offline Indicator | `src/components/OnlineStatusBadge.tsx` | Shows user when they're offline and how long they've been offline. |
| Offline Page | `src/app/offline/page.tsx` | User-friendly fallback when navigations fail and no cache exists. Auto-redirects when connection restored. |
| Error Reporting | `src/lib/errorReporter.ts` + `src/components/ErrorReportingShell.tsx` | Captures errors across the app with full context and PII redaction. |

### Install Flow

```
┌─ User visits app (first time)
│
├─ Service worker registers
│  └─ Precaches app shell + offline page + icons
│
├─ 3 seconds after page load
│  └─ beforeinstallprompt fires
│
├─ PWAHandler shows install banner (if eligible)
│  • Not already installed (standalone mode)
│  • Not dismissed in last 7 days
│  • User is online
│
├─ User clicks "Install Now"
│  └─ Native install prompt (browser/platform-specific)
│
└─ appinstalled event fires
   └─ Banner hidden, app marked as installed
```

**Safety Features:**
- Install prompt only shows when online (better UX, no network errors during install)
- 3-second delay prevents prompt distraction on initial page load
- Dismissing prompt doesn't break navigation or app functionality
- Automatic re-offer after 7 days if user dismisses
- iOS "Add to Home Screen" flow handled seamlessly

### Update Flow

```
┌─ New version deployed
│
├─ Service worker detects update
│  └─ updatefound event fires
│
├─ New worker installs and reaches "waiting" state
│  └─ PWAHandler detects new version available
│
├─ PWAHandler shows update banner (if online)
│  • Allows user to refresh now or later
│  • Dismissing doesn't break current session
│
├─ User clicks "Refresh Now"
│  └─ Window reloads, new SW activated
│
└─ New version ready to use
```

**Safety Features:**
- Updates detected automatically via periodic checks (every 60 seconds)
- Update banner only shows when online
- User can dismiss update and continue using current version
- Refresh is non-destructive (just reloads page)
- Service worker periodically checks for updates even without banner

### Caching Strategy

#### Navigations (HTML Pages)
- **Strategy:** Network-first with offline fallback
- **Behavior:**
  1. Try to fetch fresh page from network
  2. If network succeeds → cache response and return it
  3. If network fails → return cached copy (if available)
  4. If no cache exists → return `/offline` page
- **Use Case:** Always show latest content when online; gracefully degrade offline
- **Example:** User navigates to `/dashboard` — gets latest data if connected, or last cached version if offline

#### Static Assets
- **Strategy:** Cache-first with stale-while-revalidate
- **Behavior:**
  1. Check cache for asset
  2. If fresh (within 24 hours) → return immediately
  3. If stale (older than 24 hours) → fetch fresh copy in background
  4. If fetch fails → return stale cache (if available)
  5. If no cache exists → return 408 offline response
- **Rationale:** Hashed Next.js assets (`/_next/static/`) are immutable, so cache hits are always correct
- **Example:** CSS, JS bundles, images served from cache instantly, with optional refresh in background

#### Never Cached
- **API Routes:** `/api/*` — always fetched live
- **Cross-Origin:** Requests to external domains
- **Rationale:** Payment data and real-time information must be live

**Cache Versioning:**
- Service worker versioned by `VERSION` constant in `public/sw.js`
- Update `VERSION` when changing cache behavior
- Old caches automatically deleted on service worker activation

### Offline State Management

#### Real-Time Detection
```tsx
import { useOnlineStatus } from "@/lib/onlineStatus";

export function MyComponent() {
  const { isOnline, wasOffline, offlineSince } = useOnlineStatus();
  
  return <div>Status: {isOnline ? "Online" : "Offline"}</div>;
}
```

#### State Transitions
- **Initial:** `isOnline = navigator.onLine` (reflects network status)
- **Goes Offline:** `isOnline = false`, `wasOffline = true`, `offlineSince = Date`
- **Goes Online:** `isOnline = true`, `offlineSince = undefined`
- **SessionStorage:** `wasOffline` persists for session duration (cleared on new session)

#### UI Indicators
- **OnlineStatusBadge:** Shows offline duration (mobile only by default)
- **PWAHandler:** Disables install/update prompts when offline
- **Offline Page:** Shows friendly message with retry button

### Acceptance Criteria Verification

#### ✅ Installation and Update Prompts
- [x] Prompts appear only in eligible contexts (not installed, not dismissed, online)
- [x] Dismissing without breaking navigation (non-destructive)
- [x] Install banner shown 3s after page load (not intrusive)
- [x] Update banner shown when new version detected
- [x] Both prompts can be dismissed; user can continue using app

#### ✅ Offline Fallback Pages
- [x] Gracefully shown when cached routes unavailable
- [x] Clear messaging about offline state
- [x] Retry button for connection recovery
- [x] Auto-redirect when connection restored
- [x] "Go Home" button for manual navigation

#### ✅ Cache/Versioning Strategy
- [x] Documented in this README (you're reading it!)
- [x] Aligned with deployment behavior:
  - VERSION bump = auto cache cleanup
  - Hashed assets = immutable cache hits
  - Network-first navigations = always fresh when possible
- [x] Stale-while-revalidate for better offline UX
- [x] PII redaction in error reporting

### Offline Error Reporting

Errors that occur while offline are automatically queued using IndexedDB and retried when connectivity is restored.

#### Features
- **Error Queueing:** Errors stored in IndexedDB when offline
- **Automatic Retry:** Queued errors auto-resend when online
- **Retry Limits:** Max 3 retry attempts per error
- **Graceful Cleanup:** Failed errors removed after max retries

#### Usage
No manual setup needed — errors are automatically queued:

```tsx
// This error will be queued if offline, then retried when online
throw new Error("Something went wrong");

// Unhandled promise rejections are also queued
Promise.reject("Network failed");
```

#### Storage
- Stored in IndexedDB database `rustacademy-error-queue`
- Persists across page reloads
- Cleared automatically after successful transmission
- Older errors removed first if queue fills up

### Connectivity Health Checks

Real-time connectivity detection beyond `navigator.onLine`:

```tsx
const { isOnline, isCheckingConnectivity } = useOnlineStatus();

// isOnline updates based on:
// 1. navigator.onLine (offline mode detection)
// 2. Periodic connectivity heartbeats (every 30s)
// 3. Real network requests (not just absence of offline mode)
```

The heartbeat uses a lightweight `HEAD` request to `/manifest.webmanifest` with a 5-second timeout. If it times out or fails, the app detects degraded connectivity even when `navigator.onLine` says true.

**Benefits:**
- Detects network unavailability beyond offline mode
- Prevents showing "online" with 0% connectivity
- Updates app state reactively when connectivity changes

Service workers require HTTPS (or localhost). To test:

```bash
cd app/frontend

# Build and start production server
pnpm build
pnpm start
```

Then in Chrome DevTools:

1. **Application → Manifest:** Verify installability and metadata
2. **Application → Service Workers:** Confirm `sw.js` is activated
3. **Application → Cache Storage:** View cached pages and assets
4. **Network → Offline:** Reload to test offline behavior
5. **DevTools → Sensors → Network:** Simulate online/offline transitions

**Testing on Real Devices:**
- **Android:** Use Chrome DevTools remote debugging
- **iOS:** Settings → Safari → Advanced → Web Inspector (requires macOS with Safari)
- **Device Offline:** Toggle airplane mode, disconnect WiFi, or use browser's throttling

### Deployment Checklist

Before deploying PWA changes:

- [ ] **Service Worker Versioning:** Bump `VERSION` in `public/sw.js` if cache strategy changed
- [ ] **Icons:** Ensure `icon-192.png` and `icon-512.png` exist and are optimized
- [ ] **Manifest:** Verify `start_url`, `scope`, and metadata are correct
- [ ] **HTTPS:** Ensure app is served over HTTPS (PWA requirement)
- [ ] **Test Offline:** Verify offline page loads when network unavailable
- [ ] **Test Update:** Deploy dummy version change, verify update prompt works
- [ ] **Error Reporting:** Verify error reporting endpoint is configured and receiving errors
- [ ] **Mobile Testing:** Test install flow on iOS and Android devices
- [ ] **Cache Cleanup:** Old versions should be cleaned up after new deployment

### Environment Variables

```env
# Error Reporting (optional)
NEXT_PUBLIC_ERROR_REPORTING_ENABLED=true
NEXT_PUBLIC_ERROR_REPORTING_URL=https://your-error-service.com/errors
```

### Performance Metrics

- **First Install:** ~2MB (app shell + icons)
- **Cache Cleanup:** Automatic on SW activation
- **Update Check:** Every 60 seconds (efficient polling)
- **Install Prompt Delay:** 3 seconds (prevents distraction)

### Troubleshooting

**Install Banner Not Showing**
- Not on HTTPS/localhost? PWA requires secure context
- Already installed? Uninstall from system settings
- Recently dismissed? Wait 7 days or clear localStorage (`pwa-install-dismissed-at`)
- Offline? Banner only shows online

**Update Not Working**
- Service worker running? Check DevTools → Application → Service Workers
- Check DevTools → Network to see if new SW is fetching
- Browser cache interfering? Hard refresh (`Ctrl+Shift+R`)
- Try manual check: DevTools → Application → Service Workers → Update

**Offline Page Not Showing**
- Network offline but route cached? Network-first should serve cache
- No cache and offline? `/offline` page should load
- Check DevTools → Cache Storage for precached assets

**High Cache Usage**
- Check DevTools → Application → Storage
- Delete old caches manually (bump VERSION to auto-cleanup)
- Implement cache size limits if needed (not built-in)

---

Recommended:

* Frontend → Vercel
* Assets → Cloudflare R2





