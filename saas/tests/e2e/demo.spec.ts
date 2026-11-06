import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

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

async function noPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function navigate(page: Page, label: string) {
  const name = new RegExp(
    `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\d+)?$`,
  );
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name })
    .click();
}

async function openDemo(page: Page) {
  await page.goto("/demo");
  const profile = page.getByRole("button", {
    name: "B Traffic Marshal",
    exact: true,
  });
  const overview = page.getByRole("heading", {
    name: "Your site, at a glance",
  });
  await expect(profile.or(overview)).toBeVisible();
  if (await profile.isVisible()) await profile.click();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Demo role" })).toHaveValue(
    "gate",
  );
}

async function expectSquareProfileTiles(page: Page, role: "link" | "button") {
  for (const name of ["B Traffic Marshal", "Olamilekan Alaga"]) {
    const tile = page.getByRole(role, { name, exact: true });
    await expect(tile).toBeVisible();
    const box = await tile.locator(".demo-profile-square").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(64);
    expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
  }
  await noPageOverflow(page);
}

async function expectCreator(page: Page, ticket: string, creator: string) {
  await page.getByLabel("Search deliveries").fill(ticket);
  await page
    .getByRole("row")
    .filter({ hasText: ticket })
    .getByRole("button", { name: /^DL-/ })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .locator("dl > div")
      .filter({ hasText: "Gate employee" })
      .locator("dd"),
  ).toHaveText(creator);
  await page.getByRole("button", { name: "Close delivery" }).click();
}

async function changeRole(
  page: Page,
  role: "gate" | "supervisor" | "site_manager",
) {
  await page.getByRole("combobox", { name: "Demo role" }).selectOption(role);
  await expect(page.getByRole("combobox", { name: "Demo role" })).toHaveValue(
    role,
  );
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
}

async function captureDelivery(page: Page, ticket: string, withPhoto: boolean) {
  await page
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await page.getByRole("button", { name: "GF5", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Supplier", exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Vehicle registration", { exact: true })
    .fill("DEMO TEST");
  await page.getByLabel("Ticket number", { exact: true }).fill(ticket);
  await page.getByLabel("Ticket quantity", { exact: true }).fill("22.5");
  await page
    .getByRole("combobox", { name: "Quantity unit", exact: true })
    .selectOption("tonnes");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Fictional browser test. No actual delivery or company document.");
  if (withPhoto) {
    await page.getByLabel("Ticket photograph", { exact: true }).setInputFiles({
      name: "fictional-ticket.png",
      mimeType: "image/png",
      buffer: png,
    });
  }
  await noPageOverflow(page);
  await page
    .getByRole("button", { name: "Submit delivery", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delivery register", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /demo|browser|device|sample/i,
  );
  await expect(page.getByRole("status")).not.toContainText(
    /submitted to server/i,
  );
  await page.getByLabel("Search deliveries").fill(ticket);
  await expect(page.getByRole("row").filter({ hasText: ticket })).toHaveCount(
    1,
  );
}

test("public DJCU demo opens in one click without credentials or a backend session", async ({
  page,
  context,
  request,
}, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/DJCU/);
  const logo = page.locator('img[src="/djcu-logo.jpg"]:visible').first();
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator("body")).not.toContainText(/Site\s?Ledger/i);
  await expectSquareProfileTiles(page, "link");
  const apiRequests = monitorBackendRequests(page);
  await page
    .getByRole("link", { name: "B Traffic Marshal", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo(?:\?.*)?$/);
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Demo role" })).toHaveValue(
    "gate",
  );
  await expect(logo).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Site\s?Ledger/i);
  await expect(page.locator("body")).toContainText(/fictional/i);
  await expect(page.locator("body")).not.toContainText("Set APP_MODE");
  await noPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("djcu-demo.png"),
    fullPage: true,
  });
  expect(apiRequests).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
  // Entering the browser sandbox cannot unlock a real company API.
  const response = await request.get("/api/bootstrap");
  expect(response.status()).toBe(503);
});

