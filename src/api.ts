import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client as TemporalClient, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import express, { type NextFunction, type Request, type Response } from "express";
import { cacheState, clients, db, messageForToken, messages, openingRows, saveOpening } from "./db";
import { matchClients, salonParts, SALON_TIMEZONE } from "./matching";
import { SERVICES, STYLISTS, type ActionResult, type Client, type OpeningInput, type OpeningState, type OpeningView, type RespondInput, type StaffCommand } from "./types";
import { openingWorkflow } from "./workflows";

const app = express();
app.use(express.json({ limit: "32kb" }));
let clientPromise: Promise<TemporalClient> | undefined;
function getClient(): Promise<TemporalClient> {
  clientPromise ??= Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233", connectTimeout: "3 seconds" })
    .then((connection) => new TemporalClient({ connection, namespace: "default" }))
    .catch((error) => { clientPromise = undefined; throw error; });
  return clientPromise;
}
const workflowId = (id: string) => `juniper-${id}`;
function initialState(input: OpeningInput): OpeningState {
  return { input, phase: "searching", offers: [], remaining: input.candidates, updatedAt: input.createdAt };
}
async function view(row: ReturnType<typeof openingRows>[number]): Promise<OpeningView> {
  const offerUrls = Object.fromEntries(messages().filter((m) => m.openingId === row.input.id && m.delivered)
    .map((m) => [m.offerId, `/offer/${m.token}`]));
  try {
    const client = await getClient();
    const handle = client.workflow.getHandle(workflowId(row.input.id));
    const state = await client.connection.withDeadline(Date.now() + 2200, () => handle.query<OpeningState>("getOpening"));
    cacheState(state);
    return { state, systemStatus: "ok", offerUrls };
  } catch {
    try {
      const client = await getClient();
      const description = await client.connection.withDeadline(Date.now() + 1500,
        () => client.workflow.getHandle(workflowId(row.input.id)).describe());
      if (["FAILED", "TERMINATED", "TIMED_OUT"].includes(description.status.name)) {
        return { state: row.cached ?? initialState(row.input), systemStatus: "failed", offerUrls,
          systemMessage: "This process has stopped unexpectedly. Staff attention is needed; no booking can be confirmed here." };
      }
    } catch { /* The service or worker may be temporarily unavailable. */ }
    return { state: row.cached ?? initialState(row.input), systemStatus: row.cached ? "recovering" : "starting", offerUrls,
      systemMessage: "Live updates are temporarily unavailable. Showing the last known status; booking changes need confirmation." };
  }
}
function httpError(code: number, message: string): never {
  throw Object.assign(new Error(message), { status: code });
}
function startsAtForTime(time: unknown): number {
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) httpError(400, "Choose a valid appointment time.");
  const date = salonParts(Date.now()).date;
  const guess = Date.parse(`${date}T${time}:00Z`);
  // Derive the salon offset, rather than assuming the API host's timezone.
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: SALON_TIMEZONE, timeZoneName: "shortOffset" })
    .formatToParts(guess).find((part) => part.type === "timeZoneName")!.value;
  const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const minutes = match ? (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1) : 0;
  const timestamp = guess - minutes * 60_000;
  if (timestamp <= Date.now()) httpError(400, "Choose a time later today. Outreach stops when the appointment starts.");
  if (salonParts(timestamp).date !== date) httpError(400, "This prototype supports same-day openings.");
  return timestamp;
}

