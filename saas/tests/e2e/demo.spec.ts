import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { DemoState } from "../../src/lib/demo/engine";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);

function monitorBackendRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^\/api(?:\/|$)/.test(new URL(request.url()).pathname))
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return requests;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function openDemo(page: Page) {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
}
async function cleanLayout(page: Page) {
  await expect(page.getByText(/^Traffic Marshal Unit$/i)).toBeVisible();
  await expect(page.locator(".simple-workspace-bar")).toHaveCount(0);
  await expect(page.locator(".simple-footer")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  for (const role of ["button", "link"] as const) {
    await expect(
      page.getByRole(role, { name: "Home", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole(role, { name: "Daily Records", exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.locator("body")).not.toContainText(
    /Demonstration Site|Demo workspace|Saved only in this browser|DJ CIVILS · Delivery log/,
  );
}
async function capture(page: Page, marshal: string, supplier: string) {
  await page.getByRole("button", { name: marshal, exact: true }).click();
  const profile = marshal === "Bemigho Estano" ? "b" : "olamilekan";
  await expect(page).toHaveURL(new RegExp(`/demo/delivery/${profile}$`));
  await expect(
    page.getByRole("heading", { name: "Record Delivery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await expect(page.locator(".simple-table")).toHaveCount(0);
  await cleanLayout(page);
  await expect(page.getByText("Quick Record", { exact: true })).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Aggregates" });
  await page
    .getByRole("combobox", { name: "Item / material / activity", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search items", exact: true })
    .fill("6F5");
  await page.getByRole("option", { name: "6F5", exact: true }).click();
  await page
    .getByLabel("Supplier / Company name", { exact: true })
    .fill(supplier);
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "fictional-load.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Delivery saved");
  await expect(page.getByRole("status")).not.toContainText(
    /submitted to server/i,
  );
  await expect(
    page.getByLabel("Supplier / Company name", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Delivery image", { exact: true })).toHaveValue(
    "",
  );
}

test("public DJ Civils photo selection opens delivery input first with explicit records access", async ({
  page,
  context,
  request,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  await openDemo(page);
  await expect(page).toHaveTitle(/DJ CIVILS/i);
  const logo = page.locator('img[src="/djcu-logo.jpg"]:visible').first();
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const name of ["Bemigho Estano", "Olamilekan Alaga"]) {
    const photo = page
      .getByRole("button", { name, exact: true })
      .locator("img");
    await expect(photo).toBeVisible();
    await expect
      .poll(() =>
        photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const box = await photo.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
  }
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Verification queue" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Daily reports" })).toHaveCount(
    0,
  );
  await expect(page.locator("body")).not.toContainText(
    /Site\s?Ledger|Set APP_MODE/,
  );
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("simple-demo-home.png"),
    fullPage: true,
  });
  await cleanLayout(page);
  await expect(
    page.getByRole("button", { name: "Refresh deliveries" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Bemigho Estano", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/delivery\/b$/);
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Recording for Bemigho Estano", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-table")).toHaveCount(0);
  await page
    .getByLabel("Supplier / Company name", { exact: true })
    .fill("Unsaved home return");
  await page.getByRole("link", { name: "DJ Civils home", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/delivery\/b$/);
  await expect(
    page.getByLabel("Supplier / Company name", { exact: true }),
  ).toHaveValue("Unsaved home return");
  await cleanLayout(page);
  await page.screenshot({
    path: testInfo.outputPath("marshal-input-first.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records\?profile=b$/);
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(20);
  await expect(
    page.getByRole("button", { name: "Record New Delivery", exact: true }),
  ).toBeVisible();
  await cleanLayout(page);
  await page.screenshot({
    path: testInfo.outputPath("clean-marshal-records.png"),
    fullPage: false,
  });
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "DJ Civils home", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/delivery\/b$/);
  await expect(
    page.getByText("Recording for Bemigho Estano", { exact: true }),
  ).toBeVisible();
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/delivery\/olamilekan$/);
  await expect(
    page.getByText("Recording for Olamilekan Alaga", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-table")).toHaveCount(0);
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records\?profile=olamilekan$/);
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(10);
  await page.goto("/demo/supervisor");
  const sampleRows = page.locator(".simple-table tbody tr");
  await expect(sampleRows).toHaveCount(30);
  const marshalCells = sampleRows.locator("td:nth-child(6)");
  await expect(
    marshalCells.filter({ hasText: /^Bemigho Estano$/ }),
  ).toHaveCount(20);
  await expect(
    marshalCells.filter({ hasText: /^Olamilekan Alaga$/ }),
  ).toHaveCount(10);
  const names = await marshalCells.allTextContents();
  const nameChanges = names.reduce(
    (changes, name, index) =>
      changes + (index > 0 && name !== names[index - 1] ? 1 : 0),
    0,
  );
  expect(nameChanges).toBeGreaterThan(1);
  const arrivalClocks = await sampleRows.evaluateAll((rows) =>
    rows.map(
      (row) => `${row.children[0].textContent} ${row.children[1].textContent}`,
    ),
  );
  expect(arrivalClocks).toEqual(
    [...arrivalClocks].sort((a, b) => b.localeCompare(a)),
  );
  await expect(
    page
      .getByRole("region", { name: "Delivery summaries", exact: true })
      .getByRole("button", { name: "Total arrivals: 30", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Demo gate|B Traffic Marshal|fictional/i,
  );
  await page.reload();
  await expect(sampleRows).toHaveCount(30);
  await page
    .locator(".simple-records-panel")
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("simple-demo-thirty-summary.png"),
    fullPage: false,
  });
  await page.goto("/demo");
  await page.getByRole("link", { name: "DJ Civils home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
  expect((await request.get("/api/bootstrap")).status()).toBe(503);
});

test("demo photo deliveries retain selected marshals, sort by arrival, filter and persist without a real upload", async ({
  page,
  context,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  await openDemo(page);
  const suffix = randomUUID().slice(0, 8);
  const earlySupplier = `Fictional early ${suffix}`;
  const recentSupplier = `Fictional recent ${suffix}`;
  await capture(page, "Bemigho Estano", earlySupplier);
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records(?:\?|$)/);
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "DJ Civils home", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/delivery\/b$/);
  await expect(
    page.getByText("Recording for Bemigho Estano", { exact: true }),
  ).toBeVisible();
  await page.goto("/demo");
  await capture(page, "Olamilekan Alaga", recentSupplier);
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records(?:\?|$)/);
  const earlyRow = page.getByRole("row").filter({ hasText: earlySupplier });
  const recentRow = page.getByRole("row").filter({ hasText: recentSupplier });
  await expect(earlyRow).toHaveCount(0);
  await expect(recentRow).toHaveCount(1);
  await page.goto("/demo/supervisor");
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(earlyRow).toHaveCount(1);
  await expect(earlyRow).toContainText("Bemigho Estano");
  await expect(recentRow).toContainText("Olamilekan Alaga");
  const rows = await page.getByRole("row").allTextContents();
  expect(rows.findIndex((row) => row.includes(recentSupplier))).toBeLessThan(
    rows.findIndex((row) => row.includes(earlySupplier)),
  );
  const headers = (
    await page
      .getByRole("table", { name: "Saved delivery records", exact: true })
      .getByRole("columnheader")
      .allTextContents()
  ).map((text) => text.replace(/\s/g, "").toLowerCase());
  expect(headers).toEqual([
    "date",
    "time",
    "item",
    "category",
    "company/supplier",
    "recordedby",
    "photo/ticketevidence",
  ]);
  await recentRow
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  const photo = page.getByRole("dialog").getByRole("img");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty("naturalWidth", 1);
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Item", exact: true })
    .selectOption({ label: "G1" });
  await expect(recentRow).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Item", exact: true })
    .selectOption({ label: "6F5" });
  await expect(recentRow).toHaveCount(1);
  await page.getByLabel("From date", { exact: true }).fill("2000-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2000-01-01");
  await expect(recentRow).toHaveCount(0);
  await page.getByLabel("From date", { exact: true }).fill("");
  await page.getByLabel("To date", { exact: true }).fill("");
  await expect(recentRow).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(recentRow).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("simple-demo-records.png"),
    fullPage: true,
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/delivery\/olamilekan$/);
  await expect(
    page.getByText("Recording for Olamilekan Alaga", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records\?profile=olamilekan$/);
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: recentSupplier }),
  ).toHaveCount(1);
  await page.goto("/demo/supervisor");
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(1);
  expect(apiRequests).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
});

test("direct supervisor view stays read-only and keeps photo access while a marshal uses another tab", async ({
  page,
  context,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/demo/supervisor");
  await expect(page).toHaveTitle(/Supervisor demo/);
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(30);
  await cleanLayout(page);
  await expect(
    page.getByRole("button", { name: "Record New Delivery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Home", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save Delivery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View as supervisor", exact: true }),
  ).toHaveCount(0);
  const materialCell = page
    .getByRole("cell", { name: "6F5", exact: true })
    .first();
  await expect(materialCell).toBeVisible();
  await expect(materialCell.locator("*")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "GF5", exact: true }),
  ).toHaveCount(0);

  const marshalPage = await context.newPage();
  const marshalRequests = monitorBackendRequests(marshalPage);
  marshalPage.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemo(marshalPage);
  const supplier = `Sample supervisor ${randomUUID().slice(0, 8)}`;
  await capture(marshalPage, "Olamilekan Alaga", supplier);
  await page.getByRole("button", { name: "Refresh deliveries" }).click();
  const uploadedRow = page.getByRole("row").filter({ hasText: supplier });
  await expect(uploadedRow).toContainText("Olamilekan Alaga");
  await expect(uploadedRow).toContainText("6F5");
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(31);

  // Each marshal and the supervisor retain their own view across tabs.
  const bPage = await context.newPage();
  const bRequests = monitorBackendRequests(bPage);
  bPage.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemo(bPage);
  await bPage
    .getByRole("button", { name: "Bemigho Estano", exact: true })
    .click();
  await expect(bPage).toHaveURL(/\/demo\/delivery\/b$/);
  await bPage
    .getByRole("button", { name: "View Records", exact: true })
    .click();
  await expect(bPage).toHaveURL(/\/demo\/records\?profile=b$/);
  await expect(
    bPage.getByRole("row").filter({ hasText: supplier }),
  ).toHaveCount(0);
  await marshalPage.reload();
  await expect(marshalPage).toHaveURL(/\/demo\/delivery\/olamilekan$/);
  await expect(
    marshalPage.getByText("Recording for Olamilekan Alaga", { exact: true }),
  ).toBeVisible();
  await bPage.getByRole("button", { name: "Refresh deliveries" }).click();
  await expect(bPage.locator(".simple-table tbody tr")).toHaveCount(20);
  await expect(
    bPage.getByRole("row").filter({ hasText: supplier }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh deliveries" }).click();
  await uploadedRow
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  const photo = page.getByRole("dialog").getByRole("img");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty("naturalWidth", 1);
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page.reload();
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(31);
  await expect(uploadedRow).toBeVisible();
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await noOverflow(page);
  await noOverflow(marshalPage);
  await page.locator(".simple-table-scroll").evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page.screenshot({
    path: testInfo.outputPath("supervisor-demo-records.png"),
    fullPage: true,
  });
  expect(apiRequests).toEqual([]);
  expect(marshalRequests).toEqual([]);
  expect(bRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
  await marshalPage.close();
  await bPage.close();
});

test("daily records roll over at London midnight while custom ranges retain period totals", async ({
  page,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await page.goto("/demo/supervisor");
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(30);
  for (const label of [
    "All dates",
    "Today",
    "Last 3 days",
    "Last 7 days",
    "This month",
  ]) {
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  }
  // Simulate saved arrivals at the London date boundaries. This changes only
  // this test browser's demo database, including the final millisecond of Oct30.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("djcu-fictional-browser-demo", 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const transaction = database.transaction("demo", "readwrite");
      const store = transaction.objectStore("demo");
      const saved = await new Promise<DemoState>((resolve, reject) => {
        const reading = store.get("state");
        reading.onsuccess = () => resolve(reading.result as DemoState);
        reading.onerror = () => reject(reading.error);
      });
      const template = saved.deliveries[0];
      const fixtures = [
        ["Before October", "2026-09-30T22:59:59.999Z", "6F5"],
        ["October first", "2026-09-30T23:00:00.000Z", "6F5"],
        ["October last", "2026-10-30T23:59:59.999Z", "Sand"],
        ["October thirty-first", "2026-10-31T00:00:00.000Z", "Type 1"],
        ["Before three days", "2026-11-03T23:59:59.999Z", "G1"],
        ["Three day start", "2026-11-04T00:00:00.000Z", "Sand"],
        ["Today arrival", "2026-11-06T23:59:59.999Z", "6F5"],
      ];
      saved.deliveries = fixtures.map(([supplier, arrival, material]) => ({
        ...template,
        id: crypto.randomUUID(),
        supplier_name: supplier,
        material_id: saved.materials.find((item) => item.name === material)!.id,
        item_name: material,
        category: undefined,
        entry_type: undefined,
        recorded_at: undefined,
        arrival_at: arrival,
        created_at: arrival,
        submitted_at: arrival,
        status: "Submitted",
        accepted_quantity: null,
        accepted_unit: null,
        evidence: [],
        reviews: [],
      }));
      store.put(saved, "state");
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
  await page.reload();
  const summary = page.getByRole("region", {
    name: "Delivery summaries",
    exact: true,
  });
  const rows = page.locator(".simple-table tbody tr");
  const from = page.getByLabel("From date", { exact: true });
  const to = page.getByLabel("To date", { exact: true });
  const total = (count: number) =>
    summary.getByRole("button", {
      name: `Total arrivals: ${count}`,
      exact: true,
    });
  const material = (name: string, count: number) =>
    summary.getByRole("button", {
      name: `${name}: ${count} arrivals`,
      exact: true,
    });
  await expect(from).toHaveValue("2026-11-06");
  await expect(to).toHaveValue("2026-11-06");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Today arrival");
  await expect(total(1)).toBeVisible();
  // The automatic period follows the site's calendar day, not the preceding 24 hours.
  await page.clock.fastForward(12 * 60 * 60 * 1000 + 15_000);
  await expect(from).toHaveValue("2026-11-07");
  await expect(to).toHaveValue("2026-11-07");
  await expect(rows).toHaveCount(0);
  await expect(total(0)).toBeVisible();
  await from.fill("2026-10-01");
  await to.fill("2026-10-30");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "October first" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "October last" })).toHaveCount(1);
  await expect(total(2)).toBeVisible();
  // A manually selected historical period stays fixed over the next midnight.
  await page.clock.fastForward(24 * 60 * 60 * 1000 + 15_000);
  await expect(from).toHaveValue("2026-10-01");
  await expect(to).toHaveValue("2026-10-30");
  await expect(rows).toHaveCount(2);
  await expect(total(2)).toBeVisible();
  await expect(material("6F5", 1)).toBeVisible();
  await material("6F5", 1).click();
  await expect(material("6F5", 1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("October first");
  // Material filtering narrows the table but keeps every period total useful.
  await expect(total(2)).toBeVisible();
  await expect(material("Sand", 1)).toHaveCount(1);
  await total(2).click();
  await expect(rows).toHaveCount(2);
  await expect(from).toHaveValue("2026-10-01");
  await expect(to).toHaveValue("2026-10-30");

  await from.fill("2026-11-07");
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a To date" }),
  ).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(total(0)).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(from).toHaveValue("2026-11-08");
  await expect(to).toHaveValue("2026-11-08");
  await expect(rows).toHaveCount(0);
  await expect(total(0)).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a To date" }),
  ).toHaveCount(0);
  // History is retained and can still be viewed through an explicit open range.
  await from.fill("");
  await to.fill("");
  await expect(rows).toHaveCount(7);
  await expect(total(7)).toBeVisible();
  await from.fill("2000-01-01");
  await to.fill("2000-01-03");
  await expect(rows).toHaveCount(0);
  await expect(
    page.getByText("No saved deliveries match these filters."),
  ).toBeVisible();
  await expect(total(0)).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(from).toHaveValue("2026-11-08");
  await expect(to).toHaveValue("2026-11-08");
  await expect(total(0)).toBeVisible();

  const dimensions = await summary.evaluate((element) => {
    const buttons = [...element.querySelectorAll("button")];
    return {
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      tops: buttons.map((button) =>
        Math.round(button.getBoundingClientRect().top),
      ),
    };
  });
  expect(new Set(dimensions.tops).size).toBe(1);
  if (testInfo.project.name !== "demo-desktop") {
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.width);
    await summary.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(
      await summary.evaluate((element) => element.scrollLeft),
    ).toBeGreaterThan(0);
  }
  await noOverflow(page);
  await summary.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page.screenshot({
    path: testInfo.outputPath("date-range-material-summaries.png"),
    fullPage: true,
  });
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
