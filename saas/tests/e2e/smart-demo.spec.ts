import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DemoState } from "../../src/lib/demo/engine";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);
function monitor(page: Page) {
  const apiRequests: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (/^\/api(?:\/|$)/.test(new URL(r.url()).pathname))
      apiRequests.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return { apiRequests, errors };
}
async function savedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("djcu-fictional-browser-demo", 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const state = await new Promise<DemoState>((resolve, reject) => {
        const r = db.transaction("demo").objectStore("demo").get("state");
        r.onsuccess = () => resolve(r.result as DemoState);
        r.onerror = () => reject(r.error);
      });
      return {
        deliveries: state.deliveries,
        materials: state.materials,
        audit: state.audit,
      };
    } finally {
      db.close();
    }
  });
}
const selector = (p: Page) =>
  p.getByRole("combobox", { name: "Item / material / activity", exact: true });
const rows = (p: Page) =>
  p
    .getByRole("table", { name: "Saved delivery records", exact: true })
    .locator("tbody tr");
async function entry(p: Page, profile = "olamilekan") {
  await p.goto(`/demo/delivery/${profile}`);
  await expect(
    p.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await expect(selector(p)).toBeEnabled();
}
async function choose(p: Page, query: string, name: string) {
  await selector(p).fill(query);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await p
    .getByRole("option")
    .filter({
      has: p.locator("span").filter({
        hasText: new RegExp(`^${escaped.split(/\s+/).join("\\s+")}$`),
      }),
    })
    .click();
}
async function classification(p: Page, category: string, type: string) {
  await expect(
    p.locator('dl[aria-label="Automatic classification"] dd'),
  ).toHaveText([category, type]);
}
async function attach(p: Page) {
  await p.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "sample-ticket.png",
    mimeType: "image/png",
    buffer: png,
  });
}
async function save(p: Page, duplicate = false) {
  const b = p.getByRole("button", { name: "Save Delivery", exact: true });
  if (duplicate)
    await b.evaluate((e) => {
      (e as HTMLButtonElement).click();
      (e as HTMLButtonElement).click();
    });
  else await b.click();
  await expect(p.getByLabel("Delivery image", { exact: true })).toHaveValue("");
  await expect(p.getByRole("status")).toContainText("Delivery saved");
  await expect(
    p.getByLabel("Supplier / Company name", { exact: true }),
  ).toHaveValue("");
}
async function summary(p: Page, totals: [number, number, number, number]) {
  const region = p.getByRole("region", {
    name: "Delivery summaries",
    exact: true,
  });
  const names = [
    "Total arrivals",
    "Material deliveries",
    "Service visits",
    "Pending classifications",
  ];
  for (const [i, name] of names.entries())
    await expect(
      region.getByRole("button", {
        name: `${name}: ${totals[i]}`,
        exact: true,
      }),
    ).toHaveCount(1);
}
async function noOverflow(p: Page) {
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}

