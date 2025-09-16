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

// POST /api/bookings -> create booking for a slot, if capacity remains and mes pagado
router.post("/", auth(), async (req, res) => {
  const { slot_id } = req.body;
  if (!slot_id) return res.status(400).json({ error: "slot_id requerido" });
  try {
    // Asegurar tabla de pagos
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

    const pool = await getPool();
    await ensurePaymentsTable(pool);
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
      // Validar pago del mes del turno para usuarios no admin
      if (req.user.role !== "admin") {
        const fechaTurno = new Date(slot.start_time);
        const y = fechaTurno.getFullYear();
        const m = fechaTurno.getMonth() + 1; // 1..12
        const pagoQ = await request
          .input("uid", sql.Int, req.user.id)
          .input("year", sql.Int, y)
          .input("month", sql.Int, m)
          .query(
            "SELECT paid FROM user_payments WHERE user_id=@uid AND [year]=@year AND [month]=@month"
          );
        const reg = pagoQ.recordset[0];
        if (!reg || (reg.paid !== true && reg.paid !== 1)) {
          await t.rollback();
          return res
            .status(403)
            .json({ error: "Debes tener al día el pago del mes del turno" });
        }
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
