const { HttpError } = require("./errors");

const MONTH = "2026-11";
const TIME_ZONE = "Europe/Rome";

function novemberDates() {
  const dates = [];
  for (let day = 1; day <= 30; day += 1) {
    dates.push(`${MONTH}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

function todayISO(now = new Date()) {
  // Honored only by the local server. Lambda never sets LOCAL_DEV.
  const override = process.env.TODAY_OVERRIDE;
  if (
    process.env.LOCAL_DEV === "true" &&
    typeof override === "string" &&
    novemberDates().includes(override)
  ) {
    return override;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function assertNovemberDate(date) {
  if (typeof date !== "string" || !novemberDates().includes(date)) {
    throw new HttpError(400, "Quel giorno è fuori da novembre 2026");
  }
}

module.exports = {
  MONTH,
  TIME_ZONE,
  novemberDates,
  todayISO,
  assertNovemberDate,
};