test("smart search derives categories; quick choices need confirmation and repeated arrivals use actual save timestamps", async ({
  page,
}, info) => {
  const observed = monitor(page);
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await entry(page);
  const baseline = await savedState(page);
  expect(baseline.deliveries).toHaveLength(30);
  const quick = page.getByRole("region", { name: "Quick Record", exact: true });
  for (const name of [
    "6F5",
    "Type 1",
    "Sand",
    "10mm shingles",
    "20mm shingles",
    "Concrete",
  ])
    await expect(
      quick.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await quick.getByRole("button", { name: "6F5", exact: true }).click();
  await classification(page, "Aggregates", "Delivery");
  expect((await savedState(page)).deliveries).toHaveLength(30);
  for (const [query, name, category, type] of [
    ["type1", "Type 1", "Aggregates", "Delivery"],
    ["wood", "Timber", "Timber", "Delivery"],
    ["sweeper", "Road sweeper", "Site services", "Service visit"],
    ["toilet servicing", "Toilet servicing", "Site services", "Service visit"],
    ["10 mm", "10mm shingles", "Aggregates", "Delivery"],
  ]) {
    await choose(page, query, name);
    await classification(page, category, type);
  }
  await expect(page.getByLabel(/^Delivery time/)).toHaveCount(0);
  await expect(
    page.getByLabel("Supplier / Company name", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await expect(
    page.getByLabel(/tonnage|quantity|litres|cost|price/i),
  ).toHaveCount(0);
  await quick.getByRole("button", { name: "6F5", exact: true }).click();
  await page.clock.fastForward(7 * 60 * 1000);
  const before = await page.evaluate(() => Date.now());
  await attach(page);
  await save(page, true);
  const after = await page.evaluate(() => Date.now());
  const once = await savedState(page);
  const added = once.deliveries.filter(
    (r) => !baseline.deliveries.some((b) => b.id === r.id),
  );
  expect(added).toHaveLength(1);
  expect(Date.parse(added[0].recorded_at!)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(added[0].recorded_at!)).toBeLessThanOrEqual(after);
  expect(added[0]).toMatchObject({
    arrival_at: added[0].recorded_at,
    item_name: "6F5",
    marshal_name: "Olamilekan Alaga",
    supplier_name: "",
    status: "Submitted",
  });
  expect(added[0].evidence).toHaveLength(1);
  await expect(selector(page)).toHaveValue("6F5");
  await page.clock.fastForward(60_000);
  await attach(page);
  await save(page, true);
  const twice = (await savedState(page)).deliveries.filter(
    (r) => !baseline.deliveries.some((b) => b.id === r.id),
  );
  expect(twice).toHaveLength(2);
  expect(new Set(twice.map((r) => r.id)).size).toBe(2);
  expect(new Set(twice.map((r) => r.material_id)).size).toBe(1);
  await page.reload();
  await expect(selector(page)).toBeEnabled();
  expect((await savedState(page)).deliveries).toHaveLength(32);
  if (info.project.name === "demo-mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("smart-entry.png"),
    fullPage: true,
  });
  expect(observed).toEqual({ apiRequests: [], errors: [] });
});

test("unknown names deduplicate pending items and remain intact after supervisor approval and refresh", async ({
  page,
  context,
}, info) => {
  const observed = monitor(page);
  await entry(page);
  const suffix = randomUUID().slice(0, 8),
    raw = `Trial  Gate Pump ${suffix}`,
    variant = raw.toLowerCase().replace(/\s+/g, " ");
  for (const name of [raw, variant]) {
    await selector(page).fill(name);
    await page
      .getByRole("option", { name: "Other — Enter new item", exact: true })
      .click();
    await page.getByLabel("New item name", { exact: true }).fill(name);
    await classification(page, "Pending classification", "Pending review");
    await attach(page);
    await save(page);
  }
  const pending = await savedState(page),
    added = pending.deliveries.filter((r) => r.item_name?.includes(suffix));
  expect(added).toHaveLength(2);
  expect(added.map((r) => r.item_name).sort()).toEqual([raw, variant].sort());
  expect(new Set(added.map((r) => r.material_id)).size).toBe(1);
  const candidates = pending.materials.filter((i) => i.name.includes(suffix));
  expect(candidates).toHaveLength(1);
  expect(candidates[0].approval_status).toBe("Pending");
  await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
  await page.goto("/demo/supervisor");
  await expect(rows(page)).toHaveCount(32);
  await summary(page, [32, 24, 0, 8]);
  const form = page.getByRole("form", {
    name: new RegExp(`^Classify .*${suffix}$`),
  });
  await expect(form).toContainText("2 arrivals");
  await form
    .getByRole("combobox", { name: /^Category for / })
    .selectOption({ label: "Site services" });
  await form
    .getByRole("combobox", { name: /^Entry type for / })
    .selectOption({ label: "Service visit" });
  await form.getByRole("button", { name: /^Approve / }).click();
  await expect(form).toHaveCount(0);
  await summary(page, [32, 24, 2, 6]);
  await page.getByText("Arrival breakdown", { exact: true }).click();
  const approvedServices = page
    .getByRole("table", {
      name: "Service visits by type",
      exact: true,
    })
    .locator("tbody tr");
  await expect(approvedServices).toHaveCount(1);
  await expect(approvedServices.locator("td:nth-child(2)")).toHaveText("2");
  const approved = await savedState(page);
  expect(
    approved.materials.find((i) => i.id === candidates[0].id),
  ).toMatchObject({
    category: "Site services",
    entry_type: "Service visit",
    approval_status: "Approved",
  });
  for (const r of added) {
    const after = approved.deliveries.find((i) => i.id === r.id)!;
    expect({
      name: after.item_name,
      created: after.created_at,
      recorded: after.recorded_at,
      status: after.status,
    }).toEqual({
      name: r.item_name,
      created: r.created_at,
      recorded: r.recorded_at,
      status: r.status,
    });
  }
  expect(
    approved.audit.some((e) => e.action === "catalogue.item.approved"),
  ).toBe(true);
  await page.reload();
  await summary(page, [32, 24, 2, 6]);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("smart-classified-records.png"),
    fullPage: true,
  });
  await entry(page, "b");
  await choose(page, suffix, raw.replace(/\s+/g, " "));
  await classification(page, "Site services", "Service visit");
  await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
  expect(
    (await context.cookies()).some((c) => c.name === "delivery_session"),
  ).toBe(false);
  expect(observed).toEqual({ apiRequests: [], errors: [] });
});

