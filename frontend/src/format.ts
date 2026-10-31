import type { Choice } from "./types";

const TIME_ZONE = "Europe/Rome";
const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const WEEKDAY_INDEX = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function atNoon(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 11, 0, 0));
}

export function weekdayIndex(iso: string) {
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: TIME_ZONE,
  }).format(atNoon(iso));
  const index = WEEKDAY_INDEX.indexOf(label);
  return index < 0 ? 0 : index;
}

export function longDate(iso: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(atNoon(iso));
}

export function formatPoints(points: number) {
  if (points > 0) return `+${points}`;
  return String(points);
}

export function choiceLabel(choice: Choice | null) {
  if (choice === "si") return "Sì";
  if (choice === "no") return "No";
  if (choice === "dimenticato") return "Dimenticato";
  return "Non segnato";
}

export function choiceTone(choice: Choice | null) {
  if (choice === "si") return "text-si";
  if (choice === "no") return "text-no";
  if (choice === "dimenticato") return "text-ember";
  return "text-mist";
}

export const WEEKDAY_LABELS = WEEKDAYS;
