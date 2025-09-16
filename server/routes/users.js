const express = require("express");
const bcrypt = require("bcryptjs");
const { auth } = require("../middleware/auth");
const { getPool, sql } = require("../db");
const router = express.Router();

// GET /api/users - admin only
router.get("/", auth("admin"), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC"
      );
    res.json(result.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// POST /api/users - admin create user
router.post("/", auth("admin"), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Datos incompletos" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const pool = await getPool();
    const result = await pool
      .request()
      .input("name", sql.VarChar(255), name)
      .input("email", sql.VarChar(255), email)
      .input("hash", sql.VarChar(255), hash)
      .input("role", sql.VarChar(50), role || "user")
      .query(
        "INSERT INTO users (name, email, password_hash, role) OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.role VALUES (@name, @email, @hash, @role)"
      );
    res.status(201).json(result.recordset[0]);
  } catch (e) {
    if (e?.originalError?.info?.number === 2627) {
      return res.status(409).json({ error: "Email ya existe" });
    }
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// PATCH /api/users/:id - admin update user
router.patch("/:id", auth("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role } = req.body;
  try {
    const pool = await getPool();
    let setClauses = [];
    if (name) setClauses.push("name = @name");
    if (email) setClauses.push("email = @email");
    if (role) setClauses.push("role = @role");
    if (password) setClauses.push("password_hash = @hash");
    if (setClauses.length === 0) return res.json({ ok: true });
    const reqDb = pool.request().input("id", sql.Int, parseInt(id, 10));
    if (name) reqDb.input("name", sql.VarChar(255), name);
    if (email) reqDb.input("email", sql.VarChar(255), email);
    if (role) reqDb.input("role", sql.VarChar(50), role);
    if (password)
      reqDb.input("hash", sql.VarChar(255), await bcrypt.hash(password, 10));
    const result = await reqDb.query(
      `UPDATE users SET ${setClauses.join(
        ", "
      )} WHERE id = @id; SELECT id, name, email, role FROM users WHERE id=@id`
    );
    res.json(result.recordset[0] || { ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// DELETE /api/users/:id - admin delete user
router.delete("/:id", auth("admin"), async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, parseInt(req.params.id, 10))
      .query("DELETE FROM users WHERE id=@id");
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

module.exports = router;

// --- Pagos ---
// Helpers
async function ensurePaymentsTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.user_payments', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.user_payments (
        user_id INT NOT NULL,
        [year] INT NOT NULL,
        [month] INT NOT NULL,
        paid BIT NOT NULL DEFAULT 0,
        paid_at DATETIME2 NULL,
        CONSTRAINT PK_user_payments PRIMARY KEY (user_id, [year], [month]),
        CONSTRAINT FK_user_payments_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
      );
    END
  `);
}

async function ensureDeadlinesTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.payment_deadlines', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.payment_deadlines (
        [year] INT NOT NULL,
        [month] INT NOT NULL,
        deadline DATE NOT NULL,
        CONSTRAINT PK_payment_deadlines PRIMARY KEY ([year], [month])
      );
    END
  `);
}

// GET /api/users/payments?year=YYYY&month=MM (admin)
router.get("/payments", auth("admin"), async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month)
    return res.status(400).json({ error: "year y month requeridos" });
  try {
    const pool = await getPool();
    await ensurePaymentsTable(pool);
    const result = await pool
      .request()
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(
        "SELECT user_id, [year], [month], paid, paid_at FROM user_payments WHERE [year]=@year AND [month]=@month"
      );
    res.json(result.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// POST /api/users/:id/pay { year, month, paid }
router.post("/:id/pay", auth("admin"), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { year, month, paid } = req.body || {};
  if (!userId || !year || !month || typeof paid !== "boolean")
    return res.status(400).json({ error: "Parámetros inválidos" });
  try {
    const pool = await getPool();
    await ensurePaymentsTable(pool);
    const now = new Date();
    // UPSERT
    const up = await pool
      .request()
      .input("uid", sql.Int, userId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .input("paid", sql.Bit, paid ? 1 : 0)
      .input("paid_at", sql.DateTime2, paid ? now : null).query(`
        MERGE user_payments AS target
        USING (SELECT @uid AS user_id, @year AS [year], @month AS [month]) AS src
        ON (target.user_id = src.user_id AND target.[year] = src.[year] AND target.[month] = src.[month])
        WHEN MATCHED THEN
          UPDATE SET paid = @paid, paid_at = @paid_at
        WHEN NOT MATCHED THEN
          INSERT (user_id, [year], [month], paid, paid_at) VALUES (@uid, @year, @month, @paid, @paid_at);
      `);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// GET /api/users/payments/deadline?year=YYYY&month=MM (admin)
router.get("/payments/deadline", auth("admin"), async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month)
    return res.status(400).json({ error: "year y month requeridos" });
  try {
    const pool = await getPool();
    await ensureDeadlinesTable(pool);
    const result = await pool
      .request()
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(
        "SELECT [year], [month], deadline FROM payment_deadlines WHERE [year]=@year AND [month]=@month"
      );
    res.json(result.recordset[0] || null);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// POST /api/users/payments/deadline { year, month, deadline } (admin)
router.post("/payments/deadline", auth("admin"), async (req, res) => {
  const { year, month, deadline } = req.body || {};
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!y || !m || !deadline)
    return res.status(400).json({ error: "Parámetros inválidos" });
  try {
    const pool = await getPool();
    await ensureDeadlinesTable(pool);
    const d = new Date(deadline);
    if (isNaN(d)) return res.status(400).json({ error: "Fecha inválida" });
    await pool
      .request()
      .input("year", sql.Int, y)
      .input("month", sql.Int, m)
      .input("deadline", sql.Date, d).query(`
        MERGE payment_deadlines AS target
        USING (SELECT @year AS [year], @month AS [month]) AS src
        ON (target.[year] = src.[year] AND target.[month] = src.[month])
        WHEN MATCHED THEN
          UPDATE SET deadline = @deadline
        WHEN NOT MATCHED THEN
          INSERT ([year], [month], deadline) VALUES (@year, @month, @deadline);
      `);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});
