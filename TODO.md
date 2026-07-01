# TODO - Live session attendance tracking (BackendAcademy)

## Step 1: Add persistence model
- Create `BackendAcademy/src/sessions/attendance.entity.ts` using TypeORM.
- Decide primary key and fields: `sessionKey`, `userId`, `joinedAt`, `leftAt`, `durationSeconds`.

## Step 2: Implement attendance service
- Create `BackendAcademy/src/sessions/attendance.service.ts`.
- Add methods: `join`, `leave`, `getSessionStats`.
- Join is idempotent per `(sessionKey,userId)` while active.

## Step 3: Implement controller + DTOs
- Create `BackendAcademy/src/sessions/dto/join-session-attendance.dto.ts`.
- Create `BackendAcademy/src/sessions/dto/leave-session-attendance.dto.ts`.
- Create `BackendAcademy/src/sessions/dto/get-session-attendance-stats.dto.ts` (if needed).
- Create `BackendAcademy/src/sessions/attendance.controller.ts` with endpoints:
  - `POST /api/v1/sessions/attendance/join`
  - `POST /api/v1/sessions/attendance/leave`
  - `GET /api/v1/sessions/attendance/:sessionKey/stats`

## Step 4: Add NestJS module wiring
- Create `BackendAcademy/src/sessions/sessions.module.ts` and register TypeORM entity + providers.

## Step 5: Wire into app
- Update `BackendAcademy/src/app.module.ts` to import `SessionsModule`.

## Step 6: Verify build
- Run `npm run build` (or `npm test`) inside `BackendAcademy`.

## Progress
- Step 1-5 implemented (sessions module + attendance tracking).


