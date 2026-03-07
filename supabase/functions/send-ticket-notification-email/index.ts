import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type JsonMap = Record<string, unknown>;

type AppUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: string | null;
  sector_id: number | null;
  tenant_id: number | null;
};

type TicketRow = {
  id: number;
  title: string | null;
  solicitor_id: number | null;
  executor_id: number | null;
  executor_sector_id: number | null;
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

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  const out = new Set<number>();
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (!Number.isNaN(value)) out.add(value);
  }
  return [...out];
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

  const ticketId = toNumber(payload.ticket_id);
  const content = typeof payload.content === "string" ? payload.content : "";
  const actorUserId = toNumber(payload.actor_user_id);

  if (!ticketId) {
    return jsonResponse({ error: "ticket_id is required" }, 400);
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

  const authEmail = authData.user.email || "";
  const { data: actorUser, error: actorError } = await adminClient
    .from("users")
    .select("id, name, email, role, sector_id, tenant_id")
    .ilike("email", authEmail)
    .maybeSingle();

  if (actorError || !actorUser) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (actorUserId && actorUser.id !== actorUserId) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: ticket, error: ticketError } = await adminClient
    .from("tickets")
    .select("id, title, solicitor_id, executor_id, executor_sector_id, tenant_id")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError || !ticket) {
    return jsonResponse({ error: "Ticket not found" }, 404);
  }

  const actor = actorUser as AppUser;
  const ticketRow = ticket as TicketRow;
  const isAdmin = (actor.role || "").toLowerCase() === "admin";
  const isInvolved =
    actor.id === ticketRow.solicitor_id ||
    actor.id === ticketRow.executor_id ||
    (ticketRow.executor_id === null &&
      actor.sector_id !== null &&
      actor.sector_id === ticketRow.executor_sector_id);

  if (!isAdmin && !isInvolved) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const recipientIds = new Set<number>();
  if (ticketRow.solicitor_id) recipientIds.add(ticketRow.solicitor_id);
  if (ticketRow.executor_id) {
    recipientIds.add(ticketRow.executor_id);
  } else if (ticketRow.executor_sector_id) {
    const { data: sectorUsers } = await adminClient
      .from("users")
      .select("id")
      .eq("sector_id", ticketRow.executor_sector_id)
      .eq("tenant_id", ticketRow.tenant_id);

    for (const userRow of sectorUsers || []) {
      if (userRow?.id) recipientIds.add(userRow.id);
    }
  }

  const { data: mentions } = await adminClient
    .from("ticket_mentions")
    .select("user_id")
    .eq("ticket_id", ticketId);

  for (const mention of mentions || []) {
    if (mention?.user_id) recipientIds.add(mention.user_id);
  }

  const uniqueRecipientIds = uniqueNumbers([...recipientIds]);
  if (uniqueRecipientIds.length === 0) {
    return jsonResponse({ success: true, sent: 0 }, 200);
  }

  const { data: recipients, error: recipientsError } = await adminClient
    .from("users")
    .select("id, email, name")
    .in("id", uniqueRecipientIds);

  if (recipientsError || !recipients) {
    return jsonResponse({ error: "Failed to load recipients" }, 500);
  }

  const toList = recipients
    .map((row) => ({ email: row.email }))
    .filter((row) => row.email);

  if (toList.length === 0) {
    return jsonResponse({ success: true, sent: 0 }, 200);
  }

  const actorName = actorUser?.name || "Alguem";
  const subject = `Atualizacao no ticket #${ticketId}`;
  const ticketTitle = ticketRow.title || "";
  const safeActorName = escapeHtml(actorName);
  const safeTicketTitle = escapeHtml(ticketTitle);
  const safeContent = escapeHtml(content);
  const detailsLines = [
    `Ticket: #${ticketId}${ticketTitle ? ` - ${ticketTitle}` : ""}`,
    `Atualizado por: ${actorName}`,
    content ? `Resumo: ${content}` : null,
    `Acesse: ${appBaseUrl}`,
  ].filter(Boolean);

  const text = `${detailsLines.join("\n")}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2933;">
      <h2 style="margin: 0 0 12px;">Atualizacao no ticket #${ticketId}</h2>
      <p style="margin: 0 0 12px;">Ticket: <strong>#${ticketId}</strong>${
        safeTicketTitle ? ` - ${safeTicketTitle}` : ""
      }</p>
      <p style="margin: 0 0 12px;">Atualizado por: <strong>${safeActorName}</strong></p>
      ${safeContent ? `<p style="margin: 0 0 12px;">Resumo: ${safeContent}</p>` : ""}
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
      personalizations: [
        {
          to: toList,
          subject,
        },
      ],
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

  return jsonResponse({ success: true, sent: toList.length }, 200);
});
