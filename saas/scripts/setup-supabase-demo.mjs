/** Explicit one-time fictional demo provisioning. Never import this file in the app. */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
if (!process.argv.includes("--demo-only"))
  throw new Error("Pass --demo-only to provision fictional records.");
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !serviceKey || !anonKey || !password || password.length < 12)
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and a unique DEMO_PASSWORD (12+ chars).",
  );
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const companyName = "DJ Civils Demo — Unofficial Prototype";
const check = async (p) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const existing = await check(
  admin.from("companies").select("id").eq("name", companyName),
);
if (existing.length)
  throw new Error(
    "Demo company already exists. Refusing duplicate provisioning.",
  );
const company = randomUUID(),
  site = randomUUID();
await check(admin.from("companies").insert({ id: company, name: companyName }));
await check(
  admin.from("sites").insert({
    id: site,
    company_id: company,
    name: "Demo Riverside",
    timezone: "Europe/London",
    require_ticket: true,
    require_photo: false,
  }),
);
const users = {};
for (const [role, name] of [
  ["gate", "Alex Demo"],
  ["supervisor", "Sam Demo"],
  ["site_manager", "Morgan Demo"],
  ["company_admin", "Jordan Demo"],
]) {
  const email = `${role === "site_manager" ? "manager" : role === "company_admin" ? "admin" : role}@demo.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error)
    throw new Error(
      `Auth provisioning failed for ${email}: ${error.message}. This script does not delete partially created records; inspect the demo workspace before retrying.`,
    );
  users[role] = data.user;
  await check(
    admin
      .from("company_memberships")
      .insert({ company_id: company, user_id: data.user.id, role }),
  );
  await check(
    admin
      .from("site_assignments")
      .insert({ company_id: company, site_id: site, user_id: data.user.id }),
  );
}
await check(
  admin.from("traffic_marshals").insert(
    ["B", "Olamilekan Alaga"].map((name) => ({
      id: randomUUID(),
      company_id: company,
      site_id: site,
      name,
      active: true,
    })),
  ),
);
const materials = [
  "6F5",
  "G1",
  "Type 1",
  "Sand",
  "10mm shingles",
  "20mm shingles",
  "Other",
].map((name) => ({ id: randomUUID(), company_id: company, name }));
const suppliers = ["Fictional Quarry Supply", "Example Aggregates Ltd"].map(
  (name) => ({ id: randomUUID(), company_id: company, name }),
);
await check(admin.from("materials").insert(materials));
await check(admin.from("suppliers").insert(suppliers));
const gate = createClient(url, anonKey, opts),
  supervisor = createClient(url, anonKey, opts);
await check(
  gate.auth.signInWithPassword({ email: users.gate.email, password }),
);
await check(
  supervisor.auth.signInWithPassword({
    email: users.supervisor.email,
    password,
  }),
);
for (const [i, status] of [
  "Accepted",
  "Rejected",
  "Flagged",
  "Submitted",
  "Draft",
].entries()) {
  const id = randomUUID();
  const created = await check(
    gate.rpc("save_delivery", {
      p_input: {
        id,
        site_id: site,
        material_id: materials[i].id,
        supplier_id: suppliers[i % 2].id,
        vehicle: `DEMO ${String(i + 1).padStart(3, "0")}`,
        ticket_number: `DEMO-T${String(i + 1).padStart(3, "0")}`,
        ticket_quantity: 12 + i,
        ticket_unit: "tonnes",
        arrival_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
        notes:
          "FICTIONAL demonstration only. No company approval or real delivery implied.",
        intent: status === "Draft" ? "draft" : "submit",
      },
    }),
  );
  if (["Accepted", "Rejected", "Flagged"].includes(status))
    await check(
      supervisor.rpc("review_delivery", {
        p_id: id,
        p_input: {
          decision: status,
          reason:
            status === "Accepted"
              ? "Fictional receipt demonstration"
              : status === "Rejected"
                ? "Fictional wrong material example"
                : "Fictional quantity discrepancy example",
          accepted_quantity: status === "Accepted" ? 11.5 : null,
          accepted_unit: status === "Accepted" ? "tonnes" : null,
          version: created.delivery.version,
        },
      }),
    );
}
await check(
  admin.from("historical_delivery_summaries").insert({
    company_id: company,
    site_id: site,
    date: new Date().toISOString().slice(0, 10),
    material_id: materials[0].id,
    reported_count: 7,
    source_reference: "FICTIONAL notebook illustration",
    confidence: "Uncertain",
    notes:
      "Illustration only. These counts are separate from individual digital deliveries.",
  }),
);
console.log(
  "Provisioned fictional demo workspace. No company authorisation implied.",
);
console.log(
  "Accounts: gate@demo.invalid, supervisor@demo.invalid, manager@demo.invalid, admin@demo.invalid",
);
console.log(
  "Use the DEMO_PASSWORD you supplied. Remove service-role and demo-password variables from the application runtime.",
);
