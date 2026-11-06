import { test } from "node:test";
import assert from "node:assert/strict";
import { siteArrival, siteClock } from "../../src/lib/site-time";

test("delivery clock follows the site timezone rather than the phone timezone", () => {
  assert.deepEqual(
    siteClock(new Date("2026-07-10T23:30:00Z"), "Europe/London"),
    { date: "2026-07-11", time: "00:30" },
  );
  assert.equal(
    siteArrival(
      "2026-07-11",
      "00:30",
      "Europe/London",
      new Date("2026-07-10T23:30:00Z"),
    ),
    "2026-07-10T23:30:00.000Z",
  );
  assert.equal(
    siteArrival("2026-11-06", "10:30", "Asia/Kolkata"),
    "2026-11-06T05:00:00.000Z",
  );
});
test("clock conversion rejects the missing spring hour and follows the current offset for a repeated autumn hour", () => {
  assert.throws(
    () => siteArrival("2026-03-29", "01:30", "Europe/London"),
    /does not exist/,
  );
  assert.equal(
    siteArrival(
      "2026-10-25",
      "01:30",
      "Europe/London",
      new Date("2026-10-25T00:45:00Z"),
    ),
    "2026-10-25T00:30:00.000Z",
  );
  assert.equal(
    siteArrival(
      "2026-10-25",
      "01:30",
      "Europe/London",
      new Date("2026-10-25T01:45:00Z"),
    ),
    "2026-10-25T01:30:00.000Z",
  );
});
