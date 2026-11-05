import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);

async function login(
  page: Page,
  role: "gate" | "supervisor" | "manager" = "gate",
) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(`${role}@demo.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your site, at a glance" }),
  ).toBeVisible();
}

async function navigate(page: Page, label: string) {
  const name = new RegExp(
    `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\d+)?$`,
  );
  const button = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name });
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await button.click();
}

async function noPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
}

test("gate captures a ticket on a touch device, supervisor verifies, manager sees report", async ({
  page,
  browser,
}, testInfo) => {
  await login(page);
  await noPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("overview.png"),
    fullPage: true,
  });
  await expect(
    page.getByText("All records are fictional. No company approval implied.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await page.getByRole("button", { name: /GF5$/ }).click();
  await page
    .getByRole("combobox", { name: "Supplier", exact: true })
    .selectOption({ label: "Fictional Aggregate Co" });
  await page
    .getByLabel("Vehicle registration", { exact: true })
    .fill("DEMO MOBILE");
  const ticket = `MOB-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Ticket number", { exact: true }).fill(ticket);
  await page.getByLabel("Ticket quantity", { exact: true }).fill("22.5");
  await page
    .getByRole("combobox", { name: "Quantity unit", exact: true })
    .selectOption("tonnes");
  await page
    .getByLabel("Ticket photograph", { exact: true })
    .setInputFiles({
      name: "fictional-ticket.png",
      mimeType: "image/png",
      buffer: png,
    });
  await noPageOverflow(page);
  await page
    .getByRole("button", { name: "Submit delivery", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delivery register", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search deliveries").fill(ticket);
  await expect(page.getByText(ticket, { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("Submitted", { exact: true })).toBeVisible();
  await noPageOverflow(page);

  // Independent contexts prove that review and reporting use server-persisted data.
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const reviewPage = await context.newPage();
  await login(reviewPage, "supervisor");
  await navigate(reviewPage, "Verification queue");
  await reviewPage.getByLabel("Search deliveries").fill(ticket);
  await reviewPage
    .getByRole("row")
    .filter({ hasText: ticket })
    .getByRole("button", { name: /^DL-/ })
    .click();
  await reviewPage
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("Accepted");
  await reviewPage.getByLabel("Accepted quantity", { exact: true }).fill("21");
  await reviewPage
    .getByRole("checkbox", {
      name: "I independently confirm physical receipt of this delivery.",
    })
    .check();
  await reviewPage
    .getByLabel("Reason / supporting notes", { exact: true })
    .fill("Fictional test: physically checked the received load.");
  await reviewPage
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(reviewPage.getByRole("status")).toContainText(
    "Supervisor decision saved",
  );
  await context.close();

  const managerContext = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const managerPage = await managerContext.newPage();
  await login(managerPage, "manager");
  await navigate(managerPage, "Daily reports");
  await expect(managerPage.getByText(ticket, { exact: true })).toBeVisible();
  await expect(
    managerPage.getByRole("heading", { name: "Accepted quantities by unit" }),
  ).toBeVisible();
  await expect(
    managerPage.getByRole("link", { name: "Export CSV" }),
  ).toBeVisible();
  await noPageOverflow(managerPage);
  await managerPage.screenshot({
    path: testInfo.outputPath("report.png"),
    fullPage: true,
  });
  await managerContext.close();
});

test("offline draft is visibly local, survives reload-free navigation and retries once online", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await page.getByRole("button", { name: /Sand$/ }).click();
  await page
    .getByLabel("Vehicle registration", { exact: true })
    .fill("DEMO OFFLINE");
  const ticket = `OFF-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Ticket number", { exact: true }).fill(ticket);
  await context.setOffline(true);
  await expect(
    page.getByText("Offline · local saves only", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await navigate(page, "Drafts & uploads");
  await expect(
    page.getByText("Saved locally — not submitted", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByLabel("Ticket number", { exact: true })).toHaveValue(
    ticket,
  );
  await page
    .getByRole("button", { name: "Queue for upload", exact: true })
    .click();
  await navigate(page, "Drafts & uploads");
  await expect(
    page.getByText("Upload pending — not submitted to server", {
      exact: false,
    }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("submitted", {
    timeout: 30_000,
  });
  await navigate(page, "Delivery register");
  await page.getByLabel("Search deliveries").fill(ticket);
  await expect(page.getByText(ticket, { exact: true })).toHaveCount(1);
  await expect(page.getByRole("table").getByText("Submitted", { exact: true })).toBeVisible();
});
