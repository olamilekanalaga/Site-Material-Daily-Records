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
async function login(
  page: Page,
  role: "gate" | "supervisor" | "manager" = "gate",
) {
  await page.goto(role === "gate" ? "/sign-in/marshal" : "/sign-in/supervisor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${role}@demo.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(role === "gate" ? /\/gate$/ : /\/records$/);
  return bootstrap(page);
}
async function expectOwnMarshalForm(page: Page, data?: Bootstrap) {
  const boot = data || (await bootstrap(page));
  const own = (boot.marshals || []).filter(
    (item) => (item as BoundMarshal).can_record,
  );
  expect(own).toHaveLength(1);
  expect((own[0] as BoundMarshal).user_id).toBe(boot.actor.id);
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
  const direction = page.getByRole("combobox", {
    name: "Direction",
    exact: true,
  });
  if (!(await direction.inputValue())) await direction.selectOption("IN");
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

test("the dark opening follows workspace loading and the light screens keep scroll motion", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 420)
    await page.setViewportSize({ width: 393, height: viewport.height });
  const opening = page.locator("[data-opening-reveal]");
  let releaseBootstrap = () => {};
  const bootstrapping = new Promise<void>((resolve) => {
    releaseBootstrap = resolve;
  });
  await page.route(
    "**/api/bootstrap",
    async (route) => {
      await bootstrapping;
      await route.continue();
    },
    { times: 1 },
  );
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(opening).toBeAttached();
    await expect(opening).toHaveCSS("pointer-events", "none");
    await expect(opening).toHaveCSS("animation-name", "none");
    await expect(opening.locator("img").locator("..")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(opening.locator("img")).toHaveAttribute(
      "src",
      "/djcu-logo.jpg",
    );
    await expect(page.getByText("Opening DJ Civils…")).toHaveCount(0);
    await page.waitForTimeout(2300);
    await expect(opening).toBeVisible();
  } finally {
    releaseBootstrap();
  }
  await expect(opening).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "DJ Civils Ltd", exact: true }),
  ).toBeVisible();
  const email = page.getByRole("textbox", {
    name: "Email address",
    exact: true,
  });
  await expect(email).toBeEditable();
  await expect(email).toHaveCSS("background-color", "rgb(255, 255, 255)");
  if (viewport && viewport.width <= 420) {
    await page.setViewportSize({ width: 320, height: viewport.height });
    await noOverflow(page);
    await expect(email).toBeEditable();
    await page.setViewportSize({ width: 393, height: viewport.height });
  }
  await page.reload();
  await expect(email).toBeEditable();
  await expect(opening).toHaveCount(0);

  const reduced = await context.newPage();
  try {
    await reduced.emulateMedia({ reducedMotion: "reduce" });
    await reduced.goto("/");
    await expect(
      reduced.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
    await expect(reduced.locator("[data-opening-reveal]")).toHaveCount(0);
    await expect(reduced.locator("[data-scroll-progress]")).toBeHidden();
  } finally {
    await reduced.close();
  }

  const current = page.viewportSize();
  if (current)
    await page.setViewportSize({ width: current.width, height: 640 });
  await login(page);
  await expectOwnMarshalForm(page);
  const masthead = page.locator("[data-scroll-masthead]");
  const progress = page.locator("[data-scroll-progress]");
  await expect(page.locator(".simple-entry")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.evaluate(() => window.scrollTo(0, 160));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      masthead.evaluate((el) =>
        parseFloat(el.style.getPropertyValue("--masthead-shift")),
      ),
    )
    .toBeGreaterThan(0);
  await expect(progress).not.toHaveCSS("transform", "matrix(0, 0, 0, 1, 0, 0)");
  await noOverflow(page);

  await login(page, "manager");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".simple-records-panel")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(
    page.getByRole("button", { name: "Record New Delivery", exact: true }),
  ).toHaveCount(0);
  const views = page.getByRole("navigation", { name: "Movement views" });
  await views.getByRole("button", { name: "Aggregate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aggregate records" }),
  ).toBeVisible();
  await expect(records(page).getByRole("columnheader").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});

