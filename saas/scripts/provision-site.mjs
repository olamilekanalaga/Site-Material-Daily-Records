/**
 * Trusted operator setup for an approved site. Never import this script in the app.
 * Default: validate/read/plan only. Writes require the explicit --apply argument.
 * Auth accounts must already exist; no passwords or sample deliveries are created.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const name = z.string().trim().min(1).max(120);
const schema = z
  .object({
    project_url: z.string().url(),
    company: z.object({ id: identifier, name }).strict(),
    site: z
      .object({
        id: identifier,
        name,
        timezone: z.string().default("Europe/London"),
      })
      .strict(),
    staff: z
      .array(
        z
          .object({
            user_id: identifier,
            name,
            role: z.enum([
              "gate",
              "supervisor",
              "site_manager",
              "company_admin",
            ]),
            marshal: z
              .object({
                id: identifier,
                photo_file: z.string().min(1).max(2000).optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(2)
      .max(100),
  })
  .strict();

export function validateSiteConfig(value) {
  const config = schema.parse(value);
  const fail = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const project = new URL(config.project_url);
  fail(
    project.protocol === "https:" &&
      !project.username &&
      !project.password &&
      !project.search &&
      !project.hash &&
      project.pathname === "/",
    "project_url must be the reviewed HTTPS Supabase project origin.",
  );
  config.project_url = project.origin;
  fail(
    config.company.id !== config.site.id,
    "Company and site IDs must differ.",
  );
  fail(
    new Set(config.staff.map((staff) => staff.user_id)).size ===
      config.staff.length,
    "Each staff account must appear only once.",
  );
  const gates = config.staff.filter((staff) => staff.role === "gate");
  fail(gates.length > 0, "Configure at least one authorised traffic marshal.");
  fail(
    config.staff.some((staff) =>
      ["supervisor", "site_manager"].includes(staff.role),
    ),
    "Configure a supervisor or site manager for the site.",
  );
  fail(
    config.staff.every(
      (staff) => (staff.role === "gate") === Boolean(staff.marshal),
    ),
    "Only gate accounts have marshal cards, and every gate account needs one.",
  );
  fail(
    new Set(gates.map((staff) => staff.marshal.id)).size === gates.length,
    "Marshal card IDs must be unique.",
  );
  fail(
    new Set(gates.map((staff) => staff.name.toLocaleLowerCase("en-GB")))
      .size === gates.length,
    "Marshal card names must be unique within this site.",
  );
  try {
    new Intl.DateTimeFormat("en-GB", {
      timeZone: config.site.timezone,
    }).format();
  } catch {
    throw new Error(
      "Choose a valid IANA site timezone, such as Europe/London.",
    );
  }
  return config;
}

async function checked(query, operation) {
  const { data, error } = await query;
  if (error) throw new Error(`${operation} failed. ${error.message}`);
  return data;
}

async function portrait(file, base, companyId, siteId, marshalId) {
  if (!file) return null;
  const bytes = new Uint8Array(await readFile(resolve(base, file)));
  if (!bytes.length || bytes.length > 3 * 1024 * 1024)
    throw new Error("Each portrait must be non-empty and at most 3 MiB.");
  const png =
    bytes.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  const jpeg =
    bytes.length > 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const extension = png ? "png" : jpeg ? "jpg" : webp ? "webp" : null;
  if (!extension)
    throw new Error("Portraits must be JPEG, PNG or WebP images.");
  return {
    bytes,
    mime: png ? "image/png" : jpeg ? "image/jpeg" : "image/webp",
    path: `${companyId}/${siteId}/${marshalId}/profile.${extension}`,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function preflight(client, config) {
  const status = await checked(
    client.rpc("app_provisioning_status"),
    "Live migration readiness check",
  );
  if (
    status?.migration !== "202611070001_live_delivery_backend" ||
    !status.private_evidence_bucket ||
    !status.private_portrait_bucket
  )
    throw new Error(
      "Apply the complete live migration before provisioning staff.",
    );
  for (const bucket of ["delivery-evidence", "staff-portraits"]) {
    const { data, error } = await client.storage.getBucket(bucket);
    if (error || !data || data.public)
      throw new Error(
        "Required private storage buckets are missing or public. Review the migrations before provisioning.",
      );
  }
  const company = await checked(
    client
      .from("companies")
      .select("id,name")
      .eq("id", config.company.id)
      .maybeSingle(),
    "Company lookup",
  );
  if (company && company.name !== config.company.name)
    throw new Error(
      "Company ID already has another name. Review the configuration.",
    );
  const sameName = await checked(
    client.from("companies").select("id").eq("name", config.company.name),
    "Company name lookup",
  );
  if (sameName.some((row) => row.id !== config.company.id))
    throw new Error(
      "A company with this name already exists under another ID. Reuse its reviewed ID.",
    );
  const site = await checked(
    client
      .from("sites")
      .select("id,company_id,name,timezone")
      .eq("id", config.site.id)
      .maybeSingle(),
    "Site lookup",
  );
  if (
    site &&
    (site.company_id !== config.company.id ||
      site.name !== config.site.name ||
      site.timezone !== config.site.timezone)
  )
    throw new Error(
      "Site ID already has different company/name/timezone settings. Review them manually.",
    );
  const matchingSites = await checked(
    client
      .from("sites")
      .select("id")
      .eq("company_id", config.company.id)
      .eq("name", config.site.name),
    "Site name lookup",
  );
  if (matchingSites.some((row) => row.id !== config.site.id))
    throw new Error(
      "This site name already exists under another ID. Reuse its reviewed ID.",
    );
  const memberships = await checked(
    client
      .from("company_memberships")
      .select("company_id,user_id,role")
      .in(
        "user_id",
        config.staff.map((staff) => staff.user_id),
      ),
    "Membership lookup",
  );
  const assignments = await checked(
    client
      .from("site_assignments")
      .select("company_id,site_id,user_id")
      .eq("site_id", config.site.id),
    "Site assignment lookup",
  );
  const siteMarshals = await checked(
    client
      .from("traffic_marshals")
      .select("id,company_id,site_id,user_id,name,photo_path,active")
      .eq("site_id", config.site.id),
    "Marshal lookup (apply all migrations first)",
  );
  const requestedMarshals = await checked(
    client
      .from("traffic_marshals")
      .select("id,company_id,site_id,user_id,name,photo_path,active")
      .in(
        "id",
        config.staff
          .filter((staff) => staff.marshal)
          .map((staff) => staff.marshal.id),
      ),
    "Requested marshal ID lookup",
  );
  const marshals = [
    ...new Map(
      [...siteMarshals, ...requestedMarshals].map((row) => [row.id, row]),
    ).values(),
  ];
  for (const staff of config.staff) {
    const { data, error } = await client.auth.admin.getUserById(staff.user_id);
    if (error || !data.user)
      throw new Error(
        "A configured Auth account does not exist. Invite/create staff accounts first.",
      );
    const profile = await checked(
      client
        .from("user_profiles")
        .select("id")
        .eq("id", staff.user_id)
        .maybeSingle(),
      "Staff profile lookup",
    );
    if (!profile)
      throw new Error(
        "An Auth account has no application profile. Review Auth triggers/migrations before setup.",
      );
    const membership = memberships.find((row) => row.user_id === staff.user_id);
    if (
      membership &&
      (membership.company_id !== config.company.id ||
        membership.role !== staff.role)
    )
      throw new Error(
        "A staff member already has a different company or role. This script never changes existing roles.",
      );
    if (!staff.marshal) continue;
    const current = marshals.find((row) => row.id === staff.marshal.id);
    if (
      current &&
      (current.company_id !== config.company.id ||
        current.site_id !== config.site.id ||
        (current.user_id && current.user_id !== staff.user_id) ||
        current.name !== staff.name ||
        !current.active)
    )
      throw new Error(
        "A marshal card has a conflicting binding/name or is inactive. Review it manually.",
      );
    if (
      marshals.some(
        (row) =>
          row.id !== staff.marshal.id &&
          (row.user_id === staff.user_id ||
            row.name.toLocaleLowerCase("en-GB") ===
              staff.name.toLocaleLowerCase("en-GB")),
      )
    )
      throw new Error(
        "This staff member or marshal name already has a site card under another ID.",
      );
  }
  return { company, site, memberships, assignments, marshals };
}

async function uploadPortrait(client, image) {
  if (!image) return;
  const bucket = client.storage.from("staff-portraits");
  const { error } = await bucket.upload(image.path, image.bytes, {
    contentType: image.mime,
    upsert: false,
  });
  if (!error) return;
  if (
    String(error.statusCode) !== "409" &&
    !/already exists/i.test(error.message)
  )
    throw new Error(
      "Private portrait upload failed. Verify the bucket and operator credentials.",
    );
  const { data, error: readError } = await bucket.download(image.path);
  if (readError || !data)
    throw new Error(
      "Existing portrait could not be verified. No file was overwritten.",
    );
  const hash = createHash("sha256")
    .update(new Uint8Array(await data.arrayBuffer()))
    .digest("hex");
  if (hash !== image.hash)
    throw new Error(
      "A different portrait already exists at this path. No file was overwritten.",
    );
}

async function preflightPortrait(client, image) {
  if (!image) return;
  const { data, error } = await client.storage
    .from("staff-portraits")
    .download(image.path);
  if (error) {
    if (
      String(error.statusCode) === "404" ||
      /object not found/i.test(error.message)
    )
      return;
    throw new Error(
      "Could not inspect the intended portrait path before setup. Check operator Storage access.",
    );
  }
  const hash = createHash("sha256")
    .update(new Uint8Array(await data.arrayBuffer()))
    .digest("hex");
  if (hash !== image.hash)
    throw new Error(
      "A different portrait exists at the intended path. Review it before applying setup.",
    );
}

export async function main(argv = process.argv.slice(2)) {
  const allowed = new Set(["--config", "--apply", "--validate-only"]);
  for (let i = 0; i < argv.length; i++) {
    if (!allowed.has(argv[i]))
      throw new Error(
        "Usage: node scripts/provision-site.mjs --config FILE [--validate-only | --apply]",
      );
    if (argv[i] === "--config") i++;
  }
  const position = argv.indexOf("--config");
  if (
    position < 0 ||
    !argv[position + 1] ||
    argv[position + 1].startsWith("--")
  )
    throw new Error(
      "Provide --config with the path to your reviewed operator configuration.",
    );
  if (
    argv.filter((value) => value === "--config").length !== 1 ||
    (argv.includes("--apply") && argv.includes("--validate-only"))
  )
    throw new Error(
      "Use one --config and choose either --validate-only or --apply.",
    );
  const file = resolve(argv[position + 1]);
  const config = validateSiteConfig(JSON.parse(await readFile(file, "utf8")));
  const images = new Map();
  for (const staff of config.staff) {
    if (staff.marshal)
      images.set(
        staff.user_id,
        await portrait(
          staff.marshal.photo_file,
          dirname(file),
          config.company.id,
          config.site.id,
          staff.marshal.id,
        ),
      );
  }
  if (argv.includes("--validate-only")) {
    console.log(
      "Configuration and supplied portrait files are valid. No network requests or writes were made.",
    );
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Set SUPABASE_URL and the operator-only SUPABASE_SERVICE_ROLE_KEY in a protected environment.",
    );
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/"
  )
    throw new Error(
      "SUPABASE_URL must be the HTTPS project origin, without credentials, a path or query.",
    );
  if (target.origin !== config.project_url)
    throw new Error(
      "SUPABASE_URL differs from the reviewed project_url in the configuration. No writes were made.",
    );
  const client = createClient(target.origin, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const existing = await preflight(client, config);
  for (const staff of config.staff) {
    if (!staff.marshal) continue;
    const previous = existing.marshals.find(
      (row) => row.id === staff.marshal.id,
    );
    const image = images.get(staff.user_id);
    if (previous?.photo_path && image && previous.photo_path !== image.path)
      throw new Error(
        "A marshal card already references another portrait. Review replacement separately.",
      );
    await preflightPortrait(client, image);
  }
  console.log(
    JSON.stringify(
      {
        mode: argv.includes("--apply") ? "apply" : "read-only plan",
        project: target.origin,
        company: existing.company ? "reuse" : "create",
        site: existing.site ? "reuse" : "create",
        staff: config.staff.length,
        marshal_cards: config.staff.filter((staff) => staff.marshal).length,
        portraits: [...images.values()].filter(Boolean).length,
        creates_auth_accounts: false,
        creates_delivery_records: false,
      },
      null,
      2,
    ),
  );
  if (!argv.includes("--apply")) {
    console.log(
      "No writes were made. Review this plan, then rerun with --apply only for the intended project.",
    );
    return;
  }
  if (!existing.company)
    await checked(
      client.from("companies").insert(config.company),
      "Company creation",
    );
  if (!existing.site)
    await checked(
      client.from("sites").insert({
        ...config.site,
        company_id: config.company.id,
        require_ticket: false,
        require_photo: true,
      }),
      "Site creation",
    );
  for (const staff of config.staff) {
    await checked(
      client
        .from("user_profiles")
        .update({ name: staff.name })
        .eq("id", staff.user_id),
      "Staff display-name update",
    );
    if (!existing.memberships.some((row) => row.user_id === staff.user_id))
      await checked(
        client.from("company_memberships").insert({
          company_id: config.company.id,
          user_id: staff.user_id,
          role: staff.role,
        }),
        "Membership creation",
      );
    if (
      !existing.assignments.some(
        (row) =>
          row.company_id === config.company.id && row.user_id === staff.user_id,
      )
    )
      await checked(
        client.from("site_assignments").insert({
          company_id: config.company.id,
          site_id: config.site.id,
          user_id: staff.user_id,
        }),
        "Site assignment creation",
      );
    if (!staff.marshal) continue;
    const image = images.get(staff.user_id);
    await uploadPortrait(client, image);
    const previous = existing.marshals.find(
      (row) => row.id === staff.marshal.id,
    );
    const photoPath = image?.path || previous?.photo_path || null;
    if (previous) {
      await checked(
        client
          .from("traffic_marshals")
          .update({ user_id: staff.user_id, photo_path: photoPath })
          .eq("id", previous.id),
        "Marshal binding update",
      );
    } else {
      await checked(
        client.from("traffic_marshals").insert({
          id: staff.marshal.id,
          company_id: config.company.id,
          site_id: config.site.id,
          user_id: staff.user_id,
          name: staff.name,
          photo_path: photoPath,
          active: true,
        }),
        "Marshal creation",
      );
    }
  }
  await checked(
    client.rpc("app_seed_company_catalogue", { p_company: config.company.id }),
    "Catalogue setup (apply the live migration first)",
  );
  console.log(
    "Site setup completed. No passwords, Auth accounts or delivery records were created. Test staff sign-in and private photo access before release.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof z.ZodError
        ? "Invalid configuration: check required IDs, names, roles and field names."
        : error.message,
    );
    console.error(
      "No automatic rollback or deletion is performed. Inspect any partial setup before retrying with the same reviewed IDs.",
    );
    process.exitCode = 1;
  });
}
