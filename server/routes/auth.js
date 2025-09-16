const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db");
const router = express.Router();

// POST /api/auth/bootstrap-admin
// Crea un usuario admin inicial si no existe ninguno. Proteger con token temporal via env.
router.post("/bootstrap-admin", async (req, res) => {
  try {
    const { token } = req.body || {};
    const expected = process.env.BOOTSTRAP_TOKEN || "";
    if (!expected || token !== expected) {
      return res.status(403).json({ error: "No autorizado" });
    }
    const pool = await getPool();
    const count = await pool
      .request()
      .query("SELECT COUNT(1) as c FROM users WHERE role='admin'");
    if (count.recordset[0].c > 0)
      return res.json({ ok: true, detalle: "Ya hay admin" });
    const name = process.env.BOOTSTRAP_ADMIN_NAME || "Admin";
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com";
    const pass = process.env.BOOTSTRAP_ADMIN_PASSWORD || "admin123";
    const hash = await bcrypt.hash(pass, 10);
    const created = await pool
      .request()
      .input("name", sql.VarChar(255), name)
      .input("email", sql.VarChar(255), email)
      .input("hash", sql.VarChar(255), hash)
      .input("role", sql.VarChar(50), "admin")
      .query(
        "INSERT INTO users (name, email, password_hash, role) OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.role VALUES (@name, @email, @hash, @role)"
      );
    res.status(201).json({ ok: true, admin: created.recordset[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Faltan credenciales" });
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("email", sql.VarChar(255), email)
      .query(
        "SELECT TOP 1 id, name, email, password_hash, role FROM users WHERE email = @email"
      );
    const user = result.recordset[0];
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET || "changeme",
      { expiresIn: "12h" }
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