test("fictional photo capture, supervisor decision, persistent report and CSV stay on this device", async ({
  page,
  context,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  await openDemo(page);
  const ticket = `DEMO-${randomUUID().slice(0, 8)}`;
  await captureDelivery(page, ticket, true);
  const row = page.getByRole("row").filter({ hasText: ticket });
  await expect(row.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(row).toContainText("1 evidence file");
  await row.getByRole("button", { name: /^DL-/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Decision", exact: true }),
  ).toHaveCount(0);
  const evidence = page.getByRole("img", {
    name: "ticket evidence: fictional-ticket.png",
    exact: true,
  });
  await expect(evidence).toBeVisible();
  await expect(evidence).toHaveJSProperty("naturalWidth", 1);
  await page.getByRole("button", { name: "Close delivery" }).click();

  await changeRole(page, "supervisor");
  await navigate(page, "Verification queue");
  await page.getByLabel("Search deliveries").fill(ticket);
  await page
    .getByRole("row")
    .filter({ hasText: ticket })
    .getByRole("button", { name: /^DL-/ })
    .click();
  await page
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("Accepted");
  await page.getByLabel("Accepted quantity", { exact: true }).fill("21");
  await page
    .getByRole("checkbox", {
      name: "I independently confirm physical receipt of this delivery.",
    })
    .check();
  await page
    .getByLabel("Reason / supporting notes", { exact: true })
    .fill(
      "Fictional supervisor check: accepted 21 tonnes; ticket still claims 22.5.",
    );
  await page
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/decision saved/i);

  await changeRole(page, "site_manager");
  await navigate(page, "Daily reports");
  await expect(page.getByRole("row").filter({ hasText: ticket })).toContainText(
    "Accepted",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain(ticket);
  expect(csv).toContain("22.5");
  expect(csv).toContain("21");
  expect(csv).toContain("Accepted");
  await page
    .getByRole("row")
    .filter({ hasText: ticket })
    .getByRole("button", { name: /^DL-/ })
    .click();
  const detail = page.getByRole("dialog");
  await expect(
    detail
      .locator("dl > div")
      .filter({ hasText: "Ticket quantity (original claim)" }),
  ).toContainText("22.5 tonnes");
  await expect(
    detail.locator("dl > div").filter({ hasText: "Accepted quantity" }),
  ).toContainText("21 tonnes");
  await page.getByRole("button", { name: "Close delivery" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await navigate(page, "Delivery register");
  await page.getByLabel("Search deliveries").fill(ticket);
  await expect(page.getByRole("row").filter({ hasText: ticket })).toContainText(
    "Accepted",
  );
  await noPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("djcu-accepted-delivery.png"),
    fullPage: true,
  });
  expect(apiRequests).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
});

test("manual demo capture survives reload and reset restores only fictional samples", async ({
  page,
}) => {
  const apiRequests = monitorBackendRequests(page);
  await openDemo(page);
  const ticket = `MANUAL-${randomUUID().slice(0, 8)}`;
  await captureDelivery(page, ticket, false);
  await expect(page.getByRole("row").filter({ hasText: ticket })).toContainText(
    "0 evidence files",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await navigate(page, "Delivery register");
  await page.getByLabel("Search deliveries").fill(ticket);
  await expect(page.getByRole("row").filter({ hasText: ticket })).toHaveCount(
    1,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await navigate(page, "Delivery register");
  await page.getByLabel("Search deliveries").fill(ticket);
  await expect(page.getByRole("row").filter({ hasText: ticket })).toHaveCount(
    0,
  );
  await page.getByLabel("Search deliveries").fill("");
  await expect(
    page.getByRole("table").getByText("Accepted", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("Rejected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("Flagged", { exact: true }),
  ).toBeVisible();
  await noPageOverflow(page);
  expect(apiRequests).toEqual([]);
});

test("square marshal profiles open without credentials and preserve each delivery's original author", async ({
  page,
  context,
}, testInfo) => {
  const apiRequests = monitorBackendRequests(page);
  await page.goto("/demo");
  await expectSquareProfileTiles(page, "button");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("djcu-marshal-profiles.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".demo-toolbar")
      .getByText("Olamilekan Alaga", { exact: true }),
  ).toBeVisible();
  const olamilekanTicket = `OLAM-${randomUUID().slice(0, 8)}`;
  await captureDelivery(page, olamilekanTicket, false);
  await expectCreator(page, olamilekanTicket, "Olamilekan Alaga");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".demo-toolbar")
      .getByText("Olamilekan Alaga", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Switch marshal", exact: true }).click();
  await expectSquareProfileTiles(page, "button");
  await page
    .getByRole("button", { name: "B Traffic Marshal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".demo-toolbar")
      .getByText("B Traffic Marshal", { exact: true }),
  ).toBeVisible();
  const bTicket = `B-${randomUUID().slice(0, 8)}`;
  await captureDelivery(page, bTicket, false);
  await expectCreator(page, bTicket, "B Traffic Marshal");
  await expectCreator(page, olamilekanTicket, "Olamilekan Alaga");
  await noPageOverflow(page);
  expect(apiRequests).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
});
