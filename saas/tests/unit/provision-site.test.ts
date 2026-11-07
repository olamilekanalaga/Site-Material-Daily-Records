import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, validateSiteConfig } from "../../scripts/provision-site.mjs";

const id = (n: number) =>
  `d4000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = () => ({
  project_url: "https://reviewed-project.supabase.co",
  company: { id: id(1), name: "Authorised test company" },
  site: { id: id(2), name: "Authorised test site", timezone: "Europe/London" },
  staff: [
    {
      user_id: id(3),
      name: "Authorised marshal",
      role: "gate",
      marshal: { id: id(4) },
    },
    { user_id: id(5), name: "Authorised supervisor", role: "supervisor" },
  ],
});

test("operator setup rejects duplicate identities, unsafe roles and ambiguous staff/card configuration", () => {
  assert.equal(validateSiteConfig(config()).staff.length, 2);
  for (const invalid of [
    {
      ...config(),
      project_url: "https://user:password@reviewed-project.supabase.co",
    },
    {
      ...config(),
      project_url: "https://reviewed-project.supabase.co/another-project",
    },
    { ...config(), site: { ...config().site, id: id(1) } },
    { ...config(), site: { ...config().site, timezone: "Invalid/Timezone" } },
    {
      ...config(),
      staff: [
        { ...config().staff[0] },
        { ...config().staff[1], user_id: id(3) },
      ],
    },
    {
      ...config(),
      staff: [{ ...config().staff[0], marshal: undefined }, config().staff[1]],
    },
    {
      ...config(),
      staff: [
        config().staff[0],
        { ...config().staff[1], role: "platform_admin" },
      ],
    },
    {
      ...config(),
      staff: [
        config().staff[0],
        { ...config().staff[1], marshal: { id: id(6) } },
      ],
    },
  ])
    assert.throws(() => validateSiteConfig(invalid));
});

test("operator validation-only mode needs no credentials and makes no network requests", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "djcu-operator-validation-"));
  const file = join(folder, "site.json");
  await writeFile(file, JSON.stringify(config()));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("Unexpected network request");
  });
  t.mock.method(console, "log", () => undefined);
  try {
    await main(["--config", file, "--validate-only"]);
    assert.equal(requests, 0);
    await assert.rejects(
      main(["--config", file, "--apply", "--validate-only"]),
    );
    assert.equal(requests, 0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("operator apply refuses a different project before any network request or write", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "djcu-operator-project-"));
  const file = join(folder, "site.json");
  await writeFile(file, JSON.stringify(config()));
  const previousUrl = process.env.SUPABASE_URL,
    previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://different-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-operator-key";
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("Unexpected network request");
  });
  try {
    await assert.rejects(
      main(["--config", file, "--apply"]),
      /differs from the reviewed project/,
    );
    assert.equal(requests, 0);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    await rm(folder, { recursive: true, force: true });
  }
});
