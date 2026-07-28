# 🦀 RustAcademy — Learn Rust. Earn XLM. Build Web3.

> **A decentralized, AI-powered Rust programming academy on the Stellar blockchain — where learners earn XLM for completing tasks, tutors get rewarded for teaching, and a thriving developer community grows together.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Blockchain-Stellar-blue)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-orange)](https://soroban.stellar.org)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015-black)](https://nextjs.org)
[![Rust](https://img.shields.io/badge/Language-Rust-orange)](https://www.rust-lang.org)

---

## 🌐 What Is RustAcademy?

RustAcademy is an open-source, decentralized learning platform that bridges Rust programming education with Web3 incentives. It connects verified **Tutors** with **Learners** in a structured, gamified environment where:

- 📚 Learners complete Rust courses and coding tasks to **earn XLM rewards**
- 🧑‍🏫 Tutors create content, review submissions, and **earn XLM for their contributions**
- 🤖 An embedded **AI Mentor** guides learners, answers questions, and grades code
- 🗣️ A **social feed** lets developers share progress, insights, and collaborate
- 🔗 All rewards, badges, and certifications are **on-chain via Soroban smart contracts**

RustAcademy is unique in the Stellar ecosystem — no similar project combines Rust education, XLM-based incentive mechanics, tutor-learner matching, and social community in a single platform.

---

## ✨ Core Features

### 🎓 Learning Academy

- **Structured Learning Paths** — Beginner → Intermediate → Advanced → Soroban/Web3
- **Interactive Code Editor** — Browser-based Rust sandbox (powered by WebAssembly)
- **Task Submissions** — Learners submit Rust code; tutors and AI grade it
- **Progress Tracking** — XP points, streaks, and completion percentages
- **Quizzes & Challenges** — Multiple choice, fill-in-the-blank, and open-ended coding tasks
- **Certification NFTs** — On-chain Soroban-minted certificates for completed courses

### 💰 XLM Reward System (On-Chain)

- **Learn-to-Earn** — Complete tasks and earn XLM from a reward pool
- **Tutor Rewards** — Tutors earn XLM when their courses receive high ratings and completions
- **Milestone Bonuses** — Extra XLM for streaks, top scores, and first completions
- **Escrow-Based Payouts** — Soroban smart contracts hold and release rewards fairly
- **Anti-Cheat Oracle** — AI-powered code analysis prevents reward farming
- **Leaderboard Prizes** — Weekly top learners and top tutors share a prize pool

### 🤖 AI Mentor (Embedded Claude API)

- **Chat Interface** — Ask the AI anything about Rust, ownership, lifetimes, Soroban
- **Code Review** — Paste code snippets; AI explains errors and suggests improvements
- **Personalized Hints** — Stuck on a task? Get graduated hints without full spoilers
- **Automated Grading** — AI evaluates open-ended code submissions before tutor review
- **Learning Path Recommendations** — AI suggests next courses based on your progress
- **Voice Support** — Speech-to-text and TTS for accessible, hands-free learning

### 🧑‍🏫 Tutor System

- **Tutor Profiles** — Verified profiles with reputation scores, ratings, and specialties
- **Course Builder** — Drag-and-drop lesson editor with Markdown + code block support
- **Task Creator** — Define tasks with test cases, expected outputs, and scoring rubrics
- **Live Sessions** — Schedule 1-on-1 or group live coding sessions (WebRTC-powered)
- **Submission Review Dashboard** — Queue of learner submissions with AI pre-scoring
- **Earnings Dashboard** — Track XLM earned, pending rewards, and payout history

### 🗣️ Social Community Feed

- **Developer Feed** — Post Rust tips, code snippets, project updates, and memes
- **Like, Comment, Repost** — Twitter/X-style social interactions
- **Follow System** — Follow tutors, top learners, and friends
- **Showcase Projects** — Share Rust or Soroban projects you've built
- **Hashtags & Discovery** — #rust, #soroban, #stellar, #web3, #rustlang
- **Weekly Challenges** — Community-voted weekly Rust challenges with bonus XLM

### 💬 Community Chat & Messaging

- **Direct Messages** — 1-on-1 real-time chat between learners and tutors
- **Study Rooms** — Topic-based group chats (e.g., #rust-beginners, #soroban-dev)
- **Course Channels** — Each course has a dedicated discussion channel
- **Tutor Office Hours** — Scheduled open chat sessions with expert tutors
- **Code Sharing in Chat** — Syntax-highlighted code blocks in messages

### 🏆 Gamification & Reputation

- **XP & Level System** — Gain XP for every activity; level up from Rusty Rookie to Soroban Sage
- **Achievement Badges** — On-chain NFT badges (First PR, Speed Coder, Perfect Score, etc.)
- **Leaderboards** — Global, weekly, and course-specific rankings
- **Streak System** — Daily learning streaks with multiplier bonuses
- **Reputation Score** — Tutors and learners build verifiable on-chain reputation

### 🌐 Stellar Wallet Integration

- **Freighter Wallet** — Connect and sign transactions natively
- **XLM Dashboard** — View earned rewards, pending payouts, and transaction history
- **Multi-Asset Support** — USDC and other Stellar assets for premium features
- **Pathfinding Payments** — Stellar's path payment for flexible cross-asset rewards

---

## 🛠️ Technology Stack

### Frontend
| Tech | Purpose |
|------|---------|
| Next.js 15 (App Router) | Core framework with SSR and RSC |
| TypeScript | Type-safe codebase |
| Tailwind CSS v4 | Utility-first styling |
| shadcn/ui | Accessible component primitives |
| Monaco Editor | Browser-based Rust code editor |
| WebSockets (Socket.io) | Real-time chat and notifications |
| WebRTC (LiveKit) | Live tutor sessions |
| Zustand | Lightweight state management |
| TanStack Query | Data fetching and caching |
| Framer Motion | Smooth UI animations |

### Blockchain
| Tech | Purpose |
|------|---------|
| Stellar SDK (JS) | Stellar network interaction |
| Soroban Smart Contracts | Reward pools, escrow, NFT badges |
| Horizon API | Transaction history and account data |
| Freighter Wallet API | User wallet connection |
| Stellar Testnet / Mainnet | Dual-network support |

### Smart Contracts (Rust / Soroban)
| Contract | Purpose |
|----------|---------|
| `reward_pool` | Holds XLM; releases on verified task completion |
| `course_registry` | Stores course metadata and tutor ownership on-chain |
| `reputation` | Tracks and updates learner/tutor reputation scores |
| `certificate_nft` | Mints completion certificates as on-chain NFTs |
| `badge_nft` | Mints achievement badges on milestone events |
| `escrow_payout` | Time-locked tutor earnings escrow |
| `governance` | Community voting for content moderation and features |

### Backend
| Tech | Purpose |
|------|---------|
| NestJS | REST API and WebSocket server |
| PostgreSQL (Supabase) | User data, courses, submissions |
| Redis | Real-time pub/sub, sessions, rate limiting |
| Rust (WASM) | Server-side code execution sandbox |
| Custom Job Queue | Background jobs (JobRepository, JobRegistry, etc.) |
| Supabase client (@supabase/supabase-js) | Database access |

### AI & Voice
| Tech | Purpose |
|------|---------|
| Anthropic Claude API | AI Mentor chat, code review, grading |
| Whisper (OpenAI) | Speech-to-text for voice learning |
| ElevenLabs / TTS | Text-to-speech AI responses |
| Tree-sitter (Rust) | AST-based code analysis for grading |

### Infrastructure
| Tech | Purpose |
|------|---------|
| Docker + Docker Compose | Local and production containers |
| GitHub Actions | CI/CD pipelines |
| Railway / Render | Backend hosting |
| Vercel | Frontend hosting |
| Cloudflare R2 | Media and asset storage |
| Upstash | Serverless Redis |

---

## 📁 Monorepo Structure

```
rust-academy/
├── apps/
│   ├── web/                          # Next.js 15 frontend
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages & layouts
│   │   │   │   ├── (auth)/           # Auth pages (login, register)
│   │   │   │   ├── (dashboard)/      # Learner dashboard
│   │   │   │   ├── (tutor)/          # Tutor portal
│   │   │   │   ├── academy/          # Course catalog and player
│   │   │   │   ├── ai-mentor/        # AI chat interface
│   │   │   │   ├── social/           # Community feed
│   │   │   │   ├── chat/             # Messaging
│   │   │   │   ├── wallet/           # Stellar wallet & rewards
│   │   │   │   └── leaderboard/      # Rankings
│   │   │   ├── components/           # Reusable UI components
│   │   │   │   ├── ui/               # Base components (shadcn)
│   │   │   │   ├── academy/          # Course, lesson, task components
│   │   │   │   ├── social/           # Feed, post, comment components
│   │   │   │   ├── chat/             # Message, room components
│   │   │   │   ├── wallet/           # Wallet connect, balance display
│   │   │   │   └── ai/               # AI mentor chat UI
│   │   │   ├── context/              # React context providers
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   ├── lib/                  # Utilities, API clients, configs
│   │   │   └── styles/               # Global styles
│   │   ├── public/                   # Static assets
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   └── backend/                      # NestJS backend API
│       ├── src/
│       │   ├── contracts/            # Smart contracts integration
│       │   ├── ingestion/            # Data ingestion processing
│       │   ├── stellar/              # Stellar SDK integration
│       │   ├── soroban-tooling/      # Soroban utilities
│       │   ├── job-queue/            # Custom job queue system
│       │   ├── supabase/             # Supabase client integration
│       │   └── common/               # Shared utilities
│       └── package.json
│
├── packages/
│   ├── contracts/                    # Soroban smart contracts (Rust)
│   │   ├── reward_pool/
│   │   │   ├── src/lib.rs
│   │   │   └── Cargo.toml
│   │   ├── course_registry/
│   │   ├── reputation/
│   │   ├── certificate_nft/
│   │   ├── badge_nft/
│   │   ├── escrow_payout/
│   │   ├── governance/
│   │   └── Cargo.toml               # Workspace Cargo.toml
│   │
│   ├── shared/                       # Shared TypeScript types & utils
│   │   ├── src/
│   │   │   ├── types/                # Shared TypeScript interfaces
│   │   │   ├── constants/            # Shared constants (contract IDs, etc.)
│   │   │   └── utils/                # Shared utility functions
│   │   └── package.json
│   │
│   ├── stellar-client/               # Stellar/Soroban SDK wrapper
│   │   ├── src/
│   │   │   ├── wallet.ts             # Freighter wallet integration
│   │   │   ├── contracts.ts          # Soroban contract clients
│   │   │   ├── horizon.ts            # Horizon API helpers
│   │   │   └── payments.ts           # XLM payment helpers
│   │   └── package.json
│   │
│   └── ai-client/                    # Claude API wrapper
│       ├── src/
│       │   ├── mentor.ts             # Chat & tutoring prompts
│       │   ├── grader.ts             # Code grading prompts
│       │   └── reviewer.ts           # Code review prompts
│       └── package.json
│
├── scripts/
│   ├── deploy-contracts.sh           # Soroban contract deployment
│   ├── seed-db.ts                    # Database seeding
│   └── setup-reward-pool.ts          # Initialize XLM reward pool
│
├── docs/
│   ├── architecture.md               # System architecture
│   ├── smart-contracts.md            # Contract documentation
│   ├── api.md                        # API reference
│   └── contributing.md               # Contributor guide
│
├── docker-compose.yml                # Local dev environment
├── docker-compose.prod.yml           # Production environment
├── turbo.json                        # Turborepo configuration
├── pnpm-workspace.yaml               # pnpm workspaces
├── package.json                      # Root package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20 or higher
- **pnpm** v9 or higher (`npm install -g pnpm`)
- **Rust** (latest stable) + `cargo`
- **Stellar CLI** (`cargo install --locked stellar-cli`)
- **Docker** + Docker Compose (for local database/Redis)
- A **Freighter** browser wallet extension ([download here](https://freighter.app))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/rust-academy.git
cd rust-academy

# Install all dependencies (monorepo)
pnpm install

# Copy environment variables
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Start local infrastructure (PostgreSQL + Redis)
docker-compose up -d

# Run database migrations
pnpm --filter backend db:migrate

# Seed the database with sample courses
pnpm --filter backend db:seed

# Build shared packages
pnpm build --filter ./packages/*
```

### Environment Variables

**`apps/web/.env.local`**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_REWARD_POOL_CONTRACT_ID=<your-contract-id>
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=<your-contract-id>
```

**`apps/api/.env`**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/rustacademy
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=<your-anthropic-api-key>
JWT_SECRET=<your-jwt-secret>
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
REWARD_POOL_SECRET_KEY=<stellar-secret-key-for-reward-pool>
```

### Running the Development Server

```bash
# Run all apps in parallel (recommended)
pnpm dev

# Or run individually:
pnpm --filter web dev       # Frontend → http://localhost:3000
pnpm --filter backend dev   # Backend  → http://localhost:4000
```

### Building Soroban Smart Contracts

```bash
cd packages/contracts

# Build all contracts
cargo build --target wasm32-unknown-unknown --release

# Run contract tests
cargo test

# Deploy to Stellar Testnet
cd ../../
./scripts/deploy-contracts.sh --network testnet
```

---

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Frontend tests (Vitest + Testing Library)
pnpm --filter web test

# Backend tests (Vitest)
pnpm --filter backend test

# Smart contract tests (Rust)
cd packages/contracts && cargo test

# End-to-end tests (Playwright)
pnpm --filter web test:e2e
```

---

## 🏗️ Build for Production

```bash
# Build all apps
pnpm build

# Frontend only
pnpm --filter web build

# Backend only
pnpm --filter backend build

# Start production servers
pnpm start
```

---

## 🔗 Smart Contract Architecture

RustAcademy uses a suite of Soroban smart contracts to enforce trustless reward distribution:

```
Learner completes task
        │
        ▼
  AI Grader scores submission (off-chain)
        │
        ▼
  Tutor confirms or overrides score
        │
        ▼
  API calls reward_pool contract
        │
        ▼
  Contract verifies anti-cheat oracle signature
        │
        ▼
  XLM released to learner wallet
        │
        ▼
  reputation contract updates learner score
        │
        ▼
  certificate_nft minted if course completed
```

### Reward Pool Contract

```rust
// Simplified interface
pub fn submit_completion(
    env: Env,
    learner: Address,
    task_id: u64,
    score: u32,          // 0–100, verified by oracle
    oracle_signature: BytesN<64>,
) -> Result<i128, Error>  // Returns XLM amount paid out
```

### Certificate NFT Contract

```rust
pub fn mint_certificate(
    env: Env,
    learner: Address,
    course_id: u64,
    completion_timestamp: u64,
    final_score: u32,
) -> Result<u64, Error>   // Returns token ID
```

---

## 🎯 Learning Path Structure

```
🟢 BEGINNER — Rusty Rookie
  └── Rust Foundations (variables, types, functions)
  └── Ownership & Borrowing Mastery
  └── Structs, Enums & Pattern Matching
  └── Error Handling in Rust

🟡 INTERMEDIATE — Crab Coder
  └── Traits & Generics Deep Dive
  └── Async Rust with Tokio
  └── CLI Apps with Clap
  └── Testing & TDD in Rust

🔴 ADVANCED — Ferris Pro
  └── Unsafe Rust & FFI
  └── Performance Optimization
  └── Macros & Metaprogramming
  └── Building REST APIs with Axum

🔵 WEB3 — Soroban Sage
  └── Intro to Soroban & Stellar
  └── Writing Your First Smart Contract
  └── Token Contracts & DeFi Primitives
  └── Security Auditing for Soroban Contracts
```

---

## 🤝 Contributing

We welcome contributions! RustAcademy is built for the community.

1. **Fork** the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a **Pull Request**

See [`docs/contributing.md`](docs/contributing.md) for detailed guidelines, including how to:
- Add new courses and tasks
- Contribute to smart contracts
- Improve the AI Mentor prompts
- Add translations (i18n)

### Good First Issues

Look for issues labeled `good-first-issue` or `help-wanted` on GitHub. Contributions to open issues earn **contribution XP** on the platform — and top contributors earn XLM rewards too.

---

## 🗺️ Roadmap

### Phase 1 — Foundation (Q2 2025)
- [x] Monorepo setup and CI/CD
- [ ] Core learning academy (courses, tasks, progress)
- [ ] Freighter wallet integration
- [ ] Basic reward_pool Soroban contract
- [ ] AI Mentor MVP (chat + code hints)

### Phase 2 — Social & Tutors (Q3 2025)
- [ ] Tutor portal and course builder
- [ ] Community social feed
- [ ] Real-time chat rooms
- [ ] Certificate NFT minting
- [ ] Leaderboards and gamification

### Phase 3 — Advanced Features (Q4 2025)
- [ ] Live tutor sessions (WebRTC)
- [ ] Governance contract (community voting)
- [ ] Mobile app (React Native)
- [ ] Multi-language support (i18n)
- [ ] DAO-governed curriculum

### Phase 4 — Ecosystem (2026)
- [ ] Partner integrations (job boards, hackathons)
- [ ] SDK for embedding RustAcademy tasks in external apps
- [ ] Cross-chain certificate portability
- [ ] RustAcademy API for third-party course publishers

---

## 💡 Why RustAcademy on Stellar?

| Reason | Detail |
|--------|--------|
| **Fast & cheap** | Stellar settles in 3–5 seconds with near-zero fees — perfect for micro-rewards |
| **Soroban** | Rust-based smart contracts make the platform self-referential — learners use what they build |
| **XLM reach** | Stellar's global reach means learners worldwide can receive rewards without bank accounts |
| **Freighter UX** | Simple wallet UX lowers Web3 onboarding friction for developers new to crypto |
| **Ecosystem fit** | Stellar's mission of financial inclusion aligns with democratizing Rust education |

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [Stellar Development Foundation](https://stellar.org) for Soroban and the broader Stellar ecosystem
- [Anthropic](https://anthropic.com) for the Claude API powering our AI Mentor
- The global Rust community — 🦀 forever

---

<div align="center">
  <strong>Built with 🦀 Rust, 💙 Stellar, and ❤️ for developers everywhere</strong><br/>
  <a href="https://github.com/your-org/rust-academy">GitHub</a> •
  <a href="https://rustacademy.xyz">Website</a> •
  <a href="https://discord.gg/rustacademy">Discord</a> •
  <a href="https://twitter.com/rustacademy">Twitter</a>
</div>
