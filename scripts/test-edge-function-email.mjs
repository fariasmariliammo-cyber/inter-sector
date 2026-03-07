#!/usr/bin/env node

/**
 * End-to-end tester for Supabase Edge Functions that require JWT.
 *
 * Required env vars:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - TEST_USER_EMAIL
 * - TEST_USER_PASSWORD
 *
 * Optional env vars:
 * - FUNCTION_NAME (default: send-ticket-notification-email)
 * - FUNCTION_PAYLOAD_JSON (default: {"ticket_id":1,"content":"Teste manual","actor_user_id":1})
 */

const supabaseUrlRaw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.TEST_USER_EMAIL || "alvarojfjunior@gmail.com";
const password = process.env.TEST_USER_PASSWORD || "juninskt11";
const functionName = process.env.FUNCTION_NAME || "send-ticket-notification-email";

if (!supabaseUrlRaw) {
  console.error("Missing env var: SUPABASE_URL (or VITE_SUPABASE_URL)");
  process.exit(1);
}

if (!anonKey) {
  console.error("Missing env var: SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)");
  process.exit(1);
}

if (!email) {
  console.error("Missing env var: TEST_USER_EMAIL");
  process.exit(1);
}

if (!password) {
  console.error("Missing env var: TEST_USER_PASSWORD");
  process.exit(1);
}

const supabaseUrl = supabaseUrlRaw.replace(/\/+$/, "");

let payload = {
  ticket_id: 1,
  content: "Teste manual",
  actor_user_id: 1,
};

if (process.env.FUNCTION_PAYLOAD_JSON) {
  try {
    payload = JSON.parse(process.env.FUNCTION_PAYLOAD_JSON);
  } catch (error) {
    console.error("Invalid FUNCTION_PAYLOAD_JSON:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function login() {
  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const bodyText = await response.text();
  let json = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    // no-op
  }

  return { status: response.status, json, bodyText };
}

async function invokeFunction(accessToken) {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let json = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    // no-op
  }

  return { status: response.status, json, bodyText };
}

async function main() {
  console.log(`Testing function: ${functionName}`);
  console.log(`Supabase project: ${supabaseUrl}`);

  const loginResult = await login();
  console.log(`Auth status: ${loginResult.status}`);
  if (loginResult.status !== 200 || !loginResult.json?.access_token) {
    console.error("Auth failed:");
    console.error(loginResult.json ?? loginResult.bodyText);
    process.exit(1);
  }

  const accessToken = loginResult.json.access_token;
  console.log("Auth ok. Invoking function...");
  const invokeResult = await invokeFunction(accessToken);
  console.log(`Function status: ${invokeResult.status}`);
  console.log("Function response:");
  console.log(invokeResult.json ?? invokeResult.bodyText);

  if (invokeResult.status >= 400) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
