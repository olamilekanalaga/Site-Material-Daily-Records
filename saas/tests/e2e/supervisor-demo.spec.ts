import { test, expect } from "@playwright/test";

test("supervisor tabs share marshal filters and expose activity with keyboard navigation", async ({
  page,
  context,
}, info) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (/^\/api(?:\/|$)/.test(new URL(request.url()).pathname))
      requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await page.goto("/demo/supervisor");
  const heading = page.getByRole("heading", {
    name: "Gate — Supervisor Workspace",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(
    page.getByText("Site arrivals and traffic marshal activity", {
      exact: true,
    }),
  ).toBeVisible();
  const summary = page.getByRole("region", {
    name: "Workspace summary",
    exact: true,
  });
  await expect(summary.getByRole("group")).toHaveCount(3);
  for (const label of ["Arrivals: 30", "Marshals: 2", "To Classify: 1"])
    await expect(
      summary.getByRole("group", { name: label, exact: true }),
    ).toBeVisible();
  const records = page.getByRole("tab", { name: "Records", exact: true });
  const workload = page.getByRole("tab", { name: "Workload", exact: true });
  const review = page.getByRole("tab", { name: "Review", exact: true });
  const table = page.getByRole("table", {
    name: "Saved delivery records",
    exact: true,
  });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Item",
    "Marshal",
    "Time",
  ]);
  await records.focus();
  await records.press("ArrowRight");
  await expect(workload).toBeFocused();
  await expect(workload).toHaveAttribute("aria-selected", "true");
  const b = page.getByRole("article", {
    name: "Activity for Bemigho Estano",
    exact: true,
  });
  const ola = page.getByRole("article", {
    name: "Activity for Olamilekan Alaga",
    exact: true,
  });
  await expect(b).toContainText("20 arrivals");
  await expect(ola).toContainText("10 arrivals");
  await b.getByText("Recorded times", { exact: true }).click();
  await expect(b.locator("time")).toHaveCount(20);
  await b.getByText(/^Activity by day/).click();
  await expect(
    b
      .getByRole("table", {
        name: "Daily activity for Bemigho Estano",
        exact: true,
      })
      .locator("tbody tr"),
  ).toHaveCount(1);
  await expect(
    b
      .getByRole("table", {
        name: "Daily activity for Bemigho Estano",
        exact: true,
      })
      .locator("tbody tr"),
  ).toContainText("2026-11-06");
  await page
    .getByRole("combobox", { name: "Traffic marshal", exact: true })
    .selectOption({ label: "Bemigho Estano" });
  await expect(ola).toHaveCount(0);
  await expect(b).toContainText("20 arrivals");
  await expect(
    summary.getByRole("group", { name: "Arrivals: 20", exact: true }),
  ).toBeVisible();
  await expect(
    summary.getByRole("group", { name: "Marshals: 1", exact: true }),
  ).toBeVisible();
  await workload.focus();
  await workload.press("End");
  await expect(review).toBeFocused();
  await expect(review).toHaveAttribute("aria-selected", "true");
  const form = page.getByRole("form", { name: "Classify G1", exact: true });
  await expect(form).toBeVisible();
  await expect(form).toContainText("3 arrivals");
  await expect(
    summary.getByRole("group", { name: "To Classify: 1", exact: true }),
  ).toBeVisible();
  await review.press("Home");
  await expect(records).toBeFocused();
  await expect(records).toHaveAttribute("aria-selected", "true");
  await expect(table.locator("tbody tr")).toHaveCount(20);
  await expect(table.locator("tbody td:nth-child(2)")).toHaveText(
    Array(20).fill("Bemigho Estano"),
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(30);
  // Check the requested dark hierarchy and card layout without locking to a
  // fabricated reference screenshot or a single device's font rendering.
  const background = await heading.evaluate((element) => {
    let parent: HTMLElement | null = element as HTMLElement;
    while (parent) {
      const value = getComputedStyle(parent).backgroundColor;
      if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") return value;
      parent = parent.parentElement;
    }
    return "transparent";
  });
  const rgb = background.match(/\d+/g)?.slice(0, 3).map(Number) || [];
  expect(rgb).toHaveLength(3);
  expect(Math.max(...rgb)).toBeLessThan(65);
  const boxes = await summary
    .getByRole("group")
    .evaluateAll((cards) =>
      cards.map((card) => ({
        top: card.getBoundingClientRect().top,
        width: card.getBoundingClientRect().width,
      })),
    );
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
  expect(
    Math.max(...boxes.map((box) => box.width)) -
      Math.min(...boxes.map((box) => box.width)),
  ).toBeLessThanOrEqual(2);
  if (info.project.name === "demo-mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath("supervisor-dark-records.png"),
    fullPage: true,
  });
  await workload.click();
  await page.screenshot({
    path: info.outputPath("supervisor-workload.png"),
    fullPage: true,
  });
  await review.click();
  await page.screenshot({
    path: info.outputPath("supervisor-review.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(records).toHaveAttribute("aria-selected", "true");
  await expect(table.locator("tbody tr")).toHaveCount(30);
  await expect(page.getByText("Demo preview", { exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "delivery_session",
    ),
  ).toBe(false);
});
