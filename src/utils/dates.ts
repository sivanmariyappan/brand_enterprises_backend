// Dates are handled in IST, matching the Sequelize timezone.
const IST_OFFSET_MINUTES = 330;

function istParts(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function todayIso(date = new Date()) {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Financial year (April–March) start year, e.g. 2026 for Sep 2026 and for Feb 2027. */
export function financialYearStart(date = new Date()) {
  const { year, month } = istParts(date);
  return month >= 4 ? year : year - 1;
}

export function yearMonth(date = new Date()) {
  const { year, month } = istParts(date);
  return `${year}${String(month).padStart(2, "0")}`;
}

/** Inclusive IST day range → [start, end) Date objects for SQL filters. */
export function dayRange(from, to) {
  const start = from ? new Date(`${from}T00:00:00+05:30`) : null;
  const end = to ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000) : null;
  return { start, end };
}