test("authorised gate accounts open the delivery form as their bound marshal", async ({
  page,
}) => {
  const boot = await login(page);
  const own = await expectOwnMarshalForm(page, boot);
  await expect(page.getByText(`Recording for ${own.name}`)).toBeVisible();
  await expect(page.locator(".simple-marshal-grid")).toHaveCount(0);
  await expect(page.getByLabel("Actual time", { exact: true })).toBeHidden();
  await expect(page.getByLabel(/tonnage/i)).toHaveCount(0);
  const category = page.getByRole("combobox", {
    name: "Category",
    exact: true,
  });
  await category.selectOption("Concrete");
  await expect(page.getByLabel("Mix", { exact: true })).toHaveJSProperty(
    "required",
    true,
  );
  await expect(
    page.getByLabel("Tonnage (t)", { exact: true }),
  ).toHaveJSProperty("required", true);
  await category.selectOption("Services");
  await expect(
    page.getByRole("combobox", { name: "Service", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Mix", { exact: true })).toHaveCount(0);
  await category.selectOption("");
  const direction = page.getByRole("combobox", {
    name: "Direction",
    exact: true,
  });
  await expect(direction).toHaveValue("");
  await expect(direction).toHaveJSProperty("required", true);
  await direction.selectOption("OUT");
  await chooseMaterial(page, "6F5");
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("Aggregates / Sands");
  await expect(
    page.locator('[aria-label="Automatic classification"]'),
  ).toHaveText("Aggregate · Delivery");
  const saveButton = page.getByRole("button", {
    name: "Save Delivery",
    exact: true,
  });
  await expect(saveButton).toHaveAttribute("data-ready", "false");
  const incompleteColor = await saveButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  await saveButton.click();
  await expect(supplierSelect(page)).toBeFocused();
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    "Choose a supplier",
  );
  const supplier = boot.suppliers.find((item) => item.active)!;
  await supplierSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search suppliers", exact: true })
    .fill(supplier.name);
  await page.getByRole("option", { name: supplier.name, exact: true }).click();
  await saveButton.click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    "Add a delivery image",
  );
  await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator(".simple-entry").getByRole("alert")).toContainText(
    /JPEG|PNG|WebP|image/i,
  );
  await attach(page);
  await expect(saveButton).toHaveAttribute("data-ready", "true");
  await expect(saveButton).not.toHaveCSS("background-color", incompleteColor);
  await page.getByText("Enter actual time (optional)", { exact: true }).click();
  await page
    .getByLabel("Actual date (defaults to today)", { exact: true })
    .fill("2025-11-05");
  await page.getByLabel("Actual time", { exact: true }).fill("07:00");
  await attach(page);
  const submitted = page.waitForResponse((response) => {
    const request = response.request();
    return (
      new URL(request.url()).pathname === "/api/log-deliveries" &&
      request.method() === "POST" &&
      request.postDataJSON().intent === "submit"
    );
  });
  await save(page);
  const { delivery } = await (await submitted).json();
  expect(delivery.arrival_at).toBe("2025-11-05T07:00:00.000Z");
  expect(delivery.correction_reason).toBe("Arrival time entered manually");
  expect(Date.parse(delivery.recorded_at)).toBeGreaterThan(
    Date.parse(delivery.arrival_at),
  );
  await page.getByRole("link", { name: "Records", exact: true }).click();
  const views = page.getByRole("navigation", { name: "Movement views" });
  await expect(views.getByRole("button")).toHaveText([
    "Overview",
    "Aggregate",
    "Concrete",
    "Material",
    "Service",
    "Hire",
  ]);
  await expect(views.getByRole("button", { name: "Overview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if ((page.viewportSize()?.width ?? 0) <= 420) {
    await expect(views).toHaveCSS("overflow-x", "auto");
    await views.evaluate((nav) => nav.scrollTo({ left: nav.scrollWidth }));
    await expect
      .poll(() => views.evaluate((nav) => nav.scrollLeft))
      .toBeGreaterThan(0);
    await views.evaluate((nav) => nav.scrollTo({ left: 0 }));
  }
  const summary = page.getByRole("region", { name: "Overview counts" });
  await expect(summary.locator("dt")).toHaveText([
    "Total records",
    "Aggregate",
    "Concrete",
    "Material",
    "Service",
    "Hire",
  ]);
  const total = summary.locator("dd").first();
  await expect(total).not.toHaveText("0");
  await expect(page.getByText(/^All time ·/)).toBeVisible();
  const historical = records(page)
    .getByText("5 Nov 2025 · 07:00", { exact: true })
    .first();
  await expect(historical).toBeVisible();
  await expect(views).not.toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(views).toHaveCSS("animation-name", "none");
  await page.locator("summary").getByText("Filters", { exact: true }).click();
  const categoryFilter = page.getByRole("combobox", {
    name: "Category",
    exact: true,
  });
  await expect(categoryFilter.getByRole("option")).toHaveText([
    "All categories",
    "Aggregate",
    "Concrete",
    "Material",
    "Service",
    "Hire",
  ]);
  await expect(
    page.getByRole("combobox", { name: "Item", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Supplier", exact: true }),
  ).toHaveCount(0);
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 420) {
    await page.setViewportSize({ width: 320, height: viewport.height });
    await expect(categoryFilter).toBeVisible();
    await noOverflow(page);
    await page.setViewportSize(viewport);
  }
  await categoryFilter.focus();
  await expect(categoryFilter).toBeFocused();
  await categoryFilter.selectOption("Service");
  await expect(historical).toHaveCount(0);
  await categoryFilter.selectOption("Aggregate");
  await expect(historical).toBeVisible();
  await page.getByLabel("From date", { exact: true }).fill("2000-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2000-01-01");
  await expect(historical).toHaveCount(0);
  await expect(total).toHaveText("0");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(categoryFilter).toHaveValue("");
  await expect(historical).toBeVisible();
  await expect(total).not.toHaveText("0");
  await noOverflow(page);
});

test("Hire movements stay separate from Service and appear in Hire exports", async ({
  page,
  browser,
}) => {
  await login(page);
  await expectOwnMarshalForm(page);
  const item = `Hired excavator ${randomUUID().slice(0, 8)}`;
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Hire");
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("OUT");
  const hireItems = page.getByRole("combobox", {
    name: "Hire item",
    exact: true,
  });
  await hireItems.click();
  await page
    .getByRole("option", { name: "Enter a new hire item", exact: true })
    .click();
  await page.getByLabel("New hire item name", { exact: true }).fill(item);
  await newSupplier(page, "Local plant hire");
  await attach(page);
  await save(page);
  await page.reload();
  await expectOwnMarshalForm(page);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Hire");
  await hireItems.click();
  await expect(
    page.getByRole("option", { name: item, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  const views = page.getByRole("navigation", { name: "Movement views" });
  const row = records(page).getByRole("row").filter({ hasText: item });
  await page.locator("summary").getByText("Filters", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Hire");
  await expect(row).toContainText("OUT");
  await views.getByRole("button", { name: "Service", exact: true }).click();
  await expect(row).toHaveCount(0);
  await views.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(row).toContainText("OUT");
  await expect(
    records(page).getByRole("columnheader", { name: "Hire item" }),
  ).toBeVisible();

  const context = await browser.newContext();
  try {
    const supervisor = await context.newPage();
    await login(supervisor, "supervisor");
    const exportResponse = await supervisor.request.get(
      "/api/reports?view=arrivals&format=csv&movement_view=Hire",
    );
    expect(exportResponse.ok()).toBe(true);
    const csv = await exportResponse.text();
    expect(csv.split(/\r?\n/).find((line) => line.includes(item))).toContain(
      ',"Hire",',
    );
  } finally {
    await context.close();
  }
});

test("a failed upload resumes one server record and a separate supervisor can read its private photo", async ({
  page,
  browser,
}, info) => {
  const boot = await login(page);
  const own = await expectOwnMarshalForm(page, boot);
  const supplier = `Upload recovery ${randomUUID().slice(0, 8)}`;
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("OUT");
  await chooseMaterial(page, "6F5");
  await newSupplier(page, supplier);
  const originalSize = await page
    .getByLabel("Delivery image", { exact: true })
    .evaluate(async (input: HTMLInputElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = 2200;
      canvas.height = 1700;
      const context = canvas.getContext("2d")!;
      const pixels = context.createImageData(canvas.width, canvas.height);
      let seed = 17;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i] = seed >>> 24;
        pixels.data[i + 1] = (seed >>> 16) & 255;
        pixels.data[i + 2] = (seed >>> 8) & 255;
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const image = await new Promise<Blob>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!), "image/png"),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([image], "high-resolution-ticket.png", { type: "image/png" }),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return image.size;
    });
  expect(originalSize).toBeGreaterThan(3 * 1024 * 1024);
  const submittedIds: string[] = [];
  const deviceTimes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/log-deliveries"
    ) {
      const input = request.postDataJSON();
      submittedIds.push(input.id);
      deviceTimes.push(input.device_arrival_at);
    }
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
  await expectOwnMarshalForm(page);
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
  expect(new Set(deviceTimes)).toEqual(new Set([matches[0].arrival_at]));
  expect(matches[0].evidence[0].size).toBeLessThanOrEqual(500_000);
  expect(matches[0].evidence[0].mime).toBe("image/jpeg");
  expect(matches[0].marshal_id).toBe(own.id);
  expect(matches[0].created_by).toBe(boot.actor.id);
  expect(matches[0].evidence).toHaveLength(1);
  expect(matches[0].submitted_at).toBeTruthy();
  const navigation = page.getByRole("navigation", {
    name: "Traffic marshal navigation",
  });
  await expect(
    page.getByRole("button", { name: "View Records", exact: true }),
  ).toHaveCount(0);
  await navigation
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  const counts = page.getByRole("table", { name: "My saved record counts" });
  await expect(counts.getByRole("columnheader")).toHaveText([
    "Category",
    "IN",
    "OUT",
    "Total",
  ]);
  const period = page.getByRole("combobox", {
    name: "Reporting period",
    exact: true,
  });
  await expect(period).toHaveValue("Today");
  await expect(period.getByRole("option")).toHaveText([
    "Today",
    "Custom dates",
  ]);
  await period.selectOption("Custom dates");
  await page.getByLabel("From date", { exact: true }).fill("2000-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2000-01-01");
  await expect(
    counts.getByRole("row", { name: "Total saved 0 0 0" }),
  ).toBeVisible();
  await noOverflow(page);
  await period.selectOption("Today");
  await expect(page.getByLabel("From date", { exact: true })).toBeHidden();
  await expect(page.getByLabel("To date", { exact: true })).toBeHidden();
  await counts.getByRole("button", { name: "Aggregate" }).click();
  await expect(
    page
      .getByRole("table", { name: "My saved record details" })
      .getByRole("row")
      .filter({ hasText: supplier }),
  ).toContainText("OUT");
  await expect(
    navigation.getByRole("link", { name: "Home", exact: true }),
  ).toHaveAttribute("href", "/gate");
  await navigation.getByRole("link", { name: "Records", exact: true }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(navigation).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  const marshalFilters = page
    .locator("summary")
    .getByText("Filters", { exact: true });
  const marshalViews = page.getByRole("navigation", { name: "Movement views" });
  await expect(
    marshalViews.getByRole("button", { name: "Overview" }),
  ).toHaveAttribute("aria-pressed", "true");
  await marshalViews.getByRole("button", { name: "Service" }).click();
  await expect(
    page.getByRole("heading", { name: "Service records" }),
  ).toBeVisible();
  await expect(
    records(page).getByRole("columnheader", { name: "Provider" }),
  ).toBeVisible();
  await marshalViews.getByRole("button", { name: "Aggregate" }).click();
  const materialCards = page.getByRole("region", {
    name: "Aggregate counts",
  });
  await expect(materialCards.getByText("6F5", { exact: true })).toBeVisible();
  await expect(materialCards).toHaveCSS("overflow-x", "auto");
  await expect(
    page.getByRole("button", { name: "Last month", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("From date", { exact: true })).toBeHidden();
  await marshalFilters.click();
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("IN");
  await marshalFilters.click();
  await expect(
    records(page).getByRole("row").filter({ hasText: supplier }),
  ).toHaveCount(0);
  await marshalFilters.click();
  await expect(
    page.getByRole("combobox", { name: "Direction", exact: true }),
  ).toHaveValue("IN");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
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
      "Marshal",
      "Direction",
      "Item",
      "Supplier / provider",
      "Date & time",
      "Photo",
    ]);
    const row = records(supervisorPage)
      .getByRole("row")
      .filter({ hasText: supplier });
    await expect(row).toHaveCount(1);
    await supervisorPage
      .locator("summary")
      .getByText("Filters", { exact: true })
      .click();
    await supervisorPage
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("Aggregate");
    const visibleRows = await records(supervisorPage)
      .locator("tbody tr")
      .count();
    const downloadReady = supervisorPage.waitForEvent("download");
    await supervisorPage
      .getByRole("button", { name: "Export CSV", exact: true })
      .click();
    const download = await downloadReady;
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv).toContain(supplier);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(visibleRows + 1);
    const movementViews = supervisorPage.getByRole("navigation", {
      name: "Movement views",
    });
    const fromDate = supervisorPage.getByLabel("From date", { exact: true });
    await movementViews.getByRole("button", { name: "Concrete" }).click();
    const initialDate = await fromDate.inputValue();
    await expect(row).toHaveCount(0);
    await expect(
      records(supervisorPage).getByRole("columnheader", { name: "Mix" }),
    ).toBeVisible();
    await expect(
      records(supervisorPage).getByRole("columnheader", { name: "Tonnage" }),
    ).toBeVisible();
    await movementViews.getByRole("button", { name: "Service" }).click();
    await expect(row).toHaveCount(0);
    await expect(fromDate).toHaveValue(initialDate);
    await expect(records(supervisorPage).getByRole("columnheader")).toHaveCount(
      6,
    );
    await movementViews.getByRole("button", { name: "Aggregate" }).click();
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(own.name);
    await expect(row.getByText("OUT", { exact: true })).toHaveCSS(
      "background-color",
      "rgb(252, 231, 219)",
    );
    await expect(
      supervisorPage.getByRole("heading", { name: "Aggregate records" }),
    ).toBeVisible();
    await row.getByRole("button", { name: "View photo", exact: true }).click();
    const photo = supervisorPage.getByRole("dialog").getByRole("img");
    await expect(photo).toBeVisible();
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeLessThanOrEqual(1600);
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
  await expectOwnMarshalForm(page);
  const suffix = randomUUID().slice(0, 8);
  const material = `Loading panel ${suffix}`;
  const supplier = `Logistics ${suffix}`;
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Other Materials" });
  await newMaterial(page, material);
  await expect(
    page.locator('[aria-label="Automatic classification"]'),
  ).toContainText("Pending classification");
  await newSupplier(page, supplier);
  await expect(
    page.locator('input[type="date"]:visible, input[type="time"]:visible'),
  ).toHaveCount(0);
  await attach(page);
  const beforeSave = Date.now();
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
  expect(Date.parse(first.arrival_at)).toBeLessThanOrEqual(
    Date.parse(first.recorded_at ?? ""),
  );
  expect(first.created_at).toBe(first.recorded_at);
  expect(Date.parse(first.arrival_at)).toBeGreaterThanOrEqual(
    beforeSave - 1000,
  );
  expect(Date.parse(first.arrival_at)).toBeLessThanOrEqual(Date.now() + 1000);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
  }).format(new Date(first.arrival_at));
  await page.reload();
  await expectOwnMarshalForm(page);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Other Materials" });
  await materialSelect(page).click();
  const materialSearch = page.getByRole("searchbox", {
    name: "Search materials",
    exact: true,
  });
  await materialSearch.fill("l");
  await expect(
    page.getByRole("option").filter({ hasText: material }),
  ).toBeVisible();
  await materialSearch.fill("lo");
  await expect(
    page.getByRole("option").filter({ hasText: material }),
  ).toBeVisible();
  await materialSearch.fill("panel");
  await expect(
    page.getByRole("option").filter({ hasText: material }),
  ).toHaveCount(0);
  await materialSearch.fill(material);
  await page.getByRole("option").filter({ hasText: material }).click();
  await supplierSelect(page).click();
  await page
    .getByRole("searchbox", { name: "Search suppliers", exact: true })
    .fill(supplier);
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
    await supervisorPage
      .getByRole("navigation", { name: "Movement views" })
      .getByRole("button", { name: "Material", exact: true })
      .click();
    await supervisorPage
      .locator("summary")
      .getByText("Filters", { exact: true })
      .click();
    const toDateInput = supervisorPage.getByLabel("To date", { exact: true });
    await expect(toDateInput).toBeVisible();
    const toDate = await toDateInput.boundingBox();
    const materialFilter = await supervisorPage
      .getByRole("combobox", { name: "Material", exact: true })
      .boundingBox();
    expect(toDate && materialFilter).toBeTruthy();
    expect(
      toDate!.x + toDate!.width <= materialFilter!.x ||
        toDate!.y + toDate!.height <= materialFilter!.y,
    ).toBe(true);
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
      .click();
    await supervisorPage
      .getByRole("searchbox", { name: "Search materials" })
      .fill(material);
    await supervisorPage
      .getByRole("option", { name: material, exact: true })
      .click();
    await supervisorPage
      .getByRole("combobox", { name: "Supplier", exact: true })
      .click();
    await supervisorPage
      .getByRole("searchbox", { name: "Search suppliers" })
      .fill(supplier);
    await supervisorPage
      .getByRole("option", { name: supplier, exact: true })
      .click();
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
    ).toHaveCount(0);
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
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  const password = page.getByLabel("Password", { exact: true });
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await page.goto("/sign-in/supervisor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("gate@demo.invalid");
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Sign in to your account" })
      .getByRole("alert"),
  ).toContainText("This sign-in page is for a different staff role.");
  await expect(
    page.getByRole("link", { name: "Go to main sign-in" }),
  ).toHaveAttribute("href", "/");
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("supervisor@demo.invalid");
  await expect(
    page.getByRole("checkbox", { name: "Remember me" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/records$/);
  const saved = await context.storageState();
  const session = saved.cookies.find(
    (cookie) => cookie.name === "delivery_session",
  );
  expect(session?.httpOnly).toBe(true);
  expect(session?.expires).toBeGreaterThan(Date.now() / 1000 + 364 * 24 * 3600);
  const reopened = await context
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin, storageState: saved });
  try {
    const returnPage = await reopened.newPage();
    await returnPage.goto("/");
    await expect(returnPage).toHaveURL(/\/records$/);
    await returnPage.goto("/gate");
    await expect(returnPage).toHaveURL(/\/records$/);
  } finally {
    await reopened.close();
  }
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
  const loggedOutSession = await context
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin, storageState: saved });
  try {
    expect(
      (
        await loggedOutSession.request.get(
          new URL("/api/bootstrap", page.url()).href,
        )
      ).status(),
    ).toBe(401);
  } finally {
    await loggedOutSession.close();
  }
  await page.goto("/records");
  await expect(records(page)).toHaveCount(0);
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("live-authenticated-portals.png"),
    fullPage: true,
  });
});

