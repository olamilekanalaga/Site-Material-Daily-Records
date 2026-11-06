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
async function capture(
  page: Page,
  marshal: string,
  supplier: string,
  time?: string,
) {
  await page.getByRole("button", { name: marshal, exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/demo/delivery/${marshal === "B" ? "b" : "olamilekan"}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Record Delivery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Material name", exact: true })
    .selectOption({ label: "6F5" });
  await page
    .getByLabel("Supplier / Company name", { exact: true })
    .fill(supplier);
  if (time) await page.getByLabel(/^Delivery time/).fill(time);
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

test("public DJCU demo starts with Sign in as and opens marshal entry and records on separate pages", async ({
  page,
  context,
  request,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  await openDemo(page);
  await expect(page).toHaveTitle(/DJCU/);
  const logo = page.locator('img[src="/djcu-logo.jpg"]:visible').first();
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const name of ["B", "Olamilekan Alaga"]) {
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
  await page
    .getByRole("link", { name: "Delivery Records", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delivery Records", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View as supervisor", exact: true })
    .click();
  const sampleRows = page.locator(".simple-table tbody tr");
  await expect(sampleRows).toHaveCount(10);
  const marshalCells = sampleRows.locator("td:nth-child(5)");
  await expect(marshalCells.filter({ hasText: /^B$/ })).toHaveCount(5);
  await expect(
    marshalCells.filter({ hasText: /^Olamilekan Alaga$/ }),
  ).toHaveCount(5);
  await expect(page.locator("body")).not.toContainText(
    /Demo gate|B Traffic Marshal|fictional/i,
  );
  await page.reload();
  await expect(sampleRows).toHaveCount(10);
  await page.goto("/demo");
  await page.getByRole("link", { name: "Home", exact: true }).click();
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
  await capture(page, "B", earlySupplier, "00:00");
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records(?:\?|$)/);
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await capture(page, "Olamilekan Alaga", recentSupplier);
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records(?:\?|$)/);
  const earlyRow = page.getByRole("row").filter({ hasText: earlySupplier });
  const recentRow = page.getByRole("row").filter({ hasText: recentSupplier });
  await expect(earlyRow).toHaveCount(0);
  await expect(recentRow).toHaveCount(1);
  await page
    .getByRole("link", { name: "View as supervisor", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delivery Records", exact: true }),
  ).toBeVisible();
  await expect(earlyRow).toHaveCount(1);
  await expect(earlyRow).toContainText("B");
  await expect(recentRow).toContainText("Olamilekan Alaga");
  const rows = await page.getByRole("row").allTextContents();
  expect(rows.findIndex((row) => row.includes(recentSupplier))).toBeLessThan(
    rows.findIndex((row) => row.includes(earlySupplier)),
  );
  const headers = (await page.getByRole("columnheader").allTextContents()).map(
    (text) => text.replace(/\s/g, "").toLowerCase(),
  );
  expect(headers).toEqual([
    "date",
    "time",
    "material",
    "supplier/company",
    "trafficmarshal",
    "photo",
  ]);
  await recentRow
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  const photo = page.getByRole("dialog").getByRole("img");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty("naturalWidth", 1);
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Material", exact: true })
    .selectOption({ label: "G1" });
  await expect(recentRow).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Material", exact: true })
    .selectOption({ label: "6F5" });
  await expect(recentRow).toHaveCount(1);
  await page.getByLabel("From date", { exact: true }).fill("2000-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2000-01-01");
  await expect(recentRow).toHaveCount(0);
  await page.getByLabel("From date", { exact: true }).fill("");
  await page.getByLabel("To date", { exact: true }).fill("");
  await expect(recentRow).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Delivery Records", exact: true }),
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
    .getByRole("link", { name: "Delivery Records", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: recentSupplier }),
  ).toHaveCount(1);
  await page
    .getByRole("link", { name: "View as supervisor", exact: true })
    .click();
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
    page.getByRole("heading", { name: "Delivery Records", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(10);
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
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(11);

  // Each marshal and the supervisor retain their own view across tabs.
  const bPage = await context.newPage();
  const bRequests = monitorBackendRequests(bPage);
  bPage.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemo(bPage);
  await bPage.getByRole("button", { name: "B", exact: true }).click();
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
  await expect(bPage.locator(".simple-table tbody tr")).toHaveCount(5);
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
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(11);
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

test("supervisor date ranges and material cards show period totals without crowding the page", async ({
  page,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await page.goto("/demo/supervisor");
  await expect(page.locator(".simple-table tbody tr")).toHaveCount(10);
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
      name: `Total deliveries: ${count}`,
      exact: true,
    });
  const material = (name: string, count: number) =>
    summary.getByRole("button", {
      name: `${name}: ${count} deliveries`,
      exact: true,
    });
  await expect(rows).toHaveCount(7);
  await from.fill("2026-10-01");
  await to.fill("2026-10-30");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "October first" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "October last" })).toHaveCount(1);
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

  for (const [label, first, last, count] of [
    ["Today", "2026-11-06", "2026-11-06", 1],
    ["Last 3 days", "2026-11-04", "2026-11-06", 2],
    ["Last 7 days", "2026-10-31", "2026-11-06", 4],
    ["This month", "2026-11-01", "2026-11-06", 3],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(from).toHaveValue(first);
    await expect(to).toHaveValue(last);
    await expect(rows).toHaveCount(count);
    await expect(total(count)).toBeVisible();
  }
  await from.fill("2026-11-07");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(total(0)).toBeVisible();
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(rows).toHaveCount(7);
  await expect(total(7)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await from.fill("2000-01-01");
  await to.fill("2000-01-03");
  await expect(rows).toHaveCount(0);
  await expect(
    page.getByText("No saved deliveries match these filters."),
  ).toBeVisible();
  await expect(total(0)).toBeVisible();
  await page.getByRole("button", { name: "All dates", exact: true }).click();

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
