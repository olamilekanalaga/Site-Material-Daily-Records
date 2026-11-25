import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Bootstrap, Marshal } from "../../src/lib/types";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);
type BoundMarshal = Marshal & { can_record?: boolean; user_id?: string | null };

test.use({ timezoneId: "America/Los_Angeles" });

async function bootstrap(page: Page) {
  const response = await page.request.get("/api/bootstrap");
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Bootstrap;
}
async function login(page: Page, role: "gate" | "supervisor" = "gate") {
  await page.goto(role === "gate" ? "/sign-in/marshal" : "/sign-in/supervisor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${role}@demo.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(role === "gate" ? /\/gate$/ : /\/records$/);
  return bootstrap(page);
}
async function selectOwnMarshal(page: Page, data?: Bootstrap) {
  const boot = data || (await bootstrap(page));
  const own = (boot.marshals || []).filter(
    (item) => (item as BoundMarshal).can_record,
  );
  expect(own).toHaveLength(1);
  expect((own[0] as BoundMarshal).user_id).toBe(boot.actor.id);
  await page.getByRole("button", { name: own[0].name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New Delivery", exact: true }),
  ).toBeVisible();
  return own[0];
}
const materialSelect = (page: Page) =>
  page.getByRole("combobox", { name: "Material", exact: true });
const supplierSelect = (page: Page) =>
  page.getByRole("combobox", {
    name: /^Supplier \/ Company name(?: \(if known\))?$/,
  });
async function chooseMaterial(page: Page, name: string) {
  await materialSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search materials", exact: true })
    .fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}
async function newMaterial(page: Page, name: string) {
  await materialSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search materials", exact: true })
    .fill(name);
  await page
    .getByRole("option", { name: "Other — Enter new material", exact: true })
    .click();
  await page.getByLabel("New material name", { exact: true }).fill(name);
}
async function newSupplier(page: Page, name: string) {
  await supplierSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search suppliers", exact: true })
    .fill(name);
  await page
    .getByRole("option", { name: "Other — Enter new supplier", exact: true })
    .click();
  await page.getByLabel("New supplier name", { exact: true }).fill(name);
}
async function attach(page: Page) {
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "test-ticket.png",
    mimeType: "image/png",
    buffer: png,
  });
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Delivery saved");
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
const records = (page: Page) =>
  page.getByRole("table", { name: "Saved delivery records", exact: true });

// The role and profile cards are different controls: a photo never grants access.
test("authorised gate accounts see both square profiles but can record only as their bound marshal", async ({
  page,
}, info) => {
  const boot = await login(page);
  expect(boot.marshals).toHaveLength(2);
  const own = boot.marshals!.find((item) => (item as BoundMarshal).can_record)!;
  const colleague = boot.marshals!.find((item) => item.id !== own.id)!;
  await expect(
    page.getByRole("button", { name: own.name, exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: colleague.name, exact: true }),
  ).toBeDisabled();
  for (const person of boot.marshals!) {
    const card = page.getByRole("button", { name: person.name, exact: true });
    await expect(card.locator("img")).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
  }
  await page.screenshot({
    path: info.outputPath("live-profile-permissions.png"),
    fullPage: true,
  });
  await selectOwnMarshal(page, boot);
  await expect(page.getByLabel("Delivery time", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel(
      /vehicle registration|invoice number|tonnage|quantity|price/i,
    ),
  ).toHaveCount(0);
  await chooseMaterial(page, "6F5");
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("Aggregates / Sands");
  await expect(
    page.locator('[aria-label="Automatic classification"]'),
  ).toHaveText("Aggregates / Sands · Delivery");
  const supplier = boot.suppliers.find((item) => item.active)!;
  await supplierSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search suppliers", exact: true })
    .fill(supplier.name);
  await page.getByRole("option", { name: supplier.name, exact: true }).click();
  await page
    .getByRole("button", { name: "Save Delivery", exact: true })
    .click();
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /image|photo/i,
  );
  await expect(page.getByText("Delivery saved", { exact: false })).toHaveCount(
    0,
  );
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /JPEG|PNG|WebP|image/i,
  );
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]),
  });
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /3\s*MiB|too large|size/i,
  );
  await noOverflow(page);
});

