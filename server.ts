import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

console.log("Starting server with Supabase and Password Auth...");

const supabaseUrl = process.env.SUPABASE_URL || "https://xelljsgmkdpjwyhhvssn.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_9xDXZvxyUwHeuwl_XZ0SUw_SI-zMklI";
// Use this client for system operations (always uses service role)
const supabase = createClient(supabaseUrl, supabaseKey);
// Helper to create a temporary client for password validation
const createAuthClient = () => createClient(supabaseUrl, supabaseKey);

console.log("Supabase initialized with URL:", supabaseUrl);
console.log("Supabase Key type:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SERVICE_ROLE" : "ANON/OTHER");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Admin routes may fail if RLS is enabled.");
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), provider: "supabase", auth: "password" });
  });

  // Ensure storage bucket exists
  const initStorage = async () => {
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) {
        console.error("Error listing buckets:", listError);
        return;
      }
      const exists = buckets && buckets.some(b => b.name === 'attachments');
      if (!exists) {
        console.log("Creating 'attachments' bucket...");
        const { error: createError } = await supabase.storage.createBucket('attachments', {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024, // 10MB
        });
        if (createError) {
          console.error("Error creating bucket:", createError);
        } else {
          console.log("'attachments' bucket created successfully.");
        }
      } else {
        console.log("'attachments' bucket already exists.");
      }
    } catch (e) {
      console.error("Storage initialization failed:", e);
    }
  };
  initStorage();

  // File Upload
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const file = req.file;
    const fileExt = path.extname(file.originalname);
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { data, error } = await supabase.storage
      .from("attachments")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error("Storage upload error details:", JSON.stringify(error, null, 2));
      if ((error as any).status === 404 || (error as any).message?.includes("not found")) {
        return res.status(500).json({ error: "Bucket de armazenamento 'attachments' não encontrado. Por favor, verifique se ele foi criado no Supabase." });
      }
      return res.status(500).json({ error: "Erro ao fazer upload do arquivo para o storage." });
    }

    const { data: { publicUrl } } = supabase.storage
      .from("attachments")
      .getPublicUrl(filePath);

    res.json({ url: publicUrl, name: file.originalname });
  });

  // --- API Routes ---

  // Auth
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    console.log(`[LOGIN ATTEMPT] Original: "${email}", Clean: "${cleanEmail}", Length: ${cleanEmail.length}`);

    const authClient = createAuthClient();

    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError) {
      console.error(`[LOGIN ERROR] Supabase Auth Error for ${email}:`, authError.message);
      return res.status(401).json({ error: authError.message });
    }

    console.log(`[LOGIN SUCCESS] Auth successful for ${email}. Fetching profile...`);

    // 2. Fetch profile from public.users
    const { data: user, error: profileError } = await supabase
      .from("users")
      .select(`
        *,
        sector_name:sectors(name),
        tenant_name:tenants(name)
      `)
      .ilike("email", cleanEmail)
      .single();

    if (profileError) {
      console.error(`[PROFILE ERROR] Error fetching profile for ${cleanEmail}:`, JSON.stringify(profileError, null, 2));
    }

    if (user) {
      const formattedUser = {
        ...user,
        sector_name: (user.sector_name as any)?.name,
        tenant_name: (user.tenant_name as any)?.name
      };
      console.log(`[LOGIN COMPLETE] Profile found for ${email}`);
      res.json(formattedUser);
    } else {
      console.warn(`[LOGIN FAILED] Profile not found in public.users for ${email}`);
      res.status(401).json({ error: "Perfil de usuário não encontrado no banco de dados." });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    const { email, name, password } = req.body;

    // 1. Create User in Supabase Auth
    const { data: authData, error: authError } = await createAuthClient().auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 2. Check if user was already invited (exists in public.users)
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (existingUser) {
      // Update existing invited user
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ name })
        .eq("id", existingUser.id)
        .select()
        .single();

      if (updateError) return res.status(400).json({ error: "Erro ao atualizar perfil." });
      return res.json({ success: true, user: updatedUser });
    }

    try {
      // 3. Create new organization for new user
      const { data: tenant, error: tError } = await supabase
        .from("tenants")
        .insert({ name: `Empresa de ${name}` })
        .select()
        .single();

      if (tError) throw tError;

      const { data: sector, error: sError } = await supabase
        .from("sectors")
        .insert({ tenant_id: tenant.id, name: "Administração" })
        .select()
        .single();

      if (sError) throw sError;

      const defaultStatuses = [
        { tenant_id: tenant.id, name: "Aberto", sequence: 1 },
        { tenant_id: tenant.id, name: "Em Atendimento", sequence: 2 },
        { tenant_id: tenant.id, name: "Em Revisão", sequence: 3 },
        { tenant_id: tenant.id, name: "Concluído", sequence: 4 }
      ];
      await supabase.from("statuses").insert(defaultStatuses);

      const { data: newUser, error: uError } = await supabase
        .from("users")
        .insert({
          tenant_id: tenant.id,
          sector_id: sector.id,
          name,
          email,
          role: "admin"
        })
        .select()
        .single();

      if (uError) throw uError;

      res.json({ success: true, user: newUser });
    } catch (err: any) {
      console.error("Signup error:", err);
      res.status(500).json({ error: "Erro ao criar organização após cadastro." });
    }
  });

  app.get("/api/sectors", async (req, res) => {
    const { tenant_id } = req.query;
    const { data: sectors } = await supabase
      .from("sectors")
      .select("*")
      .eq("tenant_id", tenant_id);
    res.json(sectors || []);
  });

  app.get("/api/users", async (req, res) => {
    const { tenant_id, sector_id } = req.query;
    let query = supabase.from("users").select("id, name, email, sector_id").eq("tenant_id", tenant_id);
    if (sector_id && sector_id !== 'null' && sector_id !== 'undefined') {
      query = query.eq("sector_id", sector_id);
    }

    const { data: users } = await query;
    res.json(users || []);
  });

  app.get("/api/statuses", async (req, res) => {
    const { tenant_id } = req.query;
    const { data: statuses } = await supabase
      .from("statuses")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("sequence");
    res.json(statuses || []);
  });

  app.get("/api/tickets", async (req, res) => {
    const { user_id, tenant_id, role, sector_solicitor, sector_executor, user_solicitor, user_executor, status_id } = req.query;

    let query = supabase
      .from("tickets")
      .select(`
        *,
        solicitor_name:users!tickets_solicitor_id_fkey(name),
        executor_name:users!tickets_executor_id_fkey(name),
        solicitor_sector_name:sectors!tickets_solicitor_sector_id_fkey(name),
        executor_sector_name:sectors!tickets_executor_sector_id_fkey(name),
        status_name:statuses(name),
        status_sequence:statuses(sequence)
      `)
      .eq("tenant_id", tenant_id);

    // Visibility Rules
    if (role !== 'admin') {
      // Supabase OR filter for complex visibility
      // Note: This assumes ticket_mentions is handled or simplified
      query = query.or(`solicitor_id.eq.${user_id},executor_id.eq.${user_id}`);
    }

    // Filters
    if (sector_solicitor) query = query.eq("solicitor_sector_id", sector_solicitor);
    if (sector_executor) query = query.eq("executor_sector_id", sector_executor);
    if (user_solicitor) query = query.eq("solicitor_id", user_solicitor);
    if (user_executor) query = query.eq("executor_id", user_executor);
    if (status_id) query = query.eq("status_id", status_id);

    const { data: tickets } = await query.order("created_at", { ascending: false });

    const formattedTickets = (tickets || []).map(t => ({
      ...t,
      solicitor_name: (t.solicitor_name as any)?.name,
      executor_name: (t.executor_name as any)?.name,
      solicitor_sector_name: (t.solicitor_sector_name as any)?.name,
      executor_sector_name: (t.executor_sector_name as any)?.name,
      status_name: (t.status_name as any)?.name,
      status_sequence: (t.status_sequence as any)?.sequence
    }));

    res.json(formattedTickets);
  });

  app.get("/api/tickets/:id", async (req, res) => {
    const { id } = req.params;
    const { data: ticket } = await supabase
      .from("tickets")
      .select(`
        *,
        solicitor_name:users!tickets_solicitor_id_fkey(name),
        executor_name:users!tickets_executor_id_fkey(name),
        solicitor_sector_name:sectors!tickets_solicitor_sector_id_fkey(name),
        executor_sector_name:sectors!tickets_executor_sector_id_fkey(name),
        status_name:statuses(name),
        status_sequence:statuses(sequence)
      `)
      .eq("id", id)
      .single();

    if (ticket) {
      const formattedTicket = {
        ...ticket,
        solicitor_name: (ticket.solicitor_name as any)?.name,
        executor_name: (ticket.executor_name as any)?.name,
        solicitor_sector_name: (ticket.solicitor_sector_name as any)?.name,
        executor_sector_name: (ticket.executor_sector_name as any)?.name,
        status_name: (ticket.status_name as any)?.name,
        status_sequence: (ticket.status_sequence as any)?.sequence
      };
      res.json(formattedTicket);
    } else {
      res.status(404).json({ error: "Ticket not found" });
    }
  });

  app.post("/api/tickets", async (req, res) => {
    const { tenant_id, title, description, solicitor_id, executor_id, solicitor_sector_id, executor_sector_id, attachments } = req.body;

    console.log("[CREATE TICKET] Body:", req.body);

    const s_id = Number(solicitor_sector_id);
    const e_id = executor_sector_id ? Number(executor_sector_id) : null;

    if (e_id && s_id === e_id) {
      return res.status(400).json({ error: "Tickets must be intersectoral." });
    }

    const { data: firstStatus } = await supabase
      .from("statuses")
      .select("id")
      .eq("tenant_id", tenant_id)
      .order("sequence")
      .limit(1)
      .single();

    if (!firstStatus) {
      return res.status(500).json({ error: "No statuses configured for this tenant." });
    }

    const final_executor_id = executor_id ? Number(executor_id) : null;

    const { data: result, error } = await supabase
      .from("tickets")
      .insert({
        tenant_id: Number(tenant_id),
        title,
        description,
        solicitor_id: Number(solicitor_id),
        executor_id: final_executor_id,
        solicitor_sector_id: s_id,
        executor_sector_id: e_id,
        status_id: firstStatus.id,
        attachments: attachments || []
      })
      .select()
      .single();

    if (error) {
      console.error("[CREATE TICKET] Supabase Error:", JSON.stringify(error, null, 2));
      return res.status(400).json({ error: error.message });
    }
    if (!result) return res.status(500).json({ error: "Failed to create ticket" });
    res.json({ id: result.id });
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    const { id } = req.params;
    const { user_id, title, description, attachments } = req.body;

    const { data: ticket } = await supabase.from("tickets").select("solicitor_id").eq("id", id).single();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const is_admin = await isAdmin(user_id);
    const is_solicitor = ticket.solicitor_id === Number(user_id);

    if (!is_admin && !is_solicitor) {
      return res.status(403).json({ error: "Acesso negado: Apenas o administrador ou o solicitante podem editar este ticket." });
    }

    const { error } = await supabase
      .from("tickets")
      .update({ title, description, attachments })
      .eq("id", id);

    if (error) return res.status(400).json({ error: error.message });

    await supabase.from("comments").insert({
      ticket_id: id,
      user_id,
      content: "Ticket editado pelo " + (is_admin ? "administrador" : "solicitante"),
      type: "system"
    });

    res.json({ success: true });
  });

  app.get("/api/tickets/:id/comments", async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.query;

    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", id).single();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    let query = supabase
      .from("comments")
      .select("*, user_name:users(name)")
      .eq("ticket_id", id);

    if (user_id && Number(user_id) === ticket.executor_id) {
      query = query.gte("created_at", ticket.last_assigned_at);
    }

    const { data: comments } = await query.order("created_at", { ascending: true });
    const formattedComments = (comments || []).map(c => ({
      ...c,
      user_name: (c.user_name as any)?.name
    }));
    res.json(formattedComments);
  });

  app.post("/api/tickets/:id/comments", async (req, res) => {
    const { id } = req.params;
    const { user_id, content, type, attachments } = req.body;

    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", id).single();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const { data: currentStatus } = await supabase.from("statuses").select("*").eq("id", ticket.status_id).single();

    if (currentStatus?.sequence === 1 && type !== 'system') {
      const { data: nextStatus } = await supabase
        .from("statuses")
        .select("id")
        .eq("tenant_id", ticket.tenant_id)
        .eq("sequence", 2)
        .single();

      if (nextStatus) {
        await supabase.from("tickets").update({ status_id: nextStatus.id }).eq("id", id);
        await supabase.from("comments").insert({
          ticket_id: id, user_id, content: "Status alterado automaticamente para Em Atendimento", type: "system"
        });
      }
    }

    const { data: result, error } = await supabase
      .from("comments")
      .insert({
        ticket_id: id,
        user_id,
        content,
        type: type || 'user',
        attachments: attachments || []
      })
      .select()
      .single();

    // Handle @mentions
    const mentions = content.match(/@\[([^\]]+)\]\((\d+)\)/g);
    if (mentions) {
      for (const m of mentions) {
        const userId = m.match(/\((\d+)\)/)?.[1];
        if (userId) {
          await supabase.from("ticket_mentions").upsert({ ticket_id: id, user_id: userId });
          await supabase.from("notifications").insert({
            user_id: userId, content: `Você foi mencionado no ticket #${id}`
          });
        }
      }
    }

    if (error) return res.status(400).json({ error: error.message });
    res.json({ id: result.id });
  });

  app.patch("/api/tickets/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status_id, user_id, role } = req.body;

    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", id).single();
    const { data: currentStatus } = await supabase.from("statuses").select("*").eq("id", ticket.status_id).single();
    const { data: targetStatus } = await supabase.from("statuses").select("*").eq("id", status_id).single();

    if (role !== 'admin' && currentStatus && targetStatus) {
      if (targetStatus.sequence !== currentStatus.sequence + 1) {
        return res.status(400).json({ error: "Invalid status transition. Progression must be linear." });
      }
    }

    await supabase.from("tickets").update({ status_id: Number(status_id) }).eq("id", Number(id));
    await supabase.from("comments").insert({
      ticket_id: Number(id), user_id: Number(user_id), content: `Status alterado para ${targetStatus?.name}`, type: "system"
    });

    res.json({ success: true });
  });

  app.get("/api/notifications/:user_id", async (req, res) => {
    const { user_id } = req.params;
    const { data: notifications } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_read", false)
      .order("created_at", { ascending: false });
    res.json(notifications || []);
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    const { id } = req.params;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    res.json({ success: true });
  });

  app.patch("/api/tenants/:id", async (req, res) => {
    const { id } = req.params;
    const { name, admin_id } = req.body;

    // Verify admin
    const { data: user } = await supabase.from("users").select("role").eq("id", admin_id).single();
    if (!user || user.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });

    const { error } = await supabase.from("tenants").update({ name }).eq("id", id);
    if (error) return res.status(400).json({ error: "Erro ao atualizar nome da empresa." });

    res.json({ success: true });
  });

  // --- Admin Endpoints ---
  const isAdmin = async (user_id: any) => {
    if (!user_id || user_id === 'undefined') {
      console.warn("isAdmin check failed: no user_id provided");
      return false;
    }

    try {
      // Try to handle both string and number IDs
      const id = isNaN(Number(user_id)) ? user_id : Number(user_id);

      // Use .select() instead of .single() to avoid the PGRST116 error if user not found
      const { data: users, error } = await supabase
        .from("users")
        .select("role, email")
        .eq("id", id);

      if (error) {
        console.error(`isAdmin check database error for ID ${id}:`, JSON.stringify(error));
        return false;
      }

      if (!users || users.length === 0) {
        console.warn(`isAdmin check failed: User with ID ${id} not found in database. This might happen if the session is stale or the database was reset.`);
        return false;
      }

      const user = users[0];
      const is_admin = user && user.role?.toLowerCase() === 'admin';

      if (!is_admin) {
        console.warn(`isAdmin check failed for user ${user?.email} (ID: ${id}): role is ${user?.role}`);
      }

      return is_admin;
    } catch (err) {
      console.error(`isAdmin check critical error for ID ${user_id}:`, err);
      return false;
    }
  };

  app.post("/api/admin/sectors", async (req, res) => {
    const { tenant_id, name, admin_id } = req.body;
    if (!(await isAdmin(admin_id))) {
      return res.status(403).json({ error: "Acesso negado: Você não tem permissão de administrador." });
    }

    try {
      const { data: result, error } = await supabase
        .from("sectors")
        .insert({ tenant_id, name })
        .select()
        .single();
      if (error) {
        console.error("Supabase insert error (sectors):", error);
        return res.status(400).json({ error: error.message });
      }
      res.json(result);
    } catch (err) {
      console.error("API /admin/sectors error:", err);
      res.status(500).json({ error: "Erro interno do servidor ao criar setor." });
    }
  });

  app.post("/api/admin/users", async (req, res) => {
    const { tenant_id, sector_id, name, email, role, admin_id } = req.body;
    if (!(await isAdmin(admin_id))) {
      return res.status(403).json({ error: "Acesso negado: Você não tem permissão de administrador." });
    }

    const { data: result, error } = await supabase
      .from("users")
      .insert({ tenant_id, sector_id, name, email, role })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(result);
  });

  app.get("/api/admin/users", async (req, res) => {
    const { tenant_id, admin_id } = req.query;

    if (!admin_id || admin_id === 'undefined') {
      return res.status(400).json({ error: "admin_id is required" });
    }

    try {
      if (!(await isAdmin(admin_id))) {
        return res.status(403).json({ error: "Acesso negado: Você não tem permissão de administrador." });
      }

      const { data: users, error } = await supabase
        .from("users")
        .select("*, sector_name:sectors(name)")
        .eq("tenant_id", tenant_id);

      if (error) throw error;

      const formattedUsers = (users || []).map(u => ({
        ...u,
        sector_name: (u.sector_name as any)?.name
      }));
      res.json(formattedUsers);
    } catch (err) {
      console.error("Error in GET /api/admin/users:", err);
      res.status(500).json({ error: "Erro ao buscar usuários administrativos." });
    }
  });

  app.delete("/api/admin/sectors/:id", async (req, res) => {
    const { id } = req.params;
    const { admin_id } = req.query;

    console.log(`[DELETE SECTOR] ID: ${id}, Admin: ${admin_id}`);

    if (!(await isAdmin(admin_id))) {
      return res.status(403).json({ error: "Acesso negado: Você não tem permissão de administrador." });
    }

    try {
      const sectorId = Number(id);
      if (isNaN(sectorId)) return res.status(400).json({ error: "ID de setor inválido." });

      // Check for users in this sector
      const { count: userCount, error: userErr } = await supabase.from("users").select("*", { count: 'exact', head: true }).eq("sector_id", sectorId);
      if (userErr) throw userErr;

      if (userCount && userCount > 0) {
        return res.status(400).json({ error: "Não é possível excluir um setor que possui usuários vinculados. Remova ou mova os usuários primeiro." });
      }

      // Check for tickets linked to this sector
      const { count: ticketCount, error: ticketErr } = await supabase.from("tickets")
        .select("*", { count: 'exact', head: true })
        .or(`solicitor_sector_id.eq.${sectorId},executor_sector_id.eq.${sectorId}`);

      if (ticketErr) throw ticketErr;

      if (ticketCount && ticketCount > 0) {
        return res.status(400).json({ error: "Este setor possui histórico de tickets e não pode ser excluído para preservar a integridade dos dados." });
      }

      const { error } = await supabase.from("sectors").delete().eq("id", sectorId);
      if (error) {
        console.error("Supabase delete sector error:", error);
        return res.status(400).json({ error: "Erro ao excluir setor no banco de dados: " + error.message });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Critical error deleting sector:", err);
      res.status(500).json({ error: "Erro interno ao excluir setor: " + (err.message || "Erro desconhecido") });
    }
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    const { id } = req.params;
    const { admin_id } = req.query;

    console.log(`[DELETE USER] Target ID: ${id}, Admin: ${admin_id}`);

    if (!(await isAdmin(admin_id))) {
      return res.status(403).json({ error: "Acesso negado: Você não tem permissão de administrador." });
    }

    if (String(id) === String(admin_id)) {
      return res.status(400).json({ error: "Você não pode excluir a sua própria conta administrativa." });
    }

    try {
      const targetId = Number(id);
      if (isNaN(targetId)) return res.status(400).json({ error: "ID de usuário inválido." });

      const { data: targetUser, error: targetErr } = await supabase.from("users").select("role").eq("id", targetId).single();
      if (targetErr && targetErr.code !== 'PGRST116') throw targetErr;

      if (targetUser?.role === 'admin') {
        return res.status(400).json({ error: "Não é permitido excluir outros administradores pelo painel." });
      }

      // Check for tickets linked to this user
      const { count: ticketCount, error: ticketErr } = await supabase.from("tickets")
        .select("*", { count: 'exact', head: true })
        .or(`solicitor_id.eq.${targetId},executor_id.eq.${targetId}`);

      if (ticketErr) throw ticketErr;

      if (ticketCount && ticketCount > 0) {
        return res.status(400).json({ error: "Este colaborador possui tickets vinculados (como solicitante ou executor) e não pode ser excluído." });
      }

      // Check for comments
      const { count: commentCount, error: commentErr } = await supabase.from("comments").select("*", { count: 'exact', head: true }).eq("user_id", targetId);
      if (commentErr) throw commentErr;

      if (commentCount && commentCount > 0) {
        return res.status(400).json({ error: "Este colaborador possui comentários registrados em tickets e não pode ser excluído." });
      }

      // Cleanup notifications before deleting user to avoid FK issues
      await supabase.from("notifications").delete().eq("user_id", targetId);

      const { error } = await supabase.from("users").delete().eq("id", targetId);
      if (error) {
        console.error("Supabase delete user error:", error);
        return res.status(400).json({ error: "Erro ao excluir usuário no banco de dados: " + error.message });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Critical error deleting user:", err);
      res.status(500).json({ error: "Erro interno ao excluir usuário: " + (err.message || "Erro desconhecido") });
    }
  });

  // Global Error Handler - Ensure we always return JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: process.env.NODE_ENV === 'production' ? "Ocorreu um erro interno no servidor." : err.message
    });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
