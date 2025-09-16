const express = require("express");
const { auth } = require("../middleware/auth");
const { getPool, sql } = require("../db");
const router = express.Router();

// GET /api/slots?date=YYYY-MM-DD | ?from=YYYY-MM-DD&to=YYYY-MM-DD -> list available slots with remaining capacity
router.get("/", async (req, res) => {
  const { date, from, to } = req.query;
  try {
    const pool = await getPool();
    const reqDb = pool.request();
    let where = "";
    if (from && to) {
      const fromD = new Date(`${from}T00:00:00.000`);
      const toExclusive = new Date(
        new Date(`${to}T00:00:00.000`).getTime() + 24 * 60 * 60 * 1000
      );
      reqDb.input("from", sql.DateTime2, fromD);
      reqDb.input("to", sql.DateTime2, toExclusive);
      where = "WHERE s.start_time >= @from AND s.start_time < @to";
    } else if (date) {
      reqDb.input("date", sql.Date, new Date(date));
      where = "WHERE CAST(s.start_time AS DATE) = @date";
    }
    const result = await reqDb.query(`
      SELECT s.id, s.start_time, s.end_time, s.capacity,
             s.capacity - ISNULL(b.count, 0) AS remaining
      FROM slots s
      OUTER APPLY (
        SELECT COUNT(1) AS count FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed'
      ) b
      ${where}
      ORDER BY s.start_time ASC
    `);
    res.json(result.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// Admin create slot
router.post("/", auth("admin"), async (req, res) => {
  const { start_time, end_time, capacity } = req.body;
  if (!start_time || !end_time || !capacity)
    return res.status(400).json({ error: "Datos incompletos" });
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("start", sql.DateTime2, new Date(start_time))
      .input("end", sql.DateTime2, new Date(end_time))
      .input("cap", sql.Int, capacity)
      .query(
        "INSERT INTO slots (start_time, end_time, capacity) OUTPUT INSERTED.* VALUES (@start, @end, @cap)"
      );
    res.status(201).json(result.recordset[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// Admin delete slot
router.delete("/:id", auth("admin"), async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, parseInt(req.params.id, 10))
      .query("DELETE FROM slots WHERE id=@id");
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// Admin delete ALL slots (and related bookings)
router.delete("/", auth("admin"), async (req, res) => {
  try {
    const pool = await getPool();
    const t = new sql.Transaction(await pool);
    await t.begin();
    try {
      const request = new sql.Request(t);
      await request.query("DELETE FROM bookings");
      await request.query("DELETE FROM slots");
      await t.commit();
      res.json({ ok: true });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

// GET /api/slots/:id/attendees (admin)
router.get("/:id/attendees", auth("admin"), async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(req.params.id, 10)).query(`
        SELECT b.id as booking_id, u.id as user_id, u.name, u.email
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        WHERE b.slot_id = @id AND b.status <> 'canceled'
        ORDER BY u.name ASC
      `);
    res.json(result.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});
// POST /api/slots/bulk (admin)
// Payload esperado:
// {
//   start_date: 'YYYY-MM-DD',
//   end_date: 'YYYY-MM-DD',
//   weekdays: [1,2,3,4,5],         // 0=Domingo..6=Sábado
//   time_start: 'HH:mm',
//   time_end: 'HH:mm',
//   slot_minutes: 30,
//   capacity: 3
// }
router.post("/bulk", auth("admin"), async (req, res) => {
  const {
    start_date,
    end_date,
    weekdays,
    time_start,
    time_end,
    slot_minutes,
    capacity,
  } = req.body || {};
  if (
    !start_date ||
    !end_date ||
    !Array.isArray(weekdays) ||
    weekdays.length === 0 ||
    !time_start ||
    !time_end ||
    !slot_minutes ||
    !capacity
  ) {
    return res.status(400).json({ error: "Datos incompletos" });
  }
  try {
    const sd = new Date(`${start_date}T00:00`);
    const ed = new Date(`${end_date}T00:00`);
    if (isNaN(sd) || isNaN(ed) || sd > ed)
      return res.status(400).json({ error: "Rango de fechas inválido" });
    const [tsH, tsM] = String(time_start)
      .split(":")
      .map((x) => parseInt(x, 10));
    const [teH, teM] = String(time_end)
      .split(":")
      .map((x) => parseInt(x, 10));
    if ([tsH, tsM, teH, teM].some((n) => isNaN(n)))
      return res.status(400).json({ error: "Horario inválido" });
    const startMinutes = tsH * 60 + tsM;
    const endMinutes = teH * 60 + teM;
    if (endMinutes <= startMinutes)
      return res
        .status(400)
        .json({ error: "time_end debe ser mayor que time_start" });
    const step = parseInt(slot_minutes, 10);
    if (!step || step <= 0 || step > 24 * 60)
      return res.status(400).json({ error: "slot_minutes inválido" });
    const cap = parseInt(capacity, 10);
    if (!cap || cap <= 0)
      return res.status(400).json({ error: "capacity inválida" });
    const weekdaySet = new Set(weekdays.map((w) => parseInt(w, 10)));
    for (const w of weekdaySet) {
      if (isNaN(w) || w < 0 || w > 6)
        return res.status(400).json({ error: "weekdays inválidos" });
    }

    // Generar instancias
    const slots = [];
    for (
      let d = new Date(sd);
      d <= ed;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    ) {
      const dow = d.getDay();
      if (!weekdaySet.has(dow)) continue;
      for (let m = startMinutes; m < endMinutes; m += step) {
        const s = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          Math.floor(m / 60),
          m % 60,
          0,
          0
        );
        const eMin = Math.min(m + step, endMinutes);
        const e = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          Math.floor(eMin / 60),
          eMin % 60,
          0,
          0
        );
        if (e <= s) continue;
        slots.push({ start: s, end: e, cap });
      }
    }
    if (slots.length === 0)
      return res
        .status(400)
        .json({ error: "No se generaron turnos para los criterios dados" });
    if (slots.length > 1000)
      return res
        .status(400)
        .json({ error: "Demasiados turnos generados (máx 1000)" });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const ps = new sql.PreparedStatement(tx);
      ps.input("start", sql.DateTime2);
      ps.input("end", sql.DateTime2);
      ps.input("cap", sql.Int);
      await ps.prepare(
        "INSERT INTO slots (start_time, end_time, capacity) VALUES (@start, @end, @cap)"
      );
      for (const it of slots) {
        await ps.execute({ start: it.start, end: it.end, cap: it.cap });
      }
      await ps.unprepare();
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    res.status(201).json({ ok: true, created: slots.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error de servidor" });
  }
});

module.exports = router;
