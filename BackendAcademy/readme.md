# BackendAcademy

RustAcademy backend module — placeholder for future NestJS backend implementation.

## Getting Started

```bash
pnpm install
pnpm run dev
```

## Structure

- `src/` — Application source code (NestJS modules, controllers, services)
- `test/` — Test files

See `app/backend/` for the primary backend implementation and conventions.

---

# Backend Guide for shadcn/ui

When integrating a frontend built with **shadcn/ui**, backend endpoints should provide consistent and predictable JSON responses to simplify component integration.

## Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Request completed successfully"
}
```

## Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "fields": {
      "email": "Email is required"
    }
  }
}
```

## Recommendations

- Return consistent response structures.
- Use proper HTTP status codes.
- Include field-level validation errors.
- Support pagination for table components.
- Keep payloads predictable for frontend consumers.
- Avoid exposing internal implementation details.

## Example Table Response

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0
    }
  }
}
```

## Example Select Response

```json
{
  "success": true,
  "data": [
    {
      "label": "Admin",
      "value": "admin"
    },
    {
      "label": "User",
      "value": "user"
    }
  ]
}
```

---

# AI Hints — How They Are Generated and Used

The AI subsystem lives in `src/ai/` and exposes three capabilities to the rest of the platform: **chat-based mentoring**, **graduated task hints**, and **AI pre-scoring of code submissions**. This section focuses on hints specifically, then covers the supporting pieces.

## Architecture Overview

```
Client (frontend / mobile)
        │
        ▼
  POST /ai/hint          ← AiController
        │
        ▼
  AiService.getHint()    ← business logic, hint store, difficulty routing
        │
        ├── [hint found in store]  →  return stored hint + increment usedCount
        └── [no hint in store]     →  return generic fallback message
