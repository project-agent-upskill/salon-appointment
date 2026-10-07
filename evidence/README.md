# Prototype evidence

Captured from the running local application on October 7, 2026. All clients and phone numbers are fictional.

- `dashboard.jpg`: staff dashboard showing real Workflow-backed openings and status.
- `client-confirmation-mobile.jpg`: private client offer confirmation at a 390px viewport.
- `temporal-history.jpg`: completed Workflow `juniper-9b0dd8f5-5530-4d34-beb5-e8b55de4f53f`, showing the durable response timer, offer Activities, response Updates, reopening, and staff cancellation.

Validation completed:

- Backend and React TypeScript checks passed.
- Vite production build passed.
- 10 automated tests passed, including matching, message deduplication, offer timeout and acceptance, reopening, exhaustion, delivery failure, appointment cutoff, and replacing a Worker after a deadline passes.
- Live HTTP smoke test passed: 30-second expiry, rejecting late acceptance, repeated acceptance, reopening, rejecting a withdrawn link, and canceling the opening.
- Live delivery failure check passed: bounded retries paused outreach, and staff retry retained the same offer, token, and single message.
- Staff and client interfaces inspected at mobile width; no horizontal overflow.

Reproduce the presentation with the walkthrough in the root README. Evidence depicts sample state from verification; the ongoing application's current state may differ as its durable timers continue to run.
