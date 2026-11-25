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
const categorySelector = (p: Page) =>
  p.getByRole("combobox", { name: "Category", exact: true });
async function pickCategory(p: Page, category: string) {
  if ((await categorySelector(p).inputValue()) !== category)
    await categorySelector(p).selectOption({ value: category });
}
const rows = (p: Page) =>
  p
    .getByRole("table", { name: "Saved delivery records", exact: true })
    .locator("tbody tr");
async function entry(p: Page, profile = "olamilekan") {
  await p.goto(`/demo/delivery/${profile}`);
  await expect(
    p.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await expect(categorySelector(p)).toBeEnabled();
  await expect(selector(p)).toBeDisabled();
  await expect(p.getByText("Quick Record", { exact: true })).toHaveCount(0);
}
const itemList = (p: Page) =>
  p.getByRole("listbox", { name: "Item / material / activity", exact: true });
function itemOption(p: Page, name: string) {
  return itemList(p).getByRole("option", { name, exact: true });
}
async function search(p: Page, query: string) {
  if ((await selector(p).getAttribute("aria-expanded")) !== "true")
    await selector(p).click();
  await p
    .getByRole("searchbox", { name: "Search items", exact: true })
    .fill(query);
}
async function choose(p: Page, query: string, name: string, category: string) {
  await pickCategory(p, category);
  await search(p, query);
  await itemOption(p, name).click();
}
async function manual(p: Page, name: string, category: string) {
  await pickCategory(p, category);
  await search(p, name);
  await itemOption(p, "Other — Enter new item").click();
  await p.getByLabel("New item name", { exact: true }).fill(name);
  await selectedCategory(p, category);
}
async function selectedCategory(p: Page, category: string) {
  await expect(categorySelector(p)).toHaveValue(category);
  await expect(p.getByText("Entry type", { exact: true })).toHaveCount(0);
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
async function summary(p: Page, totals: [number, number, number]) {
  const region = p.getByRole("region", {
    name: "Workspace summary",
    exact: true,
  });
  await expect(region.getByRole("group")).toHaveCount(3);
  for (const [index, name] of ["Arrivals", "Marshals", "To Classify"].entries())
    await expect(
      region.getByRole("group", {
        name: `${name}: ${totals[index]}`,
        exact: true,
      }),
    ).toBeVisible();
}
async function disclose(p: Page, name: string) {
  const toggle = p.getByText(name, { exact: true });
  if (
    !(await toggle.evaluate(
      (element) => (element.parentElement as HTMLDetailsElement).open,
    ))
  )
    await toggle.click();
}
async function noOverflow(p: Page) {
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}

test("category-first dropdown narrows items and repeated arrivals use actual save timestamps", async ({
  page,
}, info) => {
  const observed = monitor(page);
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await entry(page);
  const baseline = await savedState(page);
  expect(baseline.deliveries).toHaveLength(30);
  await expect(selector(page)).toHaveText("Choose a category first");
  await expect(selector(page)).toHaveJSProperty("tagName", "BUTTON");
  await expect(categorySelector(page)).toHaveValue("");
  await expect(categorySelector(page).locator("option")).toHaveText([
    "Choose a category",
    "Aggregates / Sands",
    "Other Materials",
    "Services",
  ]);
  await pickCategory(page, "Aggregates / Sands");
  await expect(selector(page)).toBeEnabled();
  await expect(selector(page)).toHaveText("Choose an item");
  await selector(page).click();
  await expect(selector(page)).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("searchbox", { name: "Search items", exact: true }),
  ).toBeVisible();
  const aggregateNames = [
    "6F5",
    "Type 1",
    "Sand",
    "10mm shingles",
    "20mm shingles",
  ];
  await expect(itemList(page).getByRole("option")).toHaveCount(6);
  expect(
    (await itemList(page).getByRole("option").allTextContents())
      .map((text) => text.trim())
      .sort(),
  ).toEqual([...aggregateNames, "Other — Enter new item"].sort());
  await expect(
    page.getByRole("searchbox", { name: "Search items", exact: true }),
  ).not.toBeFocused();
  await selector(page).press("Escape");
  await expect(selector(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await selector(page).click();
  await expect(itemList(page).getByRole("option")).toHaveCount(6);
  await page
    .getByRole("heading", { name: "New Delivery", exact: true })
    .click();
  await expect(selector(page)).toHaveAttribute("aria-expanded", "false");
  await selector(page).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("smart-dropdown-open.png"),
    fullPage: true,
  });
  // Only the selected category's items are offered, and normal selection needs no typing.
  await expect(itemOption(page, "Timber")).toHaveCount(0);
  await expect(itemOption(page, "Concrete")).toHaveCount(0);
  await expect(itemOption(page, "Cement")).toHaveCount(0);
  await itemOption(page, "6F5").click();
  await expect(selector(page)).toHaveText("6F5");
  await expect(selector(page)).toHaveAttribute("aria-expanded", "false");
  await selectedCategory(page, "Aggregates / Sands");
  const categoryBox = (await categorySelector(page).boundingBox())!;
  const triggerBox = (await selector(page).boundingBox())!;
  expect(categoryBox.y + categoryBox.height).toBeLessThanOrEqual(triggerBox.y);
  expect(Math.abs(categoryBox.width - triggerBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(categoryBox.x - triggerBox.x)).toBeLessThanOrEqual(2);
  await page.screenshot({
    path: info.outputPath("smart-selected-category.png"),
    fullPage: true,
  });
  await pickCategory(page, "Services");
  await expect(selector(page)).toHaveText("Choose an item");
  await expect(
    page.locator('dl[aria-label="Automatic classification"]'),
  ).toHaveCount(0);
  await selector(page).click();
  await expect(itemOption(page, "6F5")).toHaveCount(0);
  await expect(itemOption(page, "Road sweeper")).toHaveCount(0);
  await expect(itemOption(page, "Toilet servicing")).toHaveCount(0);
  expect(
    (await itemList(page).getByRole("option").allTextContents())
      .map((text) => text.trim())
      .sort(),
  ).toEqual(["Fuel", "Toilets", "Welfare", "Other — Enter new item"].sort());
  await itemOption(page, "Fuel").click();
  await selectedCategory(page, "Services");
  expect((await savedState(page)).deliveries).toHaveLength(30);
  for (const [query, name, category] of [
    ["type1", "Type 1", "Aggregates / Sands"],
    ["pipes", "Pipes", "Other Materials"],
    ["cables", "Cables", "Other Materials"],
    ["toilets", "Toilets", "Services"],
    ["welfare", "Welfare", "Services"],
    ["10 mm", "10mm shingles", "Aggregates / Sands"],
  ]) {
    await choose(page, query, name, category);
    await selectedCategory(page, category);
  }
  await expect(page.getByLabel(/^Delivery time/)).toHaveCount(0);
  await expect(
    page.getByLabel("Supplier / Company name", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await expect(
    page.getByLabel(/tonnage|quantity|litres|cost|price/i),
  ).toHaveCount(0);
  await choose(page, "6F5", "6F5", "Aggregates / Sands");
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
    entry_type: "Delivery",
    status: "Submitted",
  });
  expect(added[0].evidence).toHaveLength(1);
  await expect(selector(page)).toHaveText("6F5");
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
  await expect(categorySelector(page)).toBeEnabled();
  await expect(selector(page)).toBeDisabled();
  expect((await savedState(page)).deliveries).toHaveLength(32);

  // A prepared immutable retry must recover its category before its controls lock.
  const timber = baseline.materials.find((item) => item.name === "Timber")!;
  const recoveredId = randomUUID();
  const source = added[0];
  await page.evaluate(
    async ({ record, materialId, id, bytes, photoId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open("djcu-simple-demo-drafts", 1);
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      try {
        const stamp = new Date().toISOString();
        const key = `${record.company_id}:${record.created_by}:${record.site_id}:${record.marshal_id}`;
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").put({
            key,
            input: {
              id,
              site_id: record.site_id,
              material_id: materialId,
              marshal_id: record.marshal_id,
              supplier_name: "Sample recovered Timber arrival",
              arrival_at: stamp,
              recorded_at: stamp,
              capture_kind: "arrival",
              intent: "draft",
            },
            photoId,
            photo: new File([new Uint8Array(bytes)], "recovered-ticket.png", {
              type: "image/png",
            }),
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
    {
      record: source,
      materialId: timber.id,
      id: recoveredId,
      bytes: Array.from(png),
      photoId: randomUUID(),
    },
  );
  await page.reload();
  await expect(categorySelector(page)).toHaveValue("Other Materials");
  await expect(categorySelector(page)).toBeDisabled();
  await expect(selector(page)).toHaveText("Timber");
  await expect(selector(page)).toBeDisabled();
  await selectedCategory(page, "Other Materials");
  await save(page, true);
  const recovered = (await savedState(page)).deliveries.filter(
    (record) => record.id === recoveredId,
  );
  expect(recovered).toHaveLength(1);
  expect(recovered[0]).toMatchObject({
    material_id: timber.id,
    item_name: "Timber",
    entry_type: "Delivery",
    status: "Submitted",
  });
  await expect(categorySelector(page)).toBeEnabled();
  await expect(selector(page)).toBeEnabled();
  expect((await savedState(page)).deliveries).toHaveLength(33);

  // A removed default can still be entered manually without duplicating its
  // historical catalogue row, then stays selectable after the next refresh.
  const cement = baseline.materials.find((item) => item.name === "Cement")!;
  await manual(page, "Cement", "Aggregates / Sands");
  await attach(page);
  await save(page);
  const reactivated = await savedState(page);
  expect(reactivated.deliveries).toHaveLength(34);
  expect(reactivated.materials).toHaveLength(baseline.materials.length);
  expect(
    reactivated.materials.find((item) => item.id === cement.id),
  ).toMatchObject({ name: "Cement", capture_hidden: false });
  expect(
    reactivated.deliveries.filter((record) => record.material_id === cement.id),
  ).toHaveLength(1);
  await page.reload();
  await expect(categorySelector(page)).toBeEnabled();
  await choose(page, "cement", "Cement", "Aggregates / Sands");
  expect(
    (await savedState(page)).materials.find((item) => item.id === cement.id),
  ).toMatchObject({ capture_hidden: false });
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
    await manual(page, name, "Other Materials");
    await attach(page);
    await save(page);
  }
  const pending = await savedState(page),
    added = pending.deliveries.filter((r) => r.item_name?.includes(suffix));
  expect(added).toHaveLength(2);
  expect(added.map((r) => r.item_name).sort()).toEqual([raw, variant].sort());
  expect(added.every((record) => record.entry_type === "Pending review")).toBe(
    true,
  );
  expect(
    added.every(
      (record) =>
        record.category === "Other Materials" &&
        record.selected_category === "Other Materials",
    ),
  ).toBe(true);
  expect(new Set(added.map((r) => r.material_id)).size).toBe(1);
  const candidates = pending.materials.filter((i) => i.name.includes(suffix));
  expect(candidates).toHaveLength(1);
  expect(candidates[0].approval_status).toBe("Pending");
  await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
  await page.goto("/demo/supervisor");
  await expect(rows(page)).toHaveCount(32);
  await summary(page, [32, 2, 2]);
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  const form = page.getByRole("form", {
    name: new RegExp(`^Classify .*${suffix}$`),
  });
  await expect(form).toContainText("2 arrivals");
  expect((await form.locator("li").allTextContents()).sort()).toEqual(
    [raw, variant].sort(),
  );
  await form
    .getByRole("combobox", { name: /^Category for / })
    .selectOption({ label: "Services" });
  await form
    .getByRole("combobox", { name: /^Entry type for / })
    .selectOption({ label: "Service visit" });
  await form.getByRole("button", { name: /^Approve / }).click();
  await expect(form).toHaveCount(0);
  await summary(page, [32, 2, 1]);
  await page.getByRole("tab", { name: "Records", exact: true }).click();
  await expect(
    page.getByText("Arrival breakdown", { exact: true }),
  ).toHaveCount(0);
  await disclose(page, "More filters");
  await page
    .getByRole("combobox", { name: "Entry type", exact: true })
    .selectOption({ label: "Service visit" });
  await expect(rows(page)).toHaveCount(2);
  await summary(page, [2, 1, 0]);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await summary(page, [32, 2, 1]);
  const approved = await savedState(page);
  expect(
    approved.materials.find((i) => i.id === candidates[0].id),
  ).toMatchObject({
    category: "Services",
    entry_type: "Service visit",
    approval_status: "Approved",
  });
  for (const r of added) {
    const after = approved.deliveries.find((i) => i.id === r.id)!;
    expect(after).toEqual(r);
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
  await summary(page, [32, 2, 1]);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("smart-classified-records.png"),
    fullPage: true,
  });
  await entry(page, "b");
  await choose(page, suffix, raw.replace(/\s+/g, " "), "Services");
  await selectedCategory(page, "Services");
  await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
  expect(
    (await context.cookies()).some((c) => c.name === "delivery_session"),
  ).toBe(false);
  expect(observed).toEqual({ apiRequests: [], errors: [] });
});

test("supervisor filters and workload reconcile deliveries, services and pending arrivals and export visible rows", async ({
  page,
}, info) => {
  const observed = monitor(page);
  await entry(page);
  const suffix = randomUUID().slice(0, 8);
  for (const [name, category] of [
    ["Road sweeper", "Services"],
    ["Toilet servicing", "Services"],
    ["Timber", "Other Materials"],
  ]) {
    await manual(page, name, category);
    await page
      .getByLabel("Supplier / Company name", { exact: true })
      .fill(`Sample ${name} ${suffix}`);
    await attach(page);
    await save(page);
  }
  await page.goto("/demo/supervisor");
  const tableRows = rows(page);
  await expect(tableRows).toHaveCount(33);
  await summary(page, [33, 2, 1]);
  await page.getByText("More filters", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Services" });
  await expect(tableRows).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Entry type", exact: true })
    .selectOption({ label: "Service visit" });
  await page
    .getByRole("combobox", { name: "Traffic marshal", exact: true })
    .selectOption({ label: "Olamilekan Alaga" });
  await page
    .getByRole("combobox", { name: "Classification", exact: true })
    .selectOption({ label: "Approved" });
  await expect(tableRows).toHaveCount(2);
  await expect(tableRows.filter({ hasText: "Road sweeper" })).toHaveCount(1);
  await expect(tableRows.filter({ hasText: "Toilet servicing" })).toHaveCount(
    1,
  );
  await summary(page, [2, 1, 0]);
  const ready = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await ready;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Recorded at ISO");
  expect(csv.split(/\r?\n/)[0]).not.toContain('"Entry type"');
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
  await tableRows.first().locator("td:first-child button").first().click();
  await expect(
    page.getByRole("dialog", { name: "Arrival details", exact: true }),
  ).toContainText(`Sample Road sweeper ${suffix}`);
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByText("Arrival breakdown", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No arrivals in this period.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Workload", exact: true }).click();
  const olaActivity = page.getByRole("article", {
    name: "Activity for Olamilekan Alaga",
    exact: true,
  });
  const bActivity = page.getByRole("article", {
    name: "Activity for Bemigho Estano",
    exact: true,
  });
  await expect(olaActivity).toContainText("13");
  await expect(olaActivity).toContainText("Road sweeper");
  await expect(olaActivity).toContainText("Toilet servicing");
  await expect(bActivity).toContainText("20");
  await page
    .getByRole("combobox", { name: "Traffic marshal", exact: true })
    .selectOption({ label: "Olamilekan Alaga" });
  await expect(bActivity).toHaveCount(0);
  await summary(page, [13, 1, 1]);
  await expect(olaActivity).toContainText("Timber");
  await page.getByRole("tab", { name: "Records", exact: true }).click();
  await expect(tableRows).toHaveCount(13);
  await expect(tableRows.locator("td:nth-child(2)")).toHaveText(
    Array(13).fill("Olamilekan Alaga"),
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(tableRows).toHaveCount(33);
  if (info.project.name === "demo-mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("smart-supervisor-breakdown.png"),
    fullPage: true,
  });
  expect(observed).toEqual({ apiRequests: [], errors: [] });
});
