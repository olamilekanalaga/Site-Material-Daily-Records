import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.skip(
  process.env.RUN_OPEN_SIGNUP_SMOKE !== "1",
  "Use a disposable staging site with open registration enabled.",
);

test("open signup signs in immediately, keeps a private portrait and remembers a later login", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  let restored;
  try {
    const page = await context.newPage();
    const email = `auth-smoke-${randomUUID()}@example.com`;
    const password = `Test-${randomUUID()}!`;
    await page.goto("/");
    await page.getByRole("link", { name: "Create account" }).click();
    await page.getByLabel("First name").fill("Staging");
    await page.getByLabel("Last name").fill("Smoke Test");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Phone number").fill("07000000000");
    await page.getByLabel("Profile picture").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page
      .getByRole("combobox", { name: "Role" })
      .selectOption("site_manager");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Show confirm password" }).click();
    await expect(
      page.getByLabel("Confirm password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide confirm password" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/records$/);
    const boot = await page.request.get("/api/bootstrap");
    expect((await boot.json()).actor.role).toBe("site_manager");
    const portrait = await page.request.get("/api/profile/photo");
    expect(portrait.status()).toBe(200);
    expect(portrait.headers()["content-type"]).toContain("image/png");
    await expect(
      page.getByRole("img", { name: "Profile picture" }),
    ).toHaveJSProperty("naturalWidth", 1);
    expect(
      await browser.newContext({ baseURL }).then(async (anonymous) => {
        try {
          return (await anonymous.request.get("/api/profile/photo")).status();
        } finally {
          await anonymous.close();
        }
      }),
    ).toBe(401);
    const session = (await context.cookies()).find(
      (cookie) => cookie.name === "delivery_session",
    );
    expect(session?.expires).toBe(-1);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("checkbox", { name: "Remember me" }).check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/records$/);
    const storageState = await context.storageState();
    const access = storageState.cookies.find(
      (cookie) => cookie.name === "delivery_session",
    );
    if (!access) throw new Error("Missing access cookie");
    access.value = "expired-access-token";

    expect(
      storageState.cookies.find((cookie) => cookie.name === "delivery_session")
        ?.expires,
    ).toBeGreaterThan(Date.now() / 1000);
    await context.close();
    restored = await browser.newContext({ baseURL, storageState });
    const reopened = await restored.newPage();
    await reopened.goto("/");
    await expect(reopened).toHaveURL(/\/records$/);
    await reopened.getByRole("button", { name: "Sign out" }).click();
    await expect(reopened).toHaveURL(/\/$/);
    expect((await reopened.request.get("/api/bootstrap")).status()).toBe(401);
  } finally {
    await restored?.close();
    await context.close();
  }
});
