import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type JsonMap = Record<string, unknown>;

type AppUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: string | null;
  tenant_id: number | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: JsonMap, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: JsonMap = {};
  try {
    payload = (await req.json()) as JsonMap;
  } catch {
    payload = {};
  }

  const invitedUserName =
    typeof payload.invited_user_name === "string" ? payload.invited_user_name.trim() : "";
  const invitedUserEmail =
    typeof payload.invited_user_email === "string"
      ? normalizeEmail(payload.invited_user_email)
      : "";
  const invitedUserRole = typeof payload.role === "string" ? payload.role.trim().toLowerCase() : "";
  const invitedUserId = toNumber(payload.invited_user_id);
  const tenantId = toNumber(payload.tenant_id);
  const adminUserId = toNumber(payload.admin_user_id);

  if (!invitedUserName || !invitedUserEmail || !tenantId || !adminUserId || !invitedUserId) {
    return jsonResponse({ error: "Missing required invitation fields" }, 400);
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing required env: SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY");
  }
  const sendgridApiKey = getRequiredEnv("SENDGRID_API_KEY");
  const sendgridFromEmail = getRequiredEnv("SENDGRID_FROM_EMAIL");
  const sendgridFromName = Deno.env.get("SENDGRID_FROM_NAME") || "Gestao 360";
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://www.gestao360online.com.br/";

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const authEmail = normalizeEmail(authData.user.email || "");
  const { data: actorUser, error: actorError } = await adminClient
    .from("users")
    .select("id, name, email, role, tenant_id")
    .ilike("email", authEmail)
    .maybeSingle();

  if (actorError || !actorUser) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const actor = actorUser as AppUser;
  const actorIsAdmin = (actor.role || "").toLowerCase() === "admin";

  if (!actorIsAdmin || actor.id !== adminUserId || actor.tenant_id !== tenantId) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: invitedUser, error: invitedUserError } = await adminClient
    .from("users")
    .select("id, tenant_id, email")
    .eq("id", invitedUserId)
    .maybeSingle();

  if (invitedUserError || !invitedUser) {
    return jsonResponse({ error: "Invited user not found" }, 404);
  }

  if (invitedUser.tenant_id !== tenantId || normalizeEmail(invitedUser.email || "") !== invitedUserEmail) {
    return jsonResponse({ error: "Invited user mismatch" }, 400);
  }

  const { data: tenantRow, error: tenantError } = await adminClient
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError) {
    return jsonResponse({ error: "Failed to load tenant" }, 500);
  }

  const actorName = actor.name?.trim() || "Administrador";
  const tenantName = tenantRow?.name?.trim() || "sua organizacao";
  const inviteRoleText = invitedUserRole === "admin" ? "administrador" : "colaborador";

  const safeActorName = escapeHtml(actorName);
  const safeInvitedUserName = escapeHtml(invitedUserName);
  const safeTenantName = escapeHtml(tenantName);

  const subject = `Convite para acessar o ${tenantName} no Gestao 360`;
  const text = [
    `Ola, ${invitedUserName}!`,
    "",
    `${actorName} convidou voce para acessar o tenant ${tenantName} no Gestao 360 como ${inviteRoleText}.`,
    "Use este e-mail para criar sua conta e entrar na plataforma.",
    "",
    `Acesse: ${appBaseUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2933;">
      <h2 style="margin: 0 0 12px;">Voce recebeu um convite no Gestao 360</h2>
      <p style="margin: 0 0 12px;">Ola, <strong>${safeInvitedUserName}</strong>!</p>
      <p style="margin: 0 0 12px;">
        <strong>${safeActorName}</strong> convidou voce para acessar o tenant
        <strong>${safeTenantName}</strong> como <strong>${inviteRoleText}</strong>.
      </p>
      <p style="margin: 0 0 12px;">Use este e-mail para criar sua conta e entrar na plataforma.</p>
      <p style="margin: 16px 0 0;">
        <a href="${appBaseUrl}" style="color: #0f62fe;">Abrir Gestao 360</a>
      </p>
    </div>
  `;

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: invitedUserEmail }], subject }],
      from: {
        email: sendgridFromEmail,
        name: sendgridFromName,
      },
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return jsonResponse({ error: "SendGrid error", detail: errorBody }, 502);
  }

  return jsonResponse({ success: true }, 200);
});
