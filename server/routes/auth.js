const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db");
const router = express.Router();

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