test("a signed-in supervisor sees a new delivery without refreshing", async ({
  page,
  browser,
}) => {
  const gate = await login(page);
  const marshal = await expectOwnMarshalForm(page, gate);
  await chooseMaterial(page, "6F5");
  const supplier = `Live alert ${randomUUID().slice(0, 8)}`;
  await newSupplier(page, supplier);
  await attach(page);

  const managerContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const manager = await managerContext.newPage();
    await login(manager, "supervisor");
    await expect(records(manager)).toBeVisible();
    const notice = manager.getByText(`${marshal.name} just added a delivery.`, {
      exact: true,
    });
    await expect(notice).toHaveCount(0);

    await page.bringToFront();
    await save(page);
    await manager.bringToFront();

    await expect(notice).toBeVisible();
    const row = records(manager).getByRole("row").filter({ hasText: supplier });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("IN", { exact: true })).toHaveCSS(
      "background-color",
      "rgb(217, 242, 228)",
    );
    await manager.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(notice).toHaveCount(0);
    await manager
      .getByRole("button", { name: "Refresh deliveries", exact: true })
      .click();
    await expect(
      manager.getByRole("button", { name: "Refresh deliveries", exact: true }),
    ).toBeEnabled();
    await expect(notice).toHaveCount(0);
  } finally {
    await managerContext.close();
  }
});
