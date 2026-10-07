import { randomBytes } from "node:crypto";
import { db } from "./db";
import type { Message, SendOfferInput } from "./types";

// The simulated SMS adapter uses offer ID as an idempotency key.
export async function sendOffer({ opening, offer, fail }: SendOfferInput): Promise<void> {
  const row = db.prepare("SELECT payload FROM messages WHERE offer_id = ?").get(offer.id) as { payload: string } | undefined;
  const existing: Message | undefined = row ? JSON.parse(row.payload) : undefined;
  if (existing?.delivered) return;
  const message: Message = {
    offerId: offer.id, openingId: opening.id, name: offer.client.name, mobile: offer.client.mobile,
    service: opening.service, stylist: opening.stylist, startsAt: opening.startsAt,
    createdAt: existing?.createdAt ?? Date.now(), token: existing?.token ?? randomBytes(24).toString("hex"), delivered: !fail,
  };
  db.prepare(`INSERT INTO messages (offer_id, opening_id, token, payload) VALUES (?, ?, ?, ?)
    ON CONFLICT(offer_id) DO UPDATE SET payload = excluded.payload`).run(offer.id, opening.id, message.token, JSON.stringify(message));
  if (fail) throw new Error("Simulated SMS delivery failure");
}
