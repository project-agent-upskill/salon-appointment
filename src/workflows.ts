import { CancellationScope, condition, defineQuery, defineUpdate, proxyActivities, setHandler } from "@temporalio/workflow";
import type { ActionResult, Offer, OpeningInput, OpeningState, RespondInput, StaffCommand } from "./types";
import type * as activities from "./activities";

const { sendOffer } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  retry: { initialInterval: "1 second", maximumInterval: "2 seconds", maximumAttempts: 3 },
});
export const getOpening = defineQuery<OpeningState>("getOpening");
export const respondToOffer = defineUpdate<ActionResult, [RespondInput]>("respondToOffer");
export const manageOpening = defineUpdate<ActionResult, [StaffCommand]>("manageOpening");

// One opening owns the durable outreach history. The browser and API process
// never decide whether a client can claim an appointment.
export async function openingWorkflow(input: OpeningInput): Promise<OpeningState> {
  const state: OpeningState = {
    input, phase: "searching", offers: [], remaining: [...input.candidates], updatedAt: Date.now(),
  };
  const commandResults: Record<string, ActionResult> = {};
  let failNextDelivery = input.simulateDeliveryFailure;
  let deliveryScope: CancellationScope | undefined;
  const touch = () => { state.updatedAt = Date.now(); };
  const current = () => state.offers.find((offer) => offer.id === state.currentOfferId);
  const unavailable = (): ActionResult => ({ ok: false, message: "This opening is no longer available. Your offer has expired or been closed." });
  const advance = (offer: Offer, status: Offer["status"]) => {
    offer.status = status; offer.respondedAt = Date.now();
    state.currentOfferId = undefined; state.phase = "searching"; state.reason = undefined; touch();
  };
  setHandler(getOpening, () => state);
  setHandler(respondToOffer, ({ offerId, answer }) => {
    const offer = state.offers.find((item) => item.id === offerId);
    if (offer?.status === "accepted" && state.phase === "filled" && answer === "accept") {
      return { ok: true, message: "You're booked! The Juniper team will update their calendar." };
    }
    if (offer?.status === "declined" && answer === "decline") {
      return { ok: true, message: "Thanks for letting us know. We'll offer this time to the next person." };
    }
    if (!offer || state.phase !== "waiting" || state.currentOfferId !== offerId ||
        offer.status !== "waiting" || Date.now() >= (offer.deadline ?? 0) || Date.now() >= input.startsAt) return unavailable();
    // No await between validation and mutation: racing responses cannot both win.
    if (answer === "accept") {
      offer.status = "accepted"; offer.respondedAt = Date.now(); state.phase = "filled";
      state.reason = undefined; touch();
      return { ok: true, message: "You're booked! The Juniper team will update their calendar." };
    }
    advance(offer, "declined");
    return { ok: true, message: "Thanks for letting us know. We'll offer this time to the next person." };
  });
  setHandler(manageOpening, (command) => {
    if (commandResults[command.requestId]) return commandResults[command.requestId];
    const offer = current();
    let result: ActionResult = { ok: false, message: "This action is no longer available. Refresh and try again." };
    if (Date.now() >= input.startsAt) return result;
    if (command.action === "cancel_opening" && !["canceled", "unfilled"].includes(state.phase)) {
      deliveryScope?.cancel();
      if (offer && ["sending", "waiting", "delivery_failed"].includes(offer.status)) {
        offer.status = "canceled"; offer.respondedAt = Date.now();
      } else if (offer?.status === "accepted") {
        offer.status = "withdrawn"; offer.respondedAt = Date.now();
      }
      state.phase = "canceled"; state.currentOfferId = undefined;
      state.reason = "Canceled by staff. All outreach has stopped.";
      result = { ok: true, message: "Opening canceled. All outreach has stopped." };
    } else if (command.action === "cancel_offer" && offer && offer.id === command.offerId &&
        ["waiting", "sending", "needs_attention"].includes(state.phase)) {
      deliveryScope?.cancel();
      advance(offer, "canceled");
      result = { ok: true, message: "Offer canceled. Moving to the next eligible client." };
    } else if (command.action === "reopen" && state.phase === "filled" && offer?.status === "accepted" && offer.id === command.offerId) {
      advance(offer, "withdrawn");
      result = { ok: true, message: "Opening reopened. Continuing with the next eligible client." };
    } else if (command.action === "retry_delivery" && state.phase === "needs_attention" && offer && offer.id === command.offerId) {
      offer.status = "sending"; state.phase = "sending"; state.reason = undefined; failNextDelivery = false;
      result = { ok: true, message: "Retrying delivery to the same client." };
    }
    touch(); commandResults[command.requestId] = result; return result;
  });
  while (true) {
    const phase = () => state.phase;
    if (["canceled", "unfilled"].includes(phase())) return state;
    if (Date.now() >= input.startsAt) {
      if (phase() !== "filled") {
        const offer = current();
        if (offer && ["sending", "waiting", "delivery_failed"].includes(offer.status)) {
          offer.status = "timed_out"; offer.respondedAt = Date.now();
        }
        state.phase = "unfilled"; state.currentOfferId = undefined;
        state.reason = "The appointment start time has passed. Outreach has stopped."; touch();
      }
      return state;
    }
    if (phase() === "filled" || phase() === "needs_attention") {
      const waitingPhase = phase();
      await condition(() => phase() !== waitingPhase, input.startsAt - Date.now()); continue;
    }
    if (phase() === "searching") {
      const candidate = state.remaining.shift();
      if (!candidate) {
        state.phase = "unfilled";
        state.reason = state.offers.length === 0 ? "No eligible clients match this opening." :
          "No candidates remain. " + [
            ["declined", "declined"], ["timed_out", "timed out"], ["canceled", "canceled by staff"], ["withdrawn", "withdrew"],
          ].map(([status, label]) => {
            const count = state.offers.filter((offer) => offer.status === status).length;
            return count ? `${count} ${label}` : "";
          }).filter(Boolean).join(", ") + ". Outreach has stopped.";
        touch(); continue;
      }
      const offer: Offer = { id: `${input.id}-offer-${state.offers.length + 1}`, client: candidate, status: "sending", createdAt: Date.now() };
      state.offers.push(offer); state.currentOfferId = offer.id; state.phase = "sending"; touch();
    }
    if (phase() === "sending") {
      const offer = current()!;
      const fail = failNextDelivery; failNextDelivery = false;
      const scope = new CancellationScope();
      deliveryScope = scope;
      try {
        await scope.run(() => sendOffer({ opening: input, offer, fail }));
        // Staff can act while an Activity runs. Never revive a canceled offer.
        if (phase() !== "sending" || state.currentOfferId !== offer.id || offer.status !== "sending") continue;
        if (Date.now() >= input.startsAt) continue;
        offer.status = "waiting"; offer.deadline = Math.min(Date.now() + input.responseWindowMs, input.startsAt);
        state.phase = "waiting"; touch();
      } catch {
        if (phase() !== "sending" || state.currentOfferId !== offer.id) continue;
        offer.status = "delivery_failed"; state.phase = "needs_attention";
        state.reason = `We couldn't deliver the offer to ${offer.client.name}. Retry or skip this client to continue.`;
        touch(); continue;
      } finally {
        if (deliveryScope === scope) deliveryScope = undefined;
      }
    }
    if (phase() === "waiting") {
      const offer = current()!;
      const changed = await condition(() => phase() !== "waiting" || state.currentOfferId !== offer.id,
        Math.max(1, offer.deadline! - Date.now()));
      if (!changed && phase() === "waiting" && state.currentOfferId === offer.id) advance(offer, "timed_out");
    }
  }
}