app.get("/api/config", (_req, res) => res.json({ services: SERVICES, stylists: STYLISTS, timezone: SALON_TIMEZONE, today: salonParts(Date.now()).date, now: Date.now() }));
app.get("/api/waitlist", (_req, res) => res.json(clients()));
app.post("/api/waitlist", (req, res) => {
  const { name, mobile, service, stylist, availability, days, consent } = req.body;
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) httpError(400, "Enter the client's name.");
  if (typeof mobile !== "string" || !/^\+?[\d\s().-]{7,25}$/.test(mobile)) httpError(400, "Enter a valid mobile number.");
  if (!SERVICES.includes(service) || !(STYLISTS.includes(stylist) || stylist === "Anyone")) httpError(400, "Choose a service and stylist preference.");
  if (!["Morning", "Afternoon", "Any time"].includes(availability) || !Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) httpError(400, "Choose availability and at least one day.");
  if (consent !== true) httpError(400, "Confirm the client has agreed to receive appointment offers.");
  const item: Client = { id: randomUUID(), name: name.trim(), mobile: mobile.trim(), service, stylist, availability, days: [...new Set<number>(days)], joinedAt: new Date().toISOString() };
  db.prepare("INSERT INTO clients VALUES (?, ?)").run(item.id, JSON.stringify(item));
  res.status(201).json(item);
});
app.get("/api/openings", async (_req, res) => {
  const today = salonParts(Date.now()).date;
  res.json(await Promise.all(openingRows().filter((row) => salonParts(row.input.startsAt).date === today).map(view)));
});
app.post("/api/openings", async (req, res) => {
  const { service, stylist, time, demo, simulateDeliveryFailure, requestId } = req.body;
  if (!SERVICES.includes(service) || !STYLISTS.includes(stylist)) httpError(400, "Choose a service and stylist.");
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{10,80}$/.test(requestId)) httpError(400, "A request ID is required.");
  const old = openingRows().find((row) => row.input.id === requestId);
  const startsAt = old?.input.startsAt ?? startsAtForTime(time);
  const input: OpeningInput = old?.input ?? {
    id: requestId, service, stylist, startsAt, createdAt: Date.now(), responseWindowMs: demo === true ? 30_000 : 15 * 60_000,
    demo: demo === true, simulateDeliveryFailure: simulateDeliveryFailure === true,
    candidates: matchClients(clients(), service, stylist, startsAt),
  };
  const client = await getClient();
  // Persist the directory first; the request ID lets a retry recover safely if
  // the API dies between starting the Workflow and replying to the browser.
  saveOpening(input);
  try {
    await client.workflow.start(openingWorkflow, { workflowId: workflowId(input.id), taskQueue: "juniper-salon", args: [input] });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
  }
  res.status(old ? 200 : 201).json(await view({ input, cached: old?.cached }));
});
app.post("/api/openings/:id/actions", async (req, res) => {
  const row = openingRows().find((row) => row.input.id === req.params.id);
  if (!row) httpError(404, "Opening not found.");
  const { action, requestId, offerId } = req.body;
  if (!["cancel_offer", "cancel_opening", "reopen", "retry_delivery"].includes(action) || typeof requestId !== "string" || requestId.length > 100 || (offerId !== undefined && typeof offerId !== "string")) httpError(400, "Invalid staff action.");
  const client = await getClient();
  const result = await client.connection.withDeadline(Date.now() + 6000, () =>
    client.workflow.getHandle(workflowId(row.input.id)).executeUpdate<ActionResult, [StaffCommand]>("manageOpening", { args: [{ action, requestId, offerId }], updateId: requestId }));
  res.status(result.ok ? 200 : 409).json(result);
});
app.get("/api/messages", (_req, res) => {
  const today = salonParts(Date.now()).date;
  res.json(messages().filter((m) => salonParts(m.startsAt).date === today).map((m) => ({ ...m, url: `/offer/${m.token}` })));
});
app.get("/api/offers/:token", async (req, res) => {
  const message = messageForToken(req.params.token);
  if (!message || !message.delivered) httpError(404, "We couldn't find this offer. Please contact Juniper Salon.");
  const row = openingRows().find((row) => row.input.id === message.openingId);
  if (!row) httpError(404, "This offer is no longer available.");
  const status = await view(row);
  const offer = status.state.offers.find((o) => o.id === message.offerId);
  // Client payload contains only the specific offer. Never leak other clients,
  // their phone numbers, tokens, or staff controls through this endpoint.
  res.json({ name: message.name, service: message.service, stylist: message.stylist, startsAt: message.startsAt,
    deadline: offer?.deadline, status: offer?.status ?? "sending", phase: status.state.phase,
    available: status.systemStatus === "ok", demo: row.input.demo });
});
app.post("/api/offers/:token/respond", async (req, res) => {
  const message = messageForToken(req.params.token);
  if (!message || !message.delivered) httpError(404, "Offer not found.");
  const { answer } = req.body;
  if (!["accept", "decline"].includes(answer)) httpError(400, "Choose accept or decline.");
  const client = await getClient();
  const handle = client.workflow.getHandle(workflowId(message.openingId));
  const description = await client.connection.withDeadline(Date.now() + 2000, () => handle.describe());
  if (description.status.name !== "RUNNING") {
    const status = await client.connection.withDeadline(Date.now() + 2200, () => handle.query<OpeningState>("getOpening"));
    const offer = status.offers.find((o) => o.id === message.offerId);
    const same = (offer?.status === "accepted" && status.phase === "filled" && answer === "accept") || (offer?.status === "declined" && answer === "decline");
    res.status(same ? 200 : 409).json({ ok: same, message: same ? "Your response has already been received." : "This opening is no longer available. Your offer has expired or been closed." });
    return;
  }
  // Re-evaluate repeated responses in the Workflow: an acceptance from a client
  // who subsequently withdrew must not appear valid after staff reopens it.
  const result = await client.connection.withDeadline(Date.now() + 6000, () => handle.executeUpdate<ActionResult, [RespondInput]>("respondToOffer", { args: [{ offerId: message.offerId, answer }] }));
  res.status(result.ok ? 200 : 409).json(result);
});

app.use("/api", (_req, res) => res.status(404).json({ error: "That endpoint does not exist." }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (error as { status?: number }).status;
  if (status) { res.status(status).json({ error: (error as Error).message }); return; }
  console.error(error);
  res.status(503).json({ error: "We couldn't confirm that change yet. Check the current status before trying again." });
});
async function start() {
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ configFile: path.join(process.cwd(), "vite.config.mts"), server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, "127.0.0.1", () => console.log(`Juniper Salon is ready at http://localhost:${port}`));
}
start().catch((error) => { console.error(error); process.exit(1); });
