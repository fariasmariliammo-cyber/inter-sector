import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting server with Supabase and Password Auth...");

const supabaseUrl = process.env.SUPABASE_URL || "https://xelljsgmkdpjwyhhvssn.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_9xDXZvxyUwHeuwl_XZ0SUw_SI-zMklI";
const supabase = createClient(supabaseUrl, supabaseKey);

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

  // --- API Routes ---

  // Auth
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    // 2. Fetch profile from public.users
    const { data: user, error: profileError } = await supabase
      .from("users")
      .select(`
        *,
        sector_name:sectors(name),
        tenant_name:tenants(name)
      `)
      .eq("email", email)
      .single();
    
    if (user) {
      const formattedUser = {
        ...user,
        sector_name: (user.sector_name as any)?.name,
        tenant_name: (user.tenant_name as any)?.name
      };
      res.json(formattedUser);
    } else {
      res.status(401).json({ error: "Perfil de usuário não encontrado no banco de dados." });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    const { email, name, password } = req.body;

    // 1. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
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
    if (sector_id) query = query.eq("sector_id", sector_id);
    
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
      status_sequence: (t.status_name as any)?.sequence
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
        status_sequence: (ticket.status_name as any)?.sequence
      };
      res.json(formattedTicket);
    } else {
      res.status(404).json({ error: "Ticket not found" });
    }
  });

  app.post("/api/tickets", async (req, res) => {
    const { tenant_id, title, description, solicitor_id, executor_id, solicitor_sector_id, executor_sector_id } = req.body;
    
    if (solicitor_sector_id === executor_sector_id) {
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

    const { data: result, error } = await supabase
      .from("tickets")
      .insert({
        tenant_id, title, description, solicitor_id, executor_id, 
        solicitor_sector_id, executor_sector_id, status_id: firstStatus.id,
        last_assigned_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ id: result.id });
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
    const { user_id, content, type } = req.body;

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
      .insert({ ticket_id: id, user_id, content, type: type || 'user' })
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

    await supabase.from("tickets").update({ status_id }).eq("id", id);
    await supabase.from("comments").insert({
      ticket_id: id, user_id, content: `Status alterado para ${targetStatus?.name}`, type: "system"
    });

    res.json({ success: true });
  });

  app.patch("/api/tickets/:id/reassign", async (req, res) => {
    const { id } = req.params;
    const { executor_id, user_id } = req.body;

    const { data: newExecutor } = await supabase.from("users").select("name").eq("id", executor_id).single();

    await supabase.from("tickets").update({ 
      executor_id, 
      last_assigned_at: new Date().toISOString() 
    }).eq("id", id);
    
    await supabase.from("comments").insert({
      ticket_id: id, user_id, content: `Ticket reatribuído para ${newExecutor?.name}`, type: "system"
    });

    await supabase.from("notifications").insert({
      user_id: executor_id, content: `Você recebeu a atribuição do ticket #${id}`
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

  // --- Admin Endpoints ---
  const isAdmin = async (user_id: any) => {
    const { data: user } = await supabase.from("users").select("role").eq("id", user_id).single();
    return user && user.role === 'admin';
  };

  app.post("/api/admin/sectors", async (req, res) => {
    const { tenant_id, name, admin_id } = req.body;
    if (!(await isAdmin(admin_id))) return res.status(403).json({ error: "Unauthorized" });
    
    const { data: result, error } = await supabase
      .from("sectors")
      .insert({ tenant_id, name })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(result);
  });

  app.post("/api/admin/users", async (req, res) => {
    const { tenant_id, sector_id, name, email, role, admin_id } = req.body;
    if (!(await isAdmin(admin_id))) return res.status(403).json({ error: "Unauthorized" });

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
    if (!(await isAdmin(admin_id))) return res.status(403).json({ error: "Unauthorized" });

    const { data: users } = await supabase
      .from("users")
      .select("*, sector_name:sectors(name)")
      .eq("tenant_id", tenant_id);
      
    const formattedUsers = (users || []).map(u => ({
      ...u,
      sector_name: (u.sector_name as any)?.name
    }));
    res.json(formattedUsers);
  });

  app.delete("/api/admin/sectors/:id", async (req, res) => {
    const { id } = req.params;
    const { admin_id } = req.query;
    if (!(await isAdmin(admin_id))) return res.status(403).json({ error: "Unauthorized" });

    const { count } = await supabase.from("users").select("*", { count: 'exact', head: true }).eq("sector_id", id);
    if (count && count > 0) {
      return res.status(400).json({ error: "Não é possível excluir um setor que possui usuários vinculados." });
    }

    const { error } = await supabase.from("sectors").delete().eq("id", id);
    if (error) return res.status(400).json({ error: "Erro ao excluir setor." });
    res.json({ success: true });
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    const { id } = req.params;
    const { admin_id } = req.query;
    if (!(await isAdmin(admin_id))) return res.status(403).json({ error: "Unauthorized" });

    if (id === admin_id) return res.status(400).json({ error: "Você não pode excluir a si mesmo." });

    const { data: targetUser } = await supabase.from("users").select("role").eq("id", id).single();
    if (targetUser?.role === 'admin') {
      return res.status(400).json({ error: "Não é permitido excluir outros administradores." });
    }

    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) return res.status(400).json({ error: "Erro ao excluir usuário." });
    res.json({ success: true });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
