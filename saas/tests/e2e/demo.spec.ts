import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
    .selectOption({ label: "Aggregates / Sands" });
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

const workspaceRows = (page: Page) =>
  page
    .getByRole("table", { name: "Saved delivery records", exact: true })
    .locator("tbody tr");
async function workspace(page: Page) {
  await page.goto("/demo/supervisor");
  await expect(
    page.getByRole("heading", {
      name: "Gate — Supervisor Workspace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Records", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}
async function stat(page: Page, label: string, count: number) {
  await expect(
    page
      .getByRole("region", { name: "Workspace summary", exact: true })
      .getByRole("group", { name: `${label}: ${count}`, exact: true }),
  ).toBeVisible();
}
async function disclosure(page: Page, name: string) {
  const summary = page.getByText(name, { exact: true });
  if (
    !(await summary.evaluate(
      (element) => (element.parentElement as HTMLDetailsElement).open,
    ))
  )
    await summary.click();
}
async function demoState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("djcu-fictional-browser-demo", 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise<DemoState>((resolve, reject) => {
        const read = db.transaction("demo").objectStore("demo").get("state");
        read.onsuccess = () => resolve(read.result as DemoState);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

test("public DJ Civils photo selection opens delivery input first with explicit records access", async ({
  page,
  context,
  request,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  await page.goto("/");
  const choices = [
    page.getByRole("button", { name: "Traffic Marshal sign-in", exact: true }),
    page.getByRole("button", {
      name: "Supervisor / Site Manager sign-in",
      exact: true,
    }),
    page.getByRole("link", { name: "Traffic Marshal demo", exact: true }),
    page.getByRole("link", { name: "Supervisor demo", exact: true }),
  ];
  await expect(
    page.getByRole("group", { name: "Sign-in options", exact: true }),
  ).toBeVisible();
  for (const choice of choices) await expect(choice).toBeVisible();
  await expect(choices[0]).toBeDisabled();
  await expect(choices[1]).toBeDisabled();
  await expect(choices[2]).toHaveAttribute("href", "/demo");
  await expect(choices[3]).toHaveAttribute("href", "/demo/supervisor");
  const options = page.getByRole("group", {
    name: "Sign-in options",
    exact: true,
  });
  await expect(options.getByRole("button")).toHaveCount(2);
  await expect(options.getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /sign-in$/ })).toHaveCount(0);
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Every arrival|A clearer record|INTERACTIVE SAMPLE WORKSPACE|Try the delivery log|No email or password needed|Demo changes and photos stay in your browser|Quick delivery entry|Private sign-in will be available/,
  );
  const optionBoxes = await Promise.all(
    choices.map((choice) => choice.boundingBox()),
  );
  for (let index = 0; index < optionBoxes.length; index++) {
    const box = optionBoxes[index]!;
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(Math.abs(box.width - optionBoxes[0]!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.height - optionBoxes[0]!.height)).toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(box.x - optionBoxes[0]!.x)).toBeLessThanOrEqual(2);
    if (index)
      expect(box.y).toBeGreaterThanOrEqual(
        optionBoxes[index - 1]!.y + optionBoxes[index - 1]!.height,
      );
  }
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("sign-in-options.png"),
    fullPage: true,
  });
  for (const portal of ["marshal", "supervisor"]) {
    await page.goto(`/sign-in/${portal}`);
    await expect(
      page.getByRole("group", { name: "Sign-in options", exact: true }),
    ).toBeVisible();
    await expect(choices[0]).toBeDisabled();
    await expect(choices[1]).toBeDisabled();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  }
  await page.goto("/");
  await choices[2].click();
  await expect(page).toHaveURL(/\/demo\/?$/);
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
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
  await page.goto("/");
  await page
    .getByRole("link", { name: "Supervisor demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/supervisor\/?$/);
  await expect(
    page.getByRole("heading", {
      name: "Gate — Supervisor Workspace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  const sampleRows = workspaceRows(page);
  await expect(sampleRows).toHaveCount(30);
  await expect(
    sampleRows.locator("td:nth-child(2)").filter({ hasText: "Bemigho Estano" }),
  ).toHaveCount(20);
  await expect(
    sampleRows
      .locator("td:nth-child(2)")
      .filter({ hasText: "Olamilekan Alaga" }),
  ).toHaveCount(10);
  await expect(
    page
      .getByRole("table", { name: "Saved delivery records", exact: true })
      .getByRole("columnheader"),
  ).toHaveText(["Item", "Marshal", "Time"]);
  const saved = await demoState(page);
  const expected = [...saved.deliveries].sort(
    (a, b) =>
      Date.parse(b.recorded_at || b.arrival_at) -
        Date.parse(a.recorded_at || a.arrival_at) || b.id.localeCompare(a.id),
  );
  expect(
    await sampleRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-record-id")),
    ),
  ).toEqual(expected.map((record) => record.id));
  await stat(page, "Arrivals", 30);
  await stat(page, "Marshals", 2);
  await stat(page, "To Classify", 1);
  await expect(page.getByText("Demo preview", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Demo gate|B Traffic Marshal/i,
  );
  await page.reload();
  await expect(sampleRows).toHaveCount(30);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("supervisor-workspace-summary.png"),
    fullPage: true,
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

test("demo photo deliveries retain selected marshals, sort by recorded time, filter and persist without a real upload", async ({
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
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "DJ Civils home", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/delivery\/b$/);
  await expect(
    page.getByText("Recording for Bemigho Estano", { exact: true }),
  ).toBeVisible();
  await openDemo(page);
  await capture(page, "Olamilekan Alaga", recentSupplier);
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: recentSupplier }),
  ).toHaveCount(1);
  const saved = await demoState(page);
  const early = saved.deliveries.find(
    (record) => record.supplier_name === earlySupplier,
  )!;
  const recent = saved.deliveries.find(
    (record) => record.supplier_name === recentSupplier,
  )!;
  await workspace(page);
  await expect(workspaceRows(page)).toHaveCount(32);
  const earlyRow = workspaceRows(page).filter({
    has: page.getByRole("button", {
      name: `View 6F5 record ${early.id}`,
      exact: true,
    }),
  });
  const recentRow = workspaceRows(page).filter({
    has: page.getByRole("button", {
      name: `View 6F5 record ${recent.id}`,
      exact: true,
    }),
  });
  await expect(earlyRow).toContainText("Bemigho Estano");
  await expect(recentRow).toContainText("Olamilekan Alaga");
  const ids = await workspaceRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-record-id")),
  );
  expect(ids.indexOf(recent.id)).toBeLessThan(ids.indexOf(early.id));
  await expect(
    page
      .getByRole("table", { name: "Saved delivery records", exact: true })
      .getByRole("columnheader"),
  ).toHaveText(["Item", "Marshal", "Time"]);
  await recentRow
    .getByRole("button", { name: `View 6F5 record ${recent.id}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Arrival details", exact: true }),
  ).toContainText(recentSupplier);
  await expect(
    page.getByRole("dialog", { name: "Arrival details", exact: true }),
  ).toContainText(recent.id);
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await recentRow
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await disclosure(page, "More filters");
  await page
    .getByRole("combobox", { name: "Item", exact: true })
    .selectOption({ label: "G1" });
  await expect(recentRow).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Item", exact: true })
    .selectOption({ label: "6F5" });
  await expect(recentRow).toHaveCount(1);
  await disclosure(page, "Date range");
  await page.getByLabel("From date", { exact: true }).fill("2000-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2000-01-01");
  await expect(recentRow).toHaveCount(0);
  await page.getByLabel("From date", { exact: true }).fill("");
  await page.getByLabel("To date", { exact: true }).fill("");
  await expect(recentRow).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("supervisor-record-details.png"),
    fullPage: true,
  });
  await openDemo(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/records\?profile=olamilekan$/);
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: recentSupplier }),
  ).toHaveCount(1);
  await workspace(page);
  await expect(earlyRow).toHaveCount(1);
  expect(apiRequests).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
});

test("direct supervisor workspace stays read-only and keeps photo access while marshals use other tabs", async ({
  page,
  context,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page),
    pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await workspace(page);
  await expect(page).toHaveTitle(/Supervisor demo/);
  await expect(workspaceRows(page)).toHaveCount(30);
  for (const name of ["Record New Delivery", "Save Delivery"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  const marshalPage = await context.newPage();
  const marshalRequests = monitorBackendRequests(marshalPage);
  marshalPage.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemo(marshalPage);
  const supplier = `Sample supervisor ${randomUUID().slice(0, 8)}`;
  await capture(marshalPage, "Olamilekan Alaga", supplier);
  const record = (await demoState(marshalPage)).deliveries.find(
    (delivery) => delivery.supplier_name === supplier,
  )!;
  await page
    .getByRole("button", { name: "Refresh deliveries", exact: true })
    .click();
  const uploadedRow = workspaceRows(page).filter({
    has: page.getByRole("button", {
      name: `View 6F5 record ${record.id}`,
      exact: true,
    }),
  });
  await expect(uploadedRow).toContainText("Olamilekan Alaga");
  await expect(uploadedRow).toContainText("6F5");
  await expect(workspaceRows(page)).toHaveCount(31);
  await stat(page, "Arrivals", 31);
  await stat(page, "Marshals", 2);
  // Role comes from each demo page, so opening another marshal tab never
  // changes the supervisor's evidence access or the first marshal's profile.
  const bPage = await context.newPage();
  const bRequests = monitorBackendRequests(bPage);
  bPage.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemo(bPage);
  await bPage
    .getByRole("button", { name: "Bemigho Estano", exact: true })
    .click();
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
  await bPage
    .getByRole("button", { name: "Refresh deliveries", exact: true })
    .click();
  await expect(bPage.locator(".simple-table tbody tr")).toHaveCount(20);
  await page
    .getByRole("button", { name: "Refresh deliveries", exact: true })
    .click();
  await uploadedRow
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page.reload();
  await expect(workspaceRows(page)).toHaveCount(31);
  await expect(uploadedRow).toBeVisible();
  await noOverflow(page);
  await noOverflow(marshalPage);
  await page.screenshot({
    path: testInfo.outputPath("supervisor-workspace-records.png"),
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

test("saved records open across all dates while custom ranges still filter without changing history", async ({
  page,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await workspace(page);
  await expect(workspaceRows(page)).toHaveCount(30);
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
      const marshal = saved.members.find(
        (member) => member.name === "Bemigho Estano",
      )!;
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
        created_by: marshal.id,
        creator_name: marshal.name,
        marshal_id: marshal.id,
        marshal_name: marshal.name,
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
  const originalRecords = (await demoState(page)).deliveries;
  await page.reload();
  await disclosure(page, "Date range");
  await disclosure(page, "More filters");
  const rows = workspaceRows(page);
  const from = page.getByLabel("From date", { exact: true });
  const to = page.getByLabel("To date", { exact: true });
  const materialFilter = page.getByRole("combobox", {
    name: "Item",
    exact: true,
  });
  await stat(page, "Arrivals", 7);
  await stat(page, "Marshals", 1);
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(rows).toHaveCount(7);
  await expect(
    page.getByText("Arrival breakdown", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No arrivals in this period.", { exact: true }),
  ).toHaveCount(0);
  await expect(rows.first().locator("time")).toHaveAttribute(
    "datetime",
    "2026-11-06T23:59:59.999Z",
  );
  await expect(rows.first().locator("time")).toHaveAttribute(
    "title",
    /arrival|legacy/i,
  );
  // The default remains the whole saved history as the current day changes.
  await page.clock.fastForward(12 * 60 * 60 * 1000 + 15_000);
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(rows).toHaveCount(7);
  await stat(page, "Arrivals", 7);
  await from.fill("2026-10-01");
  await to.fill("2026-10-30");
  await expect(rows).toHaveCount(2);
  await stat(page, "Arrivals", 2);
  await expect(rows.locator("td:first-child")).toContainText(["Sand", "6F5"]);
  await page.clock.fastForward(24 * 60 * 60 * 1000 + 15_000);
  await expect(from).toHaveValue("2026-10-01");
  await expect(to).toHaveValue("2026-10-30");
  await stat(page, "Arrivals", 2);
  // All tabs share the same filtered records and the chosen historical period.
  await page.getByRole("tab", { name: "Workload", exact: true }).click();
  await stat(page, "Arrivals", 2);
  await expect(from).toHaveValue("2026-10-01");
  await page.getByRole("tab", { name: "Records", exact: true }).click();
  await materialFilter.selectOption({ label: "6F5" });
  await expect(rows).toHaveCount(1);
  await stat(page, "Arrivals", 1);
  await materialFilter.selectOption("");
  await to.fill("2026-10-31");
  await expect(rows).toHaveCount(3);
  await stat(page, "Arrivals", 3);
  await expect(rows.first()).toContainText("Type 1");
  const exporting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = await readFile((await (await exporting).path())!, "utf8");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(4);
  for (const name of ["October first", "October last", "October thirty-first"])
    expect(csv).toContain(name);
  expect(csv).not.toContain("Before October");
  expect(csv).not.toContain("Today arrival");
  await from.fill("2026-11-07");
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a To date" }),
  ).toBeVisible();
  await expect(rows).toHaveCount(0);
  await stat(page, "Arrivals", 0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(rows).toHaveCount(7);
  await stat(page, "Arrivals", 7);
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a To date" }),
  ).toHaveCount(0);
  await from.fill("2000-01-01");
  await to.fill("2000-01-03");
  await expect(rows).toHaveCount(0);
  await expect(
    page.getByText("No saved deliveries match these filters.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await stat(page, "Arrivals", 7);
  await expect(rows).toHaveCount(7);
  await from.fill("2026-10-01");
  await to.fill("2026-10-31");
  await expect(rows).toHaveCount(3);
  await page.reload();
  await expect(rows).toHaveCount(7);
  await disclosure(page, "Date range");
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await stat(page, "Arrivals", 7);
  await expect(
    page.getByText("Arrival breakdown", { exact: true }),
  ).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("workspace-historical-date-filters.png"),
    fullPage: true,
  });
  // The marshal's own records also open the saved history instead of an empty
  // current day. Filtering changes only the view, never the underlying times.
  await page.goto("/demo/records?profile=b");
  const marshalRows = page.locator(".simple-table tbody tr");
  await expect(marshalRows).toHaveCount(7);
  await expect(page.getByLabel("From date", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("To date", { exact: true })).toHaveValue("");
  await expect(
    page.getByText("Arrival breakdown", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("To date", { exact: true }).fill("2026-10-31");
  await expect(marshalRows).toHaveCount(3);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(marshalRows).toHaveCount(7);
  await page.reload();
  await expect(marshalRows).toHaveCount(7);
  expect((await demoState(page)).deliveries).toEqual(originalRecords);
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