test("a failed upload resumes one server record and a separate supervisor can read its private photo", async ({
  page,
  browser,
}, info) => {
  const boot = await login(page);
  const own = await selectOwnMarshal(page, boot);
  const supplier = `Upload recovery ${randomUUID().slice(0, 8)}`;
  await chooseMaterial(page, "6F5");
  await newSupplier(page, supplier);
  await attach(page);
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
          error: "Test connection loss. Retry the pending photo.",
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
  const pending = (await bootstrap(page)).deliveries.filter(
    (record) => record.supplier_name === supplier,
  );
  expect(pending).toHaveLength(1);
  expect(pending[0].submitted_at).toBeNull();
  await page.reload();
  await selectOwnMarshal(page);
  await expect(
    page.getByLabel("New supplier name", { exact: true }),
  ).toHaveValue(supplier);
  await save(page);
  expect(new Set(submittedIds).size).toBe(1);
  await expect(page.getByLabel("Delivery image", { exact: true })).toHaveValue(
    "",
  );
  const state = await bootstrap(page);
  const matches = state.deliveries.filter(
    (record) => record.supplier_name === supplier,
  );
  expect(matches).toHaveLength(1);
  expect(matches[0].marshal_id).toBe(own.id);
  expect(matches[0].created_by).toBe(boot.actor.id);
  expect(matches[0].evidence).toHaveLength(1);
  expect(matches[0].submitted_at).toBeTruthy();
  await page.getByRole("button", { name: "View Records", exact: true }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(
    records(page).getByRole("row").filter({ hasText: supplier }),
  ).toHaveCount(1);

  const supervisorContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const supervisorPage = await supervisorContext.newPage();
  try {
    await login(supervisorPage, "supervisor");
    await expect(
      supervisorPage.getByRole("heading", {
        name: "New Delivery",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      supervisorPage.getByRole("button", {
        name: "Record New Delivery",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(records(supervisorPage).getByRole("columnheader")).toHaveText([
      "Date",
      "Time",
      "Material",
      "Supplier",
      "Marshal",
      "Photo",
    ]);
    const row = records(supervisorPage)
      .getByRole("row")
      .filter({ hasText: supplier });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(own.name);
    await row.getByRole("button", { name: "View photo", exact: true }).click();
    const photo = supervisorPage.getByRole("dialog").getByRole("img");
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty("naturalWidth", 1);
    await supervisorPage
      .getByRole("button", { name: "Close photo", exact: true })
      .click();
    await supervisorPage.reload();
    await expect(row).toHaveCount(1);
    await noOverflow(supervisorPage);
    await supervisorPage.screenshot({
      path: info.outputPath("live-supervisor-records.png"),
      fullPage: true,
    });
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.get(
            `http://127.0.0.1:3100/api/evidence/${matches[0].evidence[0].id}`,
          )
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    await supervisorContext.close();
  }
});

test("new material and supplier names survive refresh, remain reusable while pending and filter the CSV", async ({
  page,
  browser,
}, info) => {
  await login(page);
  await selectOwnMarshal(page);
  const suffix = randomUUID().slice(0, 8);
  const material = `Test panel ${suffix}`;
  const supplier = `Test supplier ${suffix}`;
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Other Materials" });
  await newMaterial(page, material);
  await expect(
    page.locator('[aria-label="Automatic classification"]'),
  ).toContainText("Pending classification");
  await newSupplier(page, supplier);
  await page.getByLabel("Correct delivery time", { exact: true }).check();
  const correctedAt = new Date(Date.now() - 60 * 60 * 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(correctedAt)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  await page.getByLabel("Delivery date", { exact: true }).fill(date);
  await page.getByLabel("Delivery time", { exact: true }).fill(time);
  await page
    .getByLabel("Reason for time correction", { exact: true })
    .fill("Entered after the queue cleared");
  await attach(page);
  await save(page);
  const firstState = await bootstrap(page);
  const first = firstState.deliveries.find(
    (record) => record.item_name === material,
  )!;
  expect(first).toBeTruthy();
  expect(first.entry_type).toBe("Pending review");
  expect(
    firstState.materials.find((item) => item.id === first.material_id)
      ?.approval_status,
  ).toBe("Pending");
  expect(Date.parse(first.recorded_at!)).toBeGreaterThan(
    Date.parse(first.arrival_at) + 30 * 60 * 1000,
  );
  expect(first.created_at).toBe(first.recorded_at);
  await page.reload();
  await selectOwnMarshal(page);
  await materialSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search materials", exact: true })
    .fill(suffix);
  await page.getByRole("option").filter({ hasText: material }).click();
  await supplierSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search suppliers", exact: true })
    .fill(suffix);
  await page.getByRole("option", { name: supplier, exact: true }).click();
  await attach(page);
  await save(page);
  const finalState = await bootstrap(page);
  const repeated = finalState.deliveries.filter(
    (record) =>
      record.material_id === first.material_id &&
      record.supplier_id === first.supplier_id &&
      record.submitted_at,
  );
  expect(repeated).toHaveLength(2);
  expect(
    finalState.materials.filter((item) => item.id === first.material_id),
  ).toHaveLength(1);
  expect(
    finalState.suppliers.filter((item) => item.id === first.supplier_id),
  ).toHaveLength(1);
  const supervisorContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const supervisorPage = await supervisorContext.newPage();
  try {
    await login(supervisorPage, "supervisor");
    await supervisorPage.getByLabel("From date", { exact: true }).fill(date);
    await supervisorPage
      .getByLabel("To date", { exact: true })
      .fill(
        new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
          new Date(),
        ),
      );
    await supervisorPage
      .getByRole("combobox", { name: "Material", exact: true })
      .selectOption({ value: first.material_id });
    await supervisorPage
      .getByRole("combobox", { name: "Supplier", exact: true })
      .selectOption({ value: first.supplier_id! });
    await expect(records(supervisorPage).locator("tbody tr")).toHaveCount(2);
    const displayedTimes = await records(supervisorPage)
      .locator("tbody time")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("datetime")),
      );
    expect(displayedTimes).toEqual(
      [...repeated]
        .sort(
          (a, b) =>
            Date.parse(b.arrival_at) - Date.parse(a.arrival_at) ||
            Date.parse(b.recorded_at || b.created_at) -
              Date.parse(a.recorded_at || a.created_at) ||
            b.id.localeCompare(a.id),
        )
        .map((record) => record.arrival_at),
    );
    await expect(
      records(supervisorPage).getByText("Corrected time", { exact: true }),
    ).toHaveCount(1);
    const downloadReady = supervisorPage.waitForEvent("download");
    await supervisorPage
      .getByRole("button", { name: "Export CSV", exact: true })
      .click();
    const download = await downloadReady;
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv).toContain(material);
    expect(csv).toContain(supplier);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(3);
    await supervisorPage
      .getByLabel("From date", { exact: true })
      .fill("2000-01-01");
    await supervisorPage
      .getByLabel("To date", { exact: true })
      .fill("2000-01-01");
    await expect(records(supervisorPage).locator("tbody tr")).toHaveCount(0);
    await noOverflow(supervisorPage);
    await supervisorPage.screenshot({
      path: info.outputPath("live-filtered-records.png"),
      fullPage: true,
    });
  } finally {
    await supervisorContext.close();
  }
});

test("staff sign-in entrances enforce assigned roles and sign-out removes private access", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Traffic Marshal sign-in", exact: true }),
  ).toHaveAttribute("href", "/sign-in/marshal");
  await expect(
    page.getByRole("link", {
      name: "Supervisor / Site Manager sign-in",
      exact: true,
    }),
  ).toHaveAttribute("href", "/sign-in/supervisor");
  await page.goto("/sign-in/supervisor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("gate@demo.invalid");
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".login-form").getByRole("alert")).toContainText(
    /not approved|not permitted|not authorised/i,
  );
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("supervisor@demo.invalid");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Record New Delivery", exact: true }),
  ).toHaveCount(0);
  const logoutComplete = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/logout" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await logoutComplete).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get("/api/bootstrap")).status()).toBe(401);
  await page.goto("/records");
  await expect(records(page)).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Sign-in options", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "Supervisor / Site Manager sign-in",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("live-authenticated-portals.png"),
    fullPage: true,
  });
});
