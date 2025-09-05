const express = require("express");
const { auth } = require("../middleware/auth");
const { getPool, sql } = require("../db");
const router = express.Router();

// GET /api/bookings (user sees own; admin sees all)
router.get("/", auth(), async (req, res) => {
  try {
    const pool = await getPool();
    const isAdmin = req.user.role === "admin";
    const request = pool.request();
    let query = `
      SELECT b.id, b.user_id, b.slot_id, b.status, b.created_at,
             s.start_time, s.end_time
      FROM bookings b
      JOIN slots s ON s.id = b.slot_id
    `;
    if (!isAdmin) {
      request.input("uid", sql.Int, req.user.id);
      query +=
        " WHERE b.user_id = @uid AND b.status <> 'canceled' AND s.start_time >= GETDATE()";
    }
    query += " ORDER BY s.start_time DESC";
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// POST /api/bookings -> create booking for a slot, if capacity remains
router.post("/", auth(), async (req, res) => {
  const { slot_id } = req.body;
  if (!slot_id) return res.status(400).json({ error: "slot_id requerido" });
  try {
    const pool = await getPool();
    const t = new sql.Transaction(await pool);
    await t.begin();
    try {
      const request = new sql.Request(t);
      request.input("slot", sql.Int, slot_id);
      const slotRes = await request.query(`
        SELECT s.id, s.capacity, s.start_time,
               (SELECT COUNT(1) FROM bookings b WHERE b.slot_id = s.id AND b.status='confirmed') AS used
        FROM slots s WHERE s.id = @slot
      `);
      const slot = slotRes.recordset[0];
      if (!slot) {
        await t.rollback();
        return res.status(404).json({ error: "Slot no encontrado" });
      }
      if (slot.used >= slot.capacity) {
        await t.rollback();
        return res.status(409).json({ error: "Sin cupo" });
      }
      const insRes = await request
        .input("uid", sql.Int, req.user.id)
        .query(
          "INSERT INTO bookings (user_id, slot_id, status) OUTPUT INSERTED.* VALUES (@uid, @slot, 'confirmed')"
        );
      await t.commit();
      res.status(201).json(insRes.recordset[0]);
    } catch (e) {
      await t.rollback();
      throw e;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// DELETE /api/bookings/:id -> cancel own booking (or admin any)
router.delete("/:id", auth(), async (req, res) => {
  try {
    const pool = await getPool();
    const isAdmin = req.user.role === "admin";
    const request = pool
      .request()
      .input("id", sql.Int, parseInt(req.params.id, 10));
    let query = "UPDATE bookings SET status='canceled' WHERE id=@id";
    if (!isAdmin) {
      request.input("uid", sql.Int, req.user.id);
      query += " AND user_id=@uid";
    }
    await request.query(query);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

module.exports = router;
