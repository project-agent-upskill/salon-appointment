import type { Client, Service, Stylist } from "./types";
export const SALON_TIMEZONE = "America/Los_Angeles";
export function salonParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: SALON_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(timestamp);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}
export function matchClients(list: Client[], service: Service, stylist: Stylist, startsAt: number): Client[] {
  const { hour, day } = salonParts(startsAt);
  return list.filter((client) => client.service === service && (client.stylist === "Anyone" || client.stylist === stylist) &&
    client.days.includes(day) && (client.availability === "Any time" ||
      (client.availability === "Morning" ? hour < 12 : hour >= 12)))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}
