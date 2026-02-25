import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting server...");

let db: Database.Database;
try {
  db = new Database("tickets.db");
  console.log("Database connected.");
} catch (err) {
  console.error("Failed to connect to database:", err);
  process.exit(1);
}

// Initialize Database
try {
  db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    sector_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    theme TEXT DEFAULT 'light',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (sector_id) REFERENCES sectors(id)
  );

  CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    solicitor_id INTEGER NOT NULL,
    executor_id INTEGER NOT NULL,
    solicitor_sector_id INTEGER NOT NULL,
    executor_sector_id INTEGER NOT NULL,
    status_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (solicitor_id) REFERENCES users(id),
    FOREIGN KEY (executor_id) REFERENCES users(id),
    FOREIGN KEY (status_id) REFERENCES statuses(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    is_persistent INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_mentions (
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (ticket_id, user_id),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
  console.log("Database schema initialized.");
} catch (err) {
  console.error("Failed to initialize database schema:", err);
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Seed initial data if empty
const tenantCount = db.prepare("SELECT COUNT(*) as count FROM tenants").get() as { count: number };
if (tenantCount.count === 0) {
  const insertTenant = db.prepare("INSERT INTO tenants (name) VALUES (?)");
  const t1 = insertTenant.run("Empresa Alpha").lastInsertRowid;
  
  const insertSector = db.prepare("INSERT INTO sectors (tenant_id, name) VALUES (?, ?)");
  const s1 = insertSector.run(t1, "TI").lastInsertRowid;
  const s2 = insertSector.run(t1, "RH").lastInsertRowid;
  const s3 = insertSector.run(t1, "Financeiro").lastInsertRowid;

  const insertUser = db.prepare("INSERT INTO users (tenant_id, sector_id, name, email, role) VALUES (?, ?, ?, ?, ?)");
  insertUser.run(t1, s1, "Admin Alpha", "admin@alpha.com", "admin");
  insertUser.run(t1, s1, "Dev One", "dev1@alpha.com", "user");
  insertUser.run(t1, s2, "RH Manager", "rh@alpha.com", "user");
  insertUser.run(t1, s3, "Fin Admin", "fin@alpha.com", "user");

  const insertStatus = db.prepare("INSERT INTO statuses (tenant_id, name, sequence) VALUES (?, ?, ?)");
  insertStatus.run(t1, "Aberto", 1);
  insertStatus.run(t1, "Em Atendimento", 2);
  insertStatus.run(t1, "Em Revisão", 3);
  insertStatus.run(t1, "Concluído", 4);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // --- API Routes ---

  // Auth Mock (In a real app, use JWT)
  app.post("/api/auth/login", (req, res) => {
    const { email } = req.body;
    const user = db.prepare(`
      SELECT u.*, s.name as sector_name, t.name as tenant_name 
      FROM users u 
      JOIN sectors s ON u.sector_id = s.id 
      JOIN tenants t ON u.tenant_id = t.id 
      WHERE u.email = ?
    `).get(email);
    
    if (user) {
      res.json(user);
    } else {
      res.status(401).json({ error: "User not found" });
    }
  });

  app.get("/api/sectors", (req, res) => {
    const { tenant_id } = req.query;
    const sectors = db.prepare("SELECT * FROM sectors WHERE tenant_id = ?").all(tenant_id);
    res.json(sectors);
  });

  app.get("/api/users", (req, res) => {
    const { tenant_id, sector_id } = req.query;
    let query = "SELECT id, name, email, sector_id FROM users WHERE tenant_id = ?";
    const params = [tenant_id];
    if (sector_id) {
      query += " AND sector_id = ?";
      params.push(sector_id);
    }
    const users = db.prepare(query).all(...params);
    res.json(users);
  });

  app.get("/api/statuses", (req, res) => {
    const { tenant_id } = req.query;
    const statuses = db.prepare("SELECT * FROM statuses WHERE tenant_id = ? ORDER BY sequence").all(tenant_id);
    res.json(statuses);
  });

  app.get("/api/tickets", (req, res) => {
    const { user_id, tenant_id, role, sector_solicitor, sector_executor, user_solicitor, user_executor, status_id } = req.query;
    
    let query = `
      SELECT t.*, 
             u1.name as solicitor_name, u2.name as executor_name,
             s1.name as solicitor_sector_name, s2.name as executor_sector_name,
             st.name as status_name, st.sequence as status_sequence
      FROM tickets t
      JOIN users u1 ON t.solicitor_id = u1.id
      JOIN users u2 ON t.executor_id = u2.id
      JOIN sectors s1 ON t.solicitor_sector_id = s1.id
      JOIN sectors s2 ON t.executor_sector_id = s2.id
      JOIN statuses st ON t.status_id = st.id
      WHERE t.tenant_id = ?
    `;
    const params: any[] = [tenant_id];

    // Visibility Rules
    if (role !== 'admin') {
      query += ` AND (t.solicitor_id = ? OR t.executor_id = ? OR t.id IN (SELECT ticket_id FROM ticket_mentions WHERE user_id = ?))`;
      params.push(user_id, user_id, user_id);
    }

    // Filters
    if (sector_solicitor) { query += " AND t.solicitor_sector_id = ?"; params.push(sector_solicitor); }
    if (sector_executor) { query += " AND t.executor_sector_id = ?"; params.push(sector_executor); }
    if (user_solicitor) { query += " AND t.solicitor_id = ?"; params.push(user_solicitor); }
    if (user_executor) { query += " AND t.executor_id = ?"; params.push(user_executor); }
    if (status_id) { query += " AND t.status_id = ?"; params.push(status_id); }

    query += " ORDER BY t.created_at DESC";
    
    const tickets = db.prepare(query).all(...params);
    res.json(tickets);
  });

  app.get("/api/tickets/:id", (req, res) => {
    const { id } = req.params;
    const ticket = db.prepare(`
      SELECT t.*, 
             u1.name as solicitor_name, u2.name as executor_name,
             s1.name as solicitor_sector_name, s2.name as executor_sector_name,
             st.name as status_name, st.sequence as status_sequence
      FROM tickets t
      JOIN users u1 ON t.solicitor_id = u1.id
      JOIN users u2 ON t.executor_id = u2.id
      JOIN sectors s1 ON t.solicitor_sector_id = s1.id
      JOIN sectors s2 ON t.executor_sector_id = s2.id
      JOIN statuses st ON t.status_id = st.id
      WHERE t.id = ?
    `).get(id);
    res.json(ticket);
  });

  app.post("/api/tickets", (req, res) => {
    const { tenant_id, title, description, solicitor_id, executor_id, solicitor_sector_id, executor_sector_id } = req.body;
    
    // RN01: Proibido criar tickets para o próprio setor ou para si mesmo
    if (solicitor_sector_id === executor_sector_id) {
      return res.status(400).json({ error: "Tickets must be intersectoral." });
    }

    const firstStatus = db.prepare("SELECT id FROM statuses WHERE tenant_id = ? ORDER BY sequence LIMIT 1").get(tenant_id) as { id: number } | undefined;
    
    if (!firstStatus) {
      return res.status(500).json({ error: "No statuses configured for this tenant." });
    }

    const result = db.prepare(`
      INSERT INTO tickets (tenant_id, title, description, solicitor_id, executor_id, solicitor_sector_id, executor_sector_id, status_id, last_assigned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenant_id, title, description, solicitor_id, executor_id, solicitor_sector_id, executor_sector_id, firstStatus.id);

    res.json({ id: result.lastInsertRowid });
  });

  app.get("/api/tickets/:id/comments", (req, res) => {
    const { id } = req.params;
    const { user_id } = req.query;

    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
    
    let query = `
      SELECT c.*, u.name as user_name 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.ticket_id = ? 
    `;
    const params: any[] = [id];

    // RN03: O histórico de atribuições anteriores fica oculto para o novo executor
    if (user_id && Number(user_id) === ticket.executor_id) {
      query += " AND c.created_at >= ?";
      params.push(ticket.last_assigned_at);
    }

    query += " ORDER BY c.created_at ASC";
    const comments = db.prepare(query).all(...params);
    res.json(comments);
  });

  app.post("/api/tickets/:id/comments", (req, res) => {
    const { id } = req.params;
    const { user_id, content, type } = req.body;

    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const currentStatus = db.prepare("SELECT * FROM statuses WHERE id = ?").get(ticket.status_id) as any;
    if (!currentStatus) return res.status(500).json({ error: "Current status not found" });
    
    // Automatic transition to "Em Atendimento" (sequence 2) on first user comment if currently at sequence 1
    if (currentStatus.sequence === 1 && type !== 'system') {
      const nextStatus = db.prepare("SELECT id FROM statuses WHERE tenant_id = ? AND sequence = 2").get(ticket.tenant_id) as any;
      if (nextStatus) {
        db.prepare("UPDATE tickets SET status_id = ? WHERE id = ?").run(nextStatus.id, id);
        // Add system comment for transition
        db.prepare("INSERT INTO comments (ticket_id, user_id, content, type) VALUES (?, ?, ?, ?)")
          .run(id, user_id, "Status alterado automaticamente para Em Atendimento", "system");
      }
    }

    const result = db.prepare("INSERT INTO comments (ticket_id, user_id, content, type) VALUES (?, ?, ?, ?)")
      .run(id, user_id, content, type || 'user');

    // Handle @mentions
    const mentions = content.match(/@\[([^\]]+)\]\((\d+)\)/g);
    if (mentions) {
      mentions.forEach((m: string) => {
        const userId = m.match(/\((\d+)\)/)?.[1];
        if (userId) {
          db.prepare("INSERT OR IGNORE INTO ticket_mentions (ticket_id, user_id) VALUES (?, ?)").run(id, userId);
          db.prepare("INSERT INTO notifications (user_id, content) VALUES (?, ?)")
            .run(userId, `Você foi mencionado no ticket #${id}`);
        }
      });
    }

    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/tickets/:id/status", (req, res) => {
    const { id } = req.params;
    const { status_id, user_id, role } = req.body;

    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
    const currentStatus = db.prepare("SELECT * FROM statuses WHERE id = ?").get(ticket.status_id) as any;
    const targetStatus = db.prepare("SELECT * FROM statuses WHERE id = ?").get(status_id) as any;

    // Workflow validation
    if (role !== 'admin') {
      if (targetStatus.sequence !== currentStatus.sequence + 1) {
        return res.status(400).json({ error: "Invalid status transition. Progression must be linear." });
      }
    }

    db.prepare("UPDATE tickets SET status_id = ? WHERE id = ?").run(status_id, id);
    
    // System log
    db.prepare("INSERT INTO comments (ticket_id, user_id, content, type) VALUES (?, ?, ?, ?)")
      .run(id, user_id, `Status alterado para ${targetStatus.name}`, "system");

    res.json({ success: true });
  });

  app.patch("/api/tickets/:id/reassign", (req, res) => {
    const { id } = req.params;
    const { executor_id, user_id } = req.body;

    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
    const newExecutor = db.prepare("SELECT name FROM users WHERE id = ?").get(executor_id) as any;

    db.prepare("UPDATE tickets SET executor_id = ?, last_assigned_at = CURRENT_TIMESTAMP WHERE id = ?").run(executor_id, id);
    
    // System log
    db.prepare("INSERT INTO comments (ticket_id, user_id, content, type) VALUES (?, ?, ?, ?)")
      .run(id, user_id, `Ticket reatribuído para ${newExecutor.name}`, "system");

    // Notify new executor
    db.prepare("INSERT INTO notifications (user_id, content) VALUES (?, ?)")
      .run(executor_id, `Você recebeu a atribuição do ticket #${id}`);

    res.json({ success: true });
  });

  app.get("/api/notifications/:user_id", (req, res) => {
    const { user_id } = req.params;
    const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC").all(user_id);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // --- Admin Endpoints ---
  const isAdmin = (user_id: any) => {
    const user = db.prepare("SELECT role FROM users WHERE id = ?").get(user_id) as any;
    return user && user.role === 'admin';
  };

  app.post("/api/admin/sectors", (req, res) => {
    const { tenant_id, name, admin_id } = req.body;
    if (!isAdmin(admin_id)) return res.status(403).json({ error: "Unauthorized" });
    
    const result = db.prepare("INSERT INTO sectors (tenant_id, name) VALUES (?, ?)").run(tenant_id, name);
    res.json({ id: result.lastInsertRowid, tenant_id, name });
  });

  app.post("/api/admin/users", (req, res) => {
    const { tenant_id, sector_id, name, email, role, admin_id } = req.body;
    if (!isAdmin(admin_id)) return res.status(403).json({ error: "Unauthorized" });

    try {
      const result = db.prepare("INSERT INTO users (tenant_id, sector_id, name, email, role) VALUES (?, ?, ?, ?, ?)")
        .run(tenant_id, sector_id, name, email, role);
      res.json({ id: result.lastInsertRowid, tenant_id, sector_id, name, email, role });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/admin/users", (req, res) => {
    const { tenant_id, admin_id } = req.query;
    if (!isAdmin(admin_id)) return res.status(403).json({ error: "Unauthorized" });

    const users = db.prepare(`
      SELECT u.*, s.name as sector_name 
      FROM users u 
      JOIN sectors s ON u.sector_id = s.id 
      WHERE u.tenant_id = ?
    `).all(tenant_id);
    res.json(users);
  });

  app.delete("/api/admin/sectors/:id", (req, res) => {
    const { id } = req.params;
    const { admin_id } = req.query;
    if (!isAdmin(admin_id)) return res.status(403).json({ error: "Unauthorized" });

    try {
      // Check if sector has users
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE sector_id = ?").get(id) as any;
      if (userCount.count > 0) {
        return res.status(400).json({ error: "Não é possível excluir um setor que possui usuários vinculados." });
      }

      db.prepare("DELETE FROM sectors WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: "Erro ao excluir setor. Verifique se existem tickets vinculados." });
    }
  });

  app.delete("/api/admin/users/:id", (req, res) => {
    const { id } = req.params;
    const { admin_id } = req.query;
    if (!isAdmin(admin_id)) return res.status(403).json({ error: "Unauthorized" });

    if (id === admin_id) {
      return res.status(400).json({ error: "Você não pode excluir a si mesmo." });
    }

    try {
      const targetUser = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;
      if (targetUser && targetUser.role === 'admin') {
        return res.status(400).json({ error: "Não é permitido excluir outros administradores por este painel." });
      }

      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: "Erro ao excluir usuário. Verifique se existem tickets ou comentários vinculados." });
    }
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
