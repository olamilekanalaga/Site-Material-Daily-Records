import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localWorkspaceEnabled,
  supabaseConfig,
  workspaceEnabled,
} from "../../src/lib/server/config";

const jwt = (role: string) =>
  `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test-signature`;
const valid = {
  APP_MODE: "supabase",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
};

test("Supabase configuration accepts a publishable key and preserves the existing public anon-key fallback", () => {
  assert.deepEqual(supabaseConfig(valid), {
    url: valid.SUPABASE_URL,
    key: valid.SUPABASE_PUBLISHABLE_KEY,
  });
  const anonymous = jwt("anon");
  assert.equal(
    supabaseConfig({
      SUPABASE_URL: " https://project.supabase.co/ ",
      SUPABASE_ANON_KEY: anonymous,
    }).key,
    anonymous,
  );
  assert.equal(
    supabaseConfig({ ...valid, SUPABASE_ANON_KEY: anonymous }).key,
    valid.SUPABASE_PUBLISHABLE_KEY,
  );
  assert.equal(workspaceEnabled(valid), true);
});

test("privileged and user-session credentials cannot be used as the application's Supabase API key", () => {
  for (const key of [
    "sb_secret_private_key",
    jwt("service_role"),
    jwt("authenticated"),
    "not-an-api-key",
    "header.not-json.signature",
    "",
  ]) {
    const env = { ...valid, SUPABASE_PUBLISHABLE_KEY: key };
    assert.throws(() => supabaseConfig(env), /workspace is unavailable/i);
    assert.equal(workspaceEnabled(env), false);
  }
  assert.throws(() =>
    supabaseConfig({
      ...valid,
      SUPABASE_PUBLISHABLE_KEY: "sb_secret_invalid_preferred_key",
      SUPABASE_ANON_KEY: jwt("anon"),
    }),
  );
});

test("Supabase origins reject unsafe URL components and allow HTTP only for local test providers", () => {
  for (const url of [
    "not-a-url",
    "http://project.supabase.co",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/path",
    "https://project.supabase.co?key=forbidden",
    "https://project.supabase.co/#fragment",
    "ftp://project.supabase.co",
  ]) {
    assert.throws(() => supabaseConfig({ ...valid, SUPABASE_URL: url }));
    assert.equal(workspaceEnabled({ ...valid, SUPABASE_URL: url }), false);
  }
  assert.equal(
    supabaseConfig({ ...valid, SUPABASE_URL: "http://127.0.0.1:54321" }).url,
    "http://127.0.0.1:54321",
  );
  assert.throws(() =>
    supabaseConfig({
      ...valid,
      SUPABASE_URL: "http://127.0.0.1:54321",
      VERCEL: "1",
    }),
  );
});

test("staff entrances stay unavailable for missing configuration and Vercel cannot enable local SQLite mode", () => {
  assert.equal(workspaceEnabled({}), false);
  assert.equal(workspaceEnabled({ APP_MODE: "supabase" }), false);
  assert.equal(workspaceEnabled({ ...valid, APP_MODE: "unknown" }), false);
  assert.equal(localWorkspaceEnabled({ APP_MODE: "local" }), true);
  assert.equal(workspaceEnabled({ APP_MODE: "local" }), true);
  assert.equal(
    localWorkspaceEnabled({ APP_MODE: "local", VERCEL: "1" }),
    false,
  );
  assert.equal(workspaceEnabled({ APP_MODE: "local", VERCEL: "1" }), false);
});
