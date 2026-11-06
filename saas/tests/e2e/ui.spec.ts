import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);

// Site time must remain correct even when the device uses another time zone.
test.use({ timezoneId: "America/Los_Angeles" });

async function login(page: Page, role: "gate" | "supervisor" = "gate") {
  await page.goto("/");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("simple-login.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${role}@demo.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: role === "gate" ? "Sign in as" : "Daily Records",
      exact: true,
    }),
  ).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

async function selectMarshal(page: Page) {
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Record New Delivery", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Record Delivery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
}

async function fillDelivery(page: Page, supplier: string) {
  await page
    .getByRole("combobox", { name: "Material name", exact: true })
    .selectOption({ label: "6F5" });
  await page
    .getByLabel("Supplier / Company name", { exact: true })
    .fill(supplier);
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "fictional-load.png",
    mimeType: "image/png",
    buffer: png,
  });
}

test("marshal selection opens clean records before a separate delivery form with validation", async ({
  page,
}, testInfo) => {
  const creations: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/log-deliveries"
    )
      creations.push(request.url());
  });
  await login(page);
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
  await expect(page.getByText(/^Traffic Marshal Unit$/i)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".simple-workspace-bar, .simple-footer"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Home", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Daily Records", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Verification queue" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Daily reports" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("simple-home.png"),
    fullPage: true,
  });
  await selectMarshal(page);
  await page.screenshot({
    path: testInfo.outputPath("simple-delivery-form.png"),
    fullPage: true,
  });
  const state = await (await page.request.get("/api/bootstrap")).json();
  const timeAt = (instant: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: state.sites[0].timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  expect([
    timeAt(new Date(Date.now() - 60_000)),
    timeAt(new Date()),
    timeAt(new Date(Date.now() + 60_000)),
  ]).toContain(await page.getByLabel(/^Delivery time/).inputValue());
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.getByText("Delivery saved", { exact: false })).toHaveCount(
    0,
  );
  await page
    .getByRole("combobox", { name: "Material name", exact: true })
    .selectOption({ label: "6F5" });
  await page
    .getByLabel("Supplier / Company name", { exact: true })
    .fill("Fictional validation supplier");
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /image|photo/i,
  );
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "fictional-document.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Not an image"),
  });
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /JPEG|PNG|WebP|image/i,
  );
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "too-large.png",
    mimeType: "image/png",
    buffer: Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]),
  });
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /3\s*(?:Mi?B|megabytes)|too large|size/i,
  );
  expect(creations).toEqual([]);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("simple-delivery-validation.png"),
    fullPage: true,
  });
});

test("failed photo upload retries one persisted record that an authenticated supervisor can privately view", async ({
  page,
  browser,
}, testInfo) => {
  await login(page);
  await selectMarshal(page);
  const supplier = `Fictional retry ${randomUUID().slice(0, 8)}`;
  await fillDelivery(page, supplier);
  const submittedIds: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/log-deliveries"
    )
      submittedIds.push(request.postDataJSON().id);
  });
  await page.route(
    "**/api/deliveries/*/evidence",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Fictional connection loss. Please retry.",
        }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /connection loss|retry/i,
  );
  await expect(page.getByText("Delivery saved", { exact: false })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Back to Records", exact: true })
    .click();
  await expect(page.getByRole("row").filter({ hasText: supplier })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
  await selectMarshal(page);
  await expect(
    page.getByLabel("Supplier / Company name", { exact: true }),
  ).toHaveValue(supplier);
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Delivery saved");
  await expect(
    page.getByLabel("Supplier / Company name", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Material name", exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Delivery image", { exact: true })).toHaveValue(
    "",
  );
  expect(submittedIds.length).toBeGreaterThanOrEqual(2);
  expect(new Set(submittedIds).size).toBe(1);
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: supplier });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("6F5");
  await expect(row).toContainText("Olamilekan Alaga");
  const state = await (await page.request.get("/api/bootstrap")).json();
  const matches = state.deliveries.filter(
    (record: { supplier_name?: string }) => record.supplier_name === supplier,
  );
  expect(matches).toHaveLength(1);
  expect(matches[0].created_by).toBe(state.actor.id);
  expect(matches[0].marshal_id).not.toBe(state.actor.id);
  expect(matches[0].evidence).toHaveLength(1);
  expect(matches[0].submitted_at).toBeTruthy();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("simple-delivery-records.png"),
    fullPage: true,
  });

  const reviewContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const reviewPage = await reviewContext.newPage();
  await login(reviewPage, "supervisor");
  await expect(
    reviewPage.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toHaveCount(0);
  await expect(
    reviewPage.getByRole("button", { name: "Olamilekan Alaga", exact: true }),
  ).toHaveCount(0);
  const supervisorRow = reviewPage
    .getByRole("row")
    .filter({ hasText: supplier });
  await expect(supervisorRow).toHaveCount(1);
  await supervisorRow
    .getByRole("button", { name: "View photo", exact: true })
    .click();
  const photo = reviewPage.getByRole("dialog").getByRole("img");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty("naturalWidth", 1);
  await reviewPage
    .getByRole("button", { name: "Close photo", exact: true })
    .click();
  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.get(
        `http://127.0.0.1:3100/api/evidence/${matches[0].evidence[0].id}`,
      )
    ).status(),
  ).toBe(401);
  await anonymous.close();
  await reviewContext.close();
  await page.reload();
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: supplier })).toHaveCount(
    1,
  );
});

test("separate staff sign-in forms enforce the chosen entrance and open the assigned role", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/sign-in/supervisor");
  await expect(
    page.getByRole("heading", {
      name: "Supervisor / Site Manager sign-in",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore demo", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("gate@demo.invalid");
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".login-form").getByRole("alert")).toContainText(
    /not approved for this sign-in entrance/i,
  );
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("supervisor@demo.invalid");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record New Delivery", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/sign-in/marshal");
  await expect(
    page.getByRole("heading", { name: "Traffic Marshal sign-in", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("gate@demo.invalid");
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in as", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Olamilekan Alaga", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Daily Records", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record New Delivery", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("approved-staff-portal.png"),
    fullPage: false,
  });
});