test("supervisor filters and breakdowns reconcile deliveries, services and pending arrivals and exports visible rows", async ({
  page,
}, info) => {
  const observed = monitor(page);
  await entry(page);
  const suffix = randomUUID().slice(0, 8);
  for (const name of ["Road sweeper", "Toilet servicing", "Timber"]) {
    await choose(page, name, name);
    await page
      .getByLabel("Supplier / Company name", { exact: true })
      .fill(`Sample ${name} ${suffix}`);
    await attach(page);
    await save(page);
  }
  await page.goto("/demo/supervisor");
  const tableRows = rows(page);
  await expect(tableRows).toHaveCount(33);
  await summary(page, [33, 25, 2, 6]);
  await page.getByText("More filters", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Site services" });
  await expect(tableRows).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Entry type", exact: true })
    .selectOption({ label: "Service visit" });
  await page
    .getByRole("combobox", { name: "Recorded by", exact: true })
    .selectOption({ label: "Olamilekan Alaga" });
  await page
    .getByRole("combobox", { name: "Classification", exact: true })
    .selectOption({ label: "Approved" });
  await expect(tableRows).toHaveCount(2);
  await expect(tableRows.filter({ hasText: suffix })).toHaveCount(2);
  await summary(page, [33, 25, 2, 6]);
  const ready = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await ready;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Recorded at ISO");
  expect(csv.split(/\r?\n/)).toHaveLength(3);
  expect(csv).toContain("Road sweeper");
  expect(csv).toContain("Toilet servicing");
  expect(csv).not.toContain("Timber");
  await tableRows
    .filter({ hasText: "Road sweeper" })
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await expect(page.getByRole("dialog")).toContainText(
    "Physical receipt has not been established",
  );
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(tableRows).toHaveCount(33);
  await page
    .getByRole("combobox", { name: "Classification", exact: true })
    .selectOption({ label: "Pending classification" });
  await expect(tableRows).toHaveCount(6);
  await expect(tableRows.first()).toContainText("G1");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Item", exact: true })
    .selectOption({ label: "Road sweeper" });
  await expect(tableRows).toHaveCount(1);
  await expect(tableRows.first()).toContainText(
    `Sample Road sweeper ${suffix}`,
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByText("Arrival breakdown", { exact: true }).click();
  for (const [table, name, total] of [
    ["Service visits by type", "Road sweeper", "1"],
    ["Arrivals by category", "Site services", "2"],
    ["Records by traffic marshal", "Olamilekan Alaga", "13"],
    ["Records by traffic marshal", "Bemigho Estano", "20"],
  ])
    await expect(
      page
        .getByRole("table", { name: table, exact: true })
        .getByRole("row")
        .filter({ hasText: name }),
    ).toContainText(total);
  if (info.project.name === "demo-mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("smart-supervisor-breakdown.png"),
    fullPage: true,
  });
  expect(observed).toEqual({ apiRequests: [], errors: [] });
});