```

When `AI_PROVIDER=claude` (or `openai`) is set, the `processChatRequest` path uses the provider to generate dynamic responses. The hint path currently uses a pre-seeded in-memory store — dynamic AI-generated hints are the planned Phase 2 upgrade (see below).

## Request / Response Shape

### POST `/ai/hint`

**Request body** (`GetHintDto`):

```json
{
  "challengeId": "sample-challenge-001",
  "userId": "user-abc",
  "difficulty": 2
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `challengeId` | string | ✅ | Identifier of the task or challenge |
| `userId` | string | ✅ | Identifier of the requesting learner |
| `difficulty` | number | ❌ | Hint tier to request (1 = most gentle, 3 = most specific). Defaults to 1 |

**Response body** (`AiHintResponse`):

```json
{
  "hint": "Consider edge cases - empty, null, or out-of-range inputs.",
  "hintId": "3f2c1a...",
  "difficulty": 2
}
```

| Field | Type | Description |
|---|---|---|
| `hint` | string | The hint text shown to the learner |
| `hintId` | string | UUID of the specific hint record (for analytics) |
| `difficulty` | number | Difficulty tier that was actually served (may differ from request if the requested tier was unavailable) |

If no hints exist for the given `challengeId`, the API returns HTTP 200 with a generic fallback:

```json
{
  "hint": "No hints available for this challenge yet. Keep trying!",
  "hintId": "<generated-uuid>",
  "difficulty": 1
}
```

## Hint Difficulty Tiers

Hints are designed to be **graduated** — each tier reveals progressively more information so learners are guided without being spoiled.

| Tier | Intent | Example |
|---|---|---|
| **1** — Conceptual nudge | Reframe the problem; no implementation detail | `"Start by understanding the problem requirements thoroughly."` |
| **2** — Edge-case reminder | Point toward gotchas without giving code | `"Consider edge cases — empty, null, or out-of-range inputs."` |
| **3** — Algorithmic direction | Suggest an approach or pattern | `"Implement brute-force first, then optimize."` |

When a learner requests tier 2 but only tier 1 is stored, `AiService.getHint()` falls back to the first available hint for that challenge rather than returning nothing.

## How Hints Are Stored and Seeded

`AiService` maintains an in-memory `Map<challengeId, Hint[]>` called `hints`. On startup, `initializeSampleHints()` pre-populates it with the three sample tiers for `"sample-challenge-001"`.

```
Hint {
  id          – UUID
  challengeId – which challenge this hint belongs to
  hint        – hint text
  difficulty  – tier number (1–3)
  usedCount   – incremented each time the hint is served
}
```

`usedCount` is tracked so the analytics layer can identify which hints learners reach most often — a signal that difficulty calibration may need adjustment on a given challenge.

In production, this in-memory store will be replaced by a database table. The service interface (`getHint`, `AiHintResponse`) will remain unchanged.

## AI Provider Wiring

The hint system currently runs entirely off the in-memory store, so it works without any API key configured. The full AI-powered chat path uses a pluggable provider selected at startup:

```
AI_PROVIDER=claude   →  ClaudeProvider  (Anthropic Messages API)
AI_PROVIDER=openai   →  OpenaiProvider  (OpenAI Chat Completions API)
(unset / other)      →  null provider   (deterministic fallback responses)
```

The factory is defined in `AiModule` and injects the chosen provider into `AiService` via the `AI_PROVIDER` token:

```typescript
// src/ai/ai.module.ts
const aiProviderFactory = {
  provide: AI_PROVIDER,
  useFactory: (configService: ConfigService) => {
    const provider = configService.get<string>('AI_PROVIDER');
    if (provider === 'openai') return new OpenaiProvider(configService);
    if (provider === 'claude') return new ClaudeProvider(configService);
    return null;          // ← fallback, no external calls
  },
  inject: [ConfigService],
};
```

`ClaudeProvider` calls `POST https://api.anthropic.com/v1/messages` using the model specified by `AI_MODEL` (default: `claude-sonnet-4-20250514`), with `AI_MAX_TOKENS` (default: 4096) and `AI_TEMPERATURE` (default: 0.7).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | _(none)_ | `claude` or `openai`; omit to use offline fallback |
| `ANTHROPIC_API_KEY` | _(none)_ | Required when `AI_PROVIDER=claude` |
| `OPENAI_API_KEY` | _(none)_ | Required when `AI_PROVIDER=openai` |
| `AI_MODEL` | `claude-sonnet-4-20250514` | Model name passed to the provider |
| `AI_MAX_TOKENS` | `4096` | Maximum tokens per AI response |
| `AI_TEMPERATURE` | `0.7` | Sampling temperature (0 = deterministic, 1 = creative) |

Copy `.env.example` and fill in the relevant keys:

```bash
cp .env.example .env
```

## Related Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ai/hint` | Fetch a graduated hint for a challenge |
| `POST` | `/ai/chat` | Send a free-form message to the AI Mentor |
| `POST` | `/ai/pre-score` | Submit code for an AI pre-score before tutor review |
| `GET` | `/ai/history/:userId` | Retrieve a user's full chat history |

### POST `/ai/chat`

Sends a conversational message to the AI Mentor. The system prompt is fixed to `"You are a helpful Rust programming tutor."` The full message history per user is stored in memory and returned by `GET /ai/history/:userId`.

Request body fields: `message` (string), `userId` (string), optional `context` (object).

### POST `/ai/pre-score`

Performs a static analysis pre-score on submitted Rust code before it enters the tutor review queue. The heuristic checks for:

- Presence of `fn main()` (+15 pts)
- Use of functions with non-trivial line count (+15 pts)
- Presence of comments (+10 pts)
- Code length > 20 lines (+10 pts)

Base score is 50. Final score is clamped to [0, 100]. A `confidence` of `0.7` is always reported in the current placeholder — this will be replaced by a model-calibrated confidence value once the full AI grading pipeline is wired in.

## Planned Enhancements (Phase 2)

- **Dynamic hint generation** — when no hint is stored for a `challengeId`, fall through to the AI provider to generate one on-demand using the task description as context.
- **Per-user hint gating** — track how many hints a learner has consumed per challenge and reduce XP payout accordingly.
- **Database persistence** — migrate `hints` and `chatHistory` maps to PostgreSQL via the Supabase client.
- **Streaming responses** — switch the chat endpoint to Server-Sent Events for real-time token streaming.
