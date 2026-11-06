export function siteClock(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

/** Convert the selected site's clock, not the phone's timezone, to UTC. */
export function siteArrival(
  date: string,
  time: string,
  timezone: string,
  reference = new Date(),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Enter a valid delivery time.");
  const desired = Date.parse(`${date}T${time}:00Z`);
  const wall = (instant: Date) => {
    const clock = siteClock(instant, timezone);
    return Date.parse(`${clock.date}T${clock.time}:00Z`);
  };
  // Prefer the current offset during the repeated hour at the end of DST.
  const minute = Math.floor(reference.getTime() / 60_000) * 60_000;
  let result = desired - (wall(new Date(minute)) - minute);
  for (let attempt = 0; attempt < 3; attempt++) {
    const delta = wall(new Date(result)) - desired;
    if (!delta) return new Date(result).toISOString();
    result -= delta;
  }
  throw new Error(
    "This time does not exist at the site because the clocks changed. Choose another time.",
  );
}
