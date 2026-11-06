import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

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
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
}
async function capture(
  page: Page,
  marshal: string,
  supplier: string,
  time?: string,
) {
  await page.getByRole("button", { name: marshal, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Material name", exact: true })
    .selectOption({ label: "GF5" });
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

test("public DJCU demo opens Home directly with two square marshal photographs and two-page navigation", async ({
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
    .getByRole("button", { name: "Delivery Records", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delivery Records", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View as supervisor", exact: true })
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
  await page
    .getByRole("button", { name: "Back to marshal entry", exact: true })
    .click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
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
  await page
    .getByRole("button", { name: "Delivery Records", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await capture(page, "Olamilekan Alaga", recentSupplier);
  await page
    .getByRole("button", { name: "Delivery Records", exact: true })
    .click();
  const earlyRow = page.getByRole("row").filter({ hasText: earlySupplier });
  const recentRow = page.getByRole("row").filter({ hasText: recentSupplier });
  await expect(earlyRow).toHaveCount(0);
  await expect(recentRow).toHaveCount(1);
  await page
    .getByRole("button", { name: "View as supervisor", exact: true })
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
    .selectOption({ label: "GF5" });
  await expect(recentRow).toHaveCount(1);
  await page.getByLabel("Date", { exact: true }).fill("2000-01-01");
  await expect(recentRow).toHaveCount(0);
  await page.getByLabel("Date", { exact: true }).fill("");
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
  await page
    .getByRole("button", { name: "Back to marshal entry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delivery Records", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: earlySupplier }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: recentSupplier }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "View as supervisor", exact: true })
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
