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
