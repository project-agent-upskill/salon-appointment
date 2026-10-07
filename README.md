# Juniper Salon

A warm, phone-friendly appointment waitlist prototype. When staff enters a same-day cancellation, a real Temporal Workflow contacts matching clients one at a time, waits for a response, and moves on automatically. Clients accept or decline through a private link, without an account.

## One-command startup

Prerequisites: **Node.js 22.13 or newer**, npm, and **Docker Desktop installed and running**. Run this single line from the repository root:

```bash
npm ci && npm run dev
```

This installs the exact dependencies from `package-lock.json`, starts the local Temporal server, waits for it to become ready, and launches the Worker and Express API. The API also serves the React frontend through Vite. No separate terminals or manual database setup are needed; the fictional waitlist is seeded automatically.

- **Prototype:** [http://localhost:3000](http://localhost:3000)
- **Temporal Web UI:** [http://localhost:8233](http://localhost:8233)

Keep the terminal running. Click **Try a sample opening** in the prototype to start the 30-second demonstration. Normal openings use a 15-minute response window. Messages are simulated, and staff updates Square manually.

For later launches, when dependencies are already installed, use `npm run dev`.

### Stop and restart

Press **Ctrl+C** in the running terminal to stop the API and Worker. To also stop the Temporal container:

```bash
npm run stop
```

Both Temporal's Docker volume and `data/juniper.sqlite` persist across restarts. Start again with `npm run dev` to resume unfinished workflows.

### If startup fails

- **Docker connection error:** Open Docker Desktop, wait until its engine is running, then retry the startup command.
- **Port already in use:** Stop any previous instance of this prototype. It uses ports **3000** (app), **7233** (Temporal server), and **8233** (Temporal Web UI).
- **Unsupported Node version:** Check `node --version` and use Node.js 22.13 or newer. SQLite's experimental-feature notice on Node 22 is expected.

## Development commands

```bash
npm run typecheck     # Backend + React TypeScript
npm test              # Time-skipping Workflow tests; no Docker needed
npm run build         # Production frontend bundle
npm run test:smoke    # End-to-end API check against npm run dev (~30 seconds)
npm run stop          # Stop the Temporal container, retaining its data
```

For separate processes, run `npm run start:temporal`, `npm run dev:worker`, and `npm run dev:api`. The production frontend is served by `npm start` after `npm run build`; the Worker must run separately. The application listens on localhost. Staff access is intentionally account-free for this local demonstration; real deployment would require staff authentication and authorization.

## Present it to Lena

1. Click **Try a sample opening**. This creates a Haircut with Carla later today, with a clearly labeled 30-second response window.
2. See Maya receive the first offer. Open **Open client offer** or find the private link in **Demo inbox**.
3. Leave the offer unanswered. After 30 seconds, Maya is marked **Timed out** and Olivia receives the next offer automatically.
4. Open Olivia's offer and accept it. The client sees a confirmation and the staff dashboard shows **Filled**, with a reminder to update Square manually.
5. Return to Maya's original link. It is expired and cannot claim the opening.
6. If Olivia changes her mind, click **Reopen**. Her offer is marked withdrawn and Jules receives the next offer. Olivia's old link cannot reclaim it.

Use **Add opening** for the normal 15-minute window. Under **Prototype options**, simulate a delivery problem: the Activity tries three times, then outreach pauses at **Needs attention**. Staff can retry the same offer, skip that client, or cancel the opening. A retried simulated delivery succeeds so the recovery path can be demonstrated.

To show durability, run API and Worker separately, create an opening, stop only the Worker, and let its deadline pass. The API shows cached status with a reconnection notice and disables booking changes. Start the Worker again: it replays its history, marks the expired offer timed out, and offers the opening to the next client. The automated recovery test also stops one Worker and starts a replacement after a 15-minute deadline passes.

## Business rules

- Same-day appointments use **America/Los_Angeles** time, regardless of browser or API host timezone.
- Eligible clients match service, required stylist preference, available day, and available time. Morning is before noon; afternoon is noon onward. Services imply a suitable duration.
- Each opening snapshots eligible clients at creation, sorted by waitlist join time. New entries affect future openings.
- There is one current offer per opening. Its response window starts after successful simulated delivery and ends no later than the appointment start time.
- Acceptance fills the opening. The front desk updates Square; this prototype does not create a Square appointment.
- Decline, timeout, or staff cancellation of an offer advances to the next client. Canceling the entire opening stops outreach. In-flight Activity cancellation is requested; an already delivered message cannot be unsent, but its link becomes unavailable.
- A filled Workflow remains running until the appointment starts, so staff can reopen it and continue with the remaining clients. The withdrawing client is skipped.
- Exhausted candidates produce **Unfilled** with counts explaining declines, timeouts, cancellations, or withdrawals. No further outreach occurs. No matches and appointment-start cutoff have distinct explanations.
- After bounded delivery retries, staff intervention is required. Worker/service unavailability is shown separately from a Workflow that has actually failed or stopped.

## Architecture

**React + TypeScript + Vite + Tailwind** render staff and client interfaces. **Express** validates input and calls the Temporal Client. One **Temporal Workflow per opening** owns the authoritative queue, deadlines, status, and offer history. Durable timers drive expiry. Synchronous **Updates** validate and apply client responses and staff actions without an asynchronous gap between validation and mutation; **Queries** supply display state. The browser countdown only displays the server's deadline.

A **sendOffer Activity** is the simulated SMS adapter. SQLite persists the seeded waitlist, opening directory, message outbox, and private tokens. Each message is keyed by offer ID, preventing duplicates when the Activity retries. Cached Workflow snapshots are display-only and are clearly marked stale when live queries fail; they never authorize acceptance. Creation request IDs and staff Update IDs allow safe request retries.

Client links use 192-bit random tokens scoped to one offer. Client endpoints return only that offer's appointment details, deadline, and status, not other clients, phone numbers, candidate lists, or staff actions. A closed or superseded offer cannot claim an appointment.

The prototype uses fictional clients and simulated SMS. Google Sheets and Square are not integrated. Candidate queues are independent between openings; cross-opening client reservations and conflict checks against Square are outside this demonstration. These would be needed before running concurrent outreach against a real calendar.

## Code map

- `client/src/App.tsx` — staff dashboard, forms, waitlist, inbox, and client offer components
- `client/src/styles.css` — Tailwind theme and responsive Juniper styling
- `client/src/main.tsx` — React entry point and staff/client route selection
- `src/workflows.ts` — durable lifecycle, timers, Queries, and Updates
- `src/activities.ts` — idempotent simulated messaging adapter
- `src/api.ts` — validation, private offer endpoints, and frontend hosting
- `src/db.ts` — SQLite records and fictional seed clients
- `src/matching.ts` — eligibility and salon timezone handling
- `tests/` — lifecycle, replacement-Worker recovery, and matching tests
- `scripts/smoke.mjs` — HTTP integration check against a running prototype
- `evidence/` — screenshots and demonstration notes

## Assessment submission

Use a **brand-new public GitHub repository**, not a fork. Do not add `john-b-yang` or `vishakhpk` as collaborators; the assessment team can review a public repository without write access. Confirm GitHub shows **Public** and does not say “forked from.” Do not search for or view other participants' assessment repositories.

Official references: [TypeScript guide](https://docs.temporal.io/develop/typescript), [Workflow message passing](https://docs.temporal.io/encyclopedia/workflow-message-passing), and [durable timers](https://docs.temporal.io/develop/typescript/workflows/timers).
