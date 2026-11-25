import { test, expect, devices, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type {
  Bootstrap,
  Delivery,
  SimpleDeliveryInput,
} from "../../src/lib/types";

// Opt-in only: this creates a clearly labelled synthetic arrival, material and
// supplier in the operator-selected test site. It deliberately retains audit
// history instead of deleting records after the test.
test.skip(
  process.env.RUN_HOSTED_SMOKE !== "1",
  "Set protected HOSTED_SMOKE_* variables and RUN_HOSTED_SMOKE=1 for an authorised test workspace.",
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);

async function signIn(
  context: BrowserContext,
  portal: "marshal" | "supervisor",
) {
  const gate = portal === "marshal";
  const response = await context.request.post("/api/auth/login", {
    data: {
      email:
        process.env[
          gate ? "HOSTED_SMOKE_GATE_EMAIL" : "HOSTED_SMOKE_SUPERVISOR_EMAIL"
        ],
      password:
        process.env[
          gate
            ? "HOSTED_SMOKE_GATE_PASSWORD"
            : "HOSTED_SMOKE_SUPERVISOR_PASSWORD"
        ],
      portal,
    },
  });
  expect(response.status()).toBe(200);
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "delivery_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(true);
  const boot = await context.request.get(`/api/bootstrap?portal=${portal}`);
  expect(boot.status()).toBe(200);
  const data = (await boot.json()) as Bootstrap;
  expect(data.mode).toBe("supabase");
  return data;
}

for (const direction of ["IN", "OUT"] as const) {
  test(`hosted Supabase persists ${direction} and private evidence for a separate supervisor device`, async ({
    browser,
    baseURL,
  }) => {
    const gate = await browser.newContext({
      ...devices["iPhone 13"],
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    const supervisor = await browser.newContext({
      ...devices["iPad Mini"],
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    const visitor = await browser.newContext({ baseURL });
    try {
      const data = await signIn(gate, "marshal");
      const siteId = process.env.HOSTED_SMOKE_SITE_ID!;
      expect(data.sites.some((site) => site.id === siteId)).toBe(true);
      const own = data.marshals?.find(
        (person) =>
          person.site_id === siteId &&
          person.can_record &&
          person.user_id === data.actor.id,
      );
      expect(own).toBeTruthy();
      const page = await gate.newPage();
      let original: SimpleDeliveryInput | undefined;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/log-deliveries"
        ) {
          const body = request.postDataJSON() as SimpleDeliveryInput;
          if (body.intent === "draft") original ??= body;
        }
      });
      await page.goto("/gate");
      if (data.sites.length > 1)
        await page
          .getByRole("combobox", { name: "Current site", exact: true })
          .selectOption(siteId);
      await page.getByRole("button", { name: own!.name, exact: true }).click();
      const prefix = `QA smoke ${randomUUID().slice(0, 8)}`;
      const materialName = `${prefix} panels`,
        supplierName = `${prefix} supplier`;
      await page
        .getByRole("combobox", { name: "Category", exact: true })
        .selectOption("Other Materials");
      await page
        .getByRole("combobox", { name: "Material", exact: true })
        .click();
      await page
        .getByRole("option", {
          name: "Other — Enter new material",
          exact: true,
        })
        .click();
      await page
        .getByLabel("New material name", { exact: true })
        .fill(materialName);
      await page
        .getByRole("combobox", { name: /^Supplier \/ Company name/ })
        .click();
      await page
        .getByRole("option", {
          name: "Other — Enter new supplier",
          exact: true,
        })
        .click();
      await page
        .getByLabel("New supplier name", { exact: true })
        .fill(supplierName);
      await page.getByLabel("Delivery image", { exact: true }).setInputFiles({
        name: "qa-synthetic-ticket.png",
        mimeType: "image/png",
        buffer: png,
      });
      await page
        .getByRole("combobox", { name: "Direction", exact: true })
        .selectOption(direction);
      await page
        .getByRole("button", { name: "Save Delivery", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Delivery saved");
      expect(original).toBeTruthy();
      const storedResponse = await gate.request.get("/api/bootstrap");
      expect(storedResponse.status()).toBe(200);
      const stored = (await storedResponse.json()) as Bootstrap;
      const delivery = stored.deliveries.find(
        (record) => record.id === original!.id,
      ) as Delivery;
      expect(delivery.submitted_at).toBeTruthy();
      expect(delivery.direction).toBe(direction);
      expect(delivery.evidence).toHaveLength(1);
      expect(delivery.marshal_id).toBe(own!.id);
      expect(delivery.created_by).toBe(data.actor.id);
      expect(delivery.entry_type).toBe("Pending review");
      expect(
        stored.materials.find((item) => item.id === delivery.material_id)
          ?.approval_status,
      ).toBe("Pending");
      expect(
        stored.suppliers.some((item) => item.id === delivery.supplier_id),
      ).toBe(true);
      const retry = await gate.request.post("/api/log-deliveries", {
        data: original,
      });
      expect(retry.status()).toBe(200);
      expect((await retry.json()).delivery.id).toBe(delivery.id);
      await page.reload();
      const refreshed = (await (
        await gate.request.get("/api/bootstrap")
      ).json()) as Bootstrap;
      expect(
        refreshed.deliveries.filter((record) => record.id === delivery.id),
      ).toHaveLength(1);

      const viewerData = await signIn(supervisor, "supervisor");
      expect(viewerData.actor.company_id).toBe(data.actor.company_id);
      const viewer = await supervisor.newPage();
      await viewer.goto("/records");
      if (viewerData.sites.length > 1)
        await viewer
          .getByRole("combobox", { name: "Current site", exact: true })
          .selectOption(siteId);
      await viewer.getByLabel("From date", { exact: true }).fill("");
      await viewer.getByLabel("To date", { exact: true }).fill("");
      const table = viewer.getByRole("table", {
        name: "Saved delivery records",
        exact: true,
      });
      await expect(table.getByRole("columnheader")).toHaveText([
        "Marshal",
        "Direction",
        "Material",
        "Supplier",
        "Time",
        "Photo",
      ]);
      const row = table.getByRole("row").filter({ hasText: supplierName });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(materialName);
      await expect(
        row.getByRole("cell", { name: direction, exact: true }),
      ).toBeVisible();
      await expect(
        viewer.getByRole("heading", { name: "Movement analytics" }),
      ).toBeVisible();
      expect(
        (
          await supervisor.request.post("/api/log-deliveries", {
            data: original,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await supervisor.request.post(
            `/api/deliveries/${delivery.id}/review`,
            { data: {} },
          )
        ).status(),
      ).toBe(403);
      await row
        .getByRole("button", { name: "View photo", exact: true })
        .click();
      await expect(
        viewer.getByRole("dialog").getByRole("img"),
      ).toHaveJSProperty("naturalWidth", 1);
      const photo = await supervisor.request.get(
        `/api/evidence/${delivery.evidence[0].id}`,
      );
      expect(photo.status()).toBe(200);
      expect(photo.headers()["cache-control"]).toContain("no-store");
      expect(await photo.body()).toEqual(png);
      expect((await visitor.request.get("/api/bootstrap")).status()).toBe(401);
      expect(
        (
          await visitor.request.get(`/api/evidence/${delivery.evidence[0].id}`)
        ).status(),
      ).toBe(401);
    } finally {
      await gate.request.post("/api/auth/logout").catch(() => undefined);
      await supervisor.request.post("/api/auth/logout").catch(() => undefined);
      await Promise.all([gate.close(), supervisor.close(), visitor.close()]);
    }
  });
}
