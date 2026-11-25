import { expect, test } from "@playwright/test";

test("old demo URLs lead to staff sign-in without exposing sample records", async ({
  page,
}) => {
  for (const path of [
    "/demo",
    "/demo/supervisor",
    "/demo/records?profile=b",
    "/demo/delivery/b",
  ]) {
    await page.goto(path);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /demo/i })).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
  }

  const result = await page.request.post("/api/log-deliveries", { data: {} });
  expect(result.status()).toBe(503);
});
