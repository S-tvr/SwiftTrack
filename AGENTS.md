# AGENTS.md — SwiftTrack (Phase 1)

Instructions for the coding agent. Goal: reliable, controlled coding — no guessing, no correction loops, no loss of context between steps/sessions.

---

## Read Before Anything Else

Read in this exact order before writing any code:

All four live in `context/`, not in the repo root.

1. `context/swifttrack-phase1-final.md` — the **what** and the **why** (domain model, business decisions, API contract, user flows)
2. `context/architecture.md` — the **how** (folder structure, patterns, data flow, invariants)
3. `context/build-plan.md` — the **order** of execution (steps 0-14, one at a time)
4. `context/progress-tracker.md` — what has **already** been built (see below· created in Step 0 if it doesn't exist)

Don't start implementing any step before reading all 4. If one is missing, say so explicitly instead of proceeding.

---

## Rules That Never Change

- **One step at a time.** Never multiple steps of `build-plan.md` together, even if asked to "build the whole app".
- After each step: **stop**, summarize what you built (files, endpoints, components), update `progress-tracker.md`, and wait for explicit confirmation before proceeding.
- The **Invariants** in `architecture.md` always apply, regardless of step — they are never overridden by any prompt.
- Before touching any 3rd-party library (e.g. upgrading Prisma, a new auth pattern, a new shadcn component) — check its official documentation first instead of relying on prior knowledge. Versions/APIs may have changed.
- No change to the domain model (`User`, `TimeEntry`, `AppSettings`) without updating all 3 context files (spec, architecture, build-plan) — they never fall out of sync with each other.

---

## Progress Tracker

File: `context/progress-tracker.md` (created in Step 0 if it doesn't already exist).

After completing **each** step of `build-plan.md`, the agent adds an entry:

```
## Step N — <step title>
Status: ✅ Done | ⚠️ Partial | ❌ Blocked
Date: <date>
Files added/changed: <list>
Endpoints/Components: <list>
Notes: <anything the next session/step needs to know>
```

Before starting any step, first check whether an entry for it already exists — if it says "Partial" or "Blocked", read the notes before continuing.

---

## Recovery Protocol

If a fix/correction to something you built fails:

1. Try **one** more corrective attempt, targeted at the specific error.
2. If it fails again — **stop immediately**. Do not enter a loop of repeated corrections.
3. Report to the user: what was tried, what error still appears, and which part of `architecture.md` or `build-plan.md` may need re-examination (e.g. whether the design assumption was wrong, not the implementation).
4. Do not move on to the next step while the current one is in this state — log it as "❌ Blocked" in `progress-tracker.md`.

---

## Operating "Modes"

The agent explicitly identifies which mode it's in before acting:

- **Planning** — before any step with more than one module/component: think through and describe the approach first, don't write code right away.
- **Building** — implementing exactly one step of `build-plan.md`, following the patterns/invariants in `architecture.md`.
- **Reviewing** — before a step is declared "done": check that the happy path works, role restrictions (ADMIN vs EMPLOYEE), that Swagger decorators exist, and that no invariant is violated.
- **Recovering** — see Recovery Protocol above.

---

## Specifically for the Backend/Frontend Boundary

- No frontend step (9+) starts before the backend is fully completed and verified — that means through **Step 8b**, not Step 8: the manual sweep (8), the service unit tests (8a) **and** the full-stack tests against a real database (8b). The gate is 8b deliberately: tests written after a frontend already consumes the API arrive too late to change its shape, and a contract bug found then costs a rewrite on both sides instead of a fix on one. Exception: Step 0 (static mockups), which is built first of all.
- Every new service function tied to a specific user takes `userId` explicitly — never a silent filter (see architecture.md § Invariants).
- No component calls `fetch` directly — only via `frontend/src/api/`.

---

## When to Stop and Ask

- If any of the context files (spec/architecture/build-plan/progress-tracker) is missing or out of date relative to the code.
- If a prompt asks to bypass the "one step at a time" rule.
- If a second corrective attempt fails (see Recovery Protocol).
- If something in the build-plan contradicts an invariant in architecture.md.
