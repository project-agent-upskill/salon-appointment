export const SERVICES = ["Haircut", "Cut & color", "Blowout"] as const;
export const STYLISTS = ["Carla", "Lena", "Sofia"] as const;
export type Service = (typeof SERVICES)[number];
export type Stylist = (typeof STYLISTS)[number];
export type Client = {
  id: string; name: string; mobile: string; service: Service; stylist: Stylist | "Anyone";
  availability: "Morning" | "Afternoon" | "Any time"; days: number[]; joinedAt: string;
};
export type OpeningInput = {
  id: string; service: Service; stylist: Stylist; startsAt: number; createdAt: number;
  responseWindowMs: number; demo: boolean; simulateDeliveryFailure: boolean; candidates: Client[];
};
export type OfferStatus = "sending" | "waiting" | "accepted" | "declined" | "timed_out" | "canceled" | "withdrawn" | "delivery_failed";
export type Offer = {
  id: string; client: Client; status: OfferStatus; createdAt: number; deadline?: number; respondedAt?: number;
};
export type OpeningPhase = "searching" | "sending" | "waiting" | "filled" | "needs_attention" | "unfilled" | "canceled";
export type OpeningState = {
  input: OpeningInput; phase: OpeningPhase; offers: Offer[]; currentOfferId?: string;
  remaining: Client[]; reason?: string; updatedAt: number;
};
export type ActionResult = { ok: boolean; message: string };
export type RespondInput = { offerId: string; answer: "accept" | "decline" };
export type StaffCommand = {
  action: "cancel_offer" | "cancel_opening" | "reopen" | "retry_delivery"; requestId: string; offerId?: string;
};
export type SendOfferInput = { opening: OpeningInput; offer: Offer; fail: boolean };
export type Message = {
  offerId: string; openingId: string; name: string; mobile: string; service: Service; stylist: Stylist;
  startsAt: number; createdAt: number; token: string; delivered: boolean;
};
export type OpeningView = {
  state: OpeningState; systemStatus: "ok" | "recovering" | "failed" | "starting";
  systemMessage?: string; offerUrls: Record<string, string>;
};
