require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const admin = require("firebase-admin");

// Inicializar Firebase Admin
// Necesita GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_APPLICATION_CREDENTIALS_JSON en Render
let FIREBASE_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
if (!admin.apps.length) {
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      if (creds.private_key && typeof creds.private_key === "string") {
        creds.private_key = creds.private_key.replace(/\\n/g, "\n");
      }
      FIREBASE_PROJECT = creds.project_id || FIREBASE_PROJECT;
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: FIREBASE_PROJECT || undefined,
      });
    } else {
      admin.initializeApp();
    }
  } catch (e) {
    console.error("Error inicializando Firebase Admin:", e.stack || e.message);
    process.exit(1);
  }
}

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const DEBUG_ERRORS =
  process.env.DEBUG_ERRORS === "1" || process.env.DEBUG_ERRORS === "true";
const USERS = "users";
const SLOTS = "slots";
const BOOKINGS = "bookings";

function auth(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido" });
    }
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    project: FIREBASE_PROJECT || "unknown",
  });
});

// Diagnóstico de Firestore: prueba de escritura/lectura
app.get("/api/diag", async (req, res) => {
  try {
    const pingRef = db.collection("diag").doc("ping");
    await pingRef.set(
      { t: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    const got = await pingRef.get();
    res.json({
      ok: true,
      project: FIREBASE_PROJECT || "unknown",
      exists: got.exists,
    });
  } catch (e) {
    const err = DEBUG_ERRORS ? e.stack || e.message : "Error en el servidor";
    res.status(500).json({ error: err });
  }
});

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Datos incompletos" });
  try {
    const snap = await db
      .collection(USERS)
      .where("email", "==", email)
      .limit(1)
      .get();
    const doc = snap.docs[0];
    if (!doc) return res.status(401).json({ error: "Credenciales inválidas" });
    const u = { id: doc.id, ...doc.data() };
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });
    const token = jwt.sign(
      { id: u.id, role: u.role, email: u.email, name: u.name },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({
      token,
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    });
  } catch (e) {
    console.error("/auth/login error:", e);
    res.status(500).json({
      error: DEBUG_ERRORS ? e.stack || e.message : "Error en el servidor",
    });
  }
});

// Users
app.get("/api/users", auth("admin"), async (req, res) => {
  const snap = await db.collection(USERS).orderBy("created_at", "desc").get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});
app.post("/api/users", auth("admin"), async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: "Datos incompletos" });
  const exists = await db
    .collection(USERS)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!exists.empty) return res.status(409).json({ error: "Email ya existe" });
  const hash = await bcrypt.hash(password, 10);
  const doc = await db.collection(USERS).add({
    name,
    email,
    password_hash: hash,
    role: role || "user",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  res.status(201).json({ id: doc.id, name, email, role: role || "user" });
});
app.patch("/api/users/:id", auth("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role } = req.body || {};
  const updates = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (role) updates.role = role;
  if (password) updates.password_hash = await bcrypt.hash(password, 10);
  if (Object.keys(updates).length === 0) return res.json({ ok: true });
  await db.collection(USERS).doc(id).update(updates);
  const got = await db.collection(USERS).doc(id).get();
  res.json({ id: got.id, ...got.data() });
});
app.delete("/api/users/:id", auth("admin"), async (req, res) => {
  const { id } = req.params;
  await db.collection(USERS).doc(id).delete();
  res.json({ ok: true });
});

// Slots
app.get("/api/slots", async (req, res) => {
  try {
    const { date, from, to } = req.query;
    let q = db.collection(SLOTS);
    if (from && to) {
      // Parseo local: YYYY-MM-DD a límites del día en hora local
      const [fy, fm, fd] = String(from)
        .split("-")
        .map((n) => parseInt(n, 10));
      const [ty, tm, td] = String(to)
        .split("-")
        .map((n) => parseInt(n, 10));
      const fromD = new Date(fy, (fm || 1) - 1, fd || 1, 0, 0, 0, 0);
      const toD = new Date(ty, (tm || 1) - 1, td || 1, 23, 59, 59, 999);
      q = q.where("start_time", ">=", fromD).where("start_time", "<=", toD);
    } else if (date) {
      const [y, m, d] = String(date)
        .split("-")
        .map((n) => parseInt(n, 10));
      const d0 = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
      const d1 = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
      q = q.where("start_time", ">=", d0).where("start_time", "<=", d1);
    }
    const snap = await q.orderBy("start_time", "asc").get();
    const slots = await Promise.all(
      snap.docs.map(async (d) => {
        const s = { id: d.id, ...d.data() };
        const b = await db
          .collection(BOOKINGS)
          .where("slot_id", "==", d.id)
          .where("status", "==", "confirmed")
          .get();
        const used = b.size;
        const st = s.start_time?.toDate
          ? s.start_time.toDate()
          : new Date(s.start_time);
        const et = s.end_time?.toDate
          ? s.end_time.toDate()
          : new Date(s.end_time);
        return {
          id: s.id,
          capacity: s.capacity,
          start_time: st.toISOString(),
          end_time: et.toISOString(),
          remaining: (s.capacity || 0) - used,
        };
      })
    );
    res.json(slots);
  } catch (e) {
    console.error("/slots error:", e);
    res.status(500).json({
      error: DEBUG_ERRORS ? e.stack || e.message : "Error en el servidor",
    });
  }
});
app.post("/api/slots", auth("admin"), async (req, res) => {
  const { start_time, end_time, capacity } = req.body || {};
  if (!start_time || !end_time || !capacity)
    return res.status(400).json({ error: "Datos incompletos" });
  // Convertir strings "YYYY-MM-DDTHH:MM" a Date local de forma segura
  function parseLocalDateTime(s) {
    if (s instanceof Date) return s;
    const [datePart, timePart] = String(s).split("T");
    const [yy, mm, dd] = datePart.split("-").map((n) => parseInt(n, 10));
    const [hh = 0, mi = 0] = (timePart || "")
      .split(":")
      .map((n) => parseInt(n, 10));
    return new Date(yy, (mm || 1) - 1, dd || 1, hh, mi, 0, 0);
  }
  const st = parseLocalDateTime(start_time);
  const et = parseLocalDateTime(end_time);
  const doc = await db.collection(SLOTS).add({
    start_time: st,
    end_time: et,
    capacity,
  });
  res.status(201).json({ id: doc.id, start_time, end_time, capacity });
});

// Crear turnos en bloque (agenda semanal)
app.post("/api/slots/bulk", auth("admin"), async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      weekdays = [], // números 0-6 (domingo-sábado)
      time_start, // "HH:MM"
      time_end, // "HH:MM"
      slot_minutes = 30,
      capacity = 1,
    } = req.body || {};

    // Validaciones básicas
    if (!start_date || !end_date || !time_start || !time_end)
      return res.status(400).json({ error: "Datos incompletos" });
    if (!Array.isArray(weekdays) || weekdays.length === 0)
      return res.status(400).json({ error: "Seleccione días de semana" });
    if (slot_minutes <= 0 || capacity <= 0)
      return res.status(400).json({ error: "Valores inválidos" });

    // Helpers de fecha en hora local
    function parseDateOnly(s) {
      const [y, m, d] = String(s)
        .split("-")
        .map((n) => parseInt(n, 10));
      return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    }
    function parseTimeOnly(s) {
      const [hh = 0, mm = 0] = String(s)
        .split(":")
        .map((n) => parseInt(n, 10));
      return { hh, mm };
    }

    const dStart = parseDateOnly(start_date);
    const dEnd = parseDateOnly(end_date);
    const { hh: sh, mm: sm } = parseTimeOnly(time_start);
    const { hh: eh, mm: em } = parseTimeOnly(time_end);
    if (dEnd < dStart)
      return res.status(400).json({ error: "Rango de fechas inválido" });

    const toWrite = [];
    // Recorre días y genera slots
    for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (!weekdays.includes(dow)) continue;
      const dayStart = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        sh,
        sm,
        0,
        0
      );
      const dayEnd = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        eh,
        em,
        0,
        0
      );
      // Evitar bucle si el fin es antes del inicio
      if (dayEnd <= dayStart) continue;
      let cur = new Date(dayStart);
      while (cur < dayEnd) {
        const end = new Date(cur.getTime() + slot_minutes * 60000);
        if (end > dayEnd) break;
        toWrite.push({ start_time: new Date(cur), end_time: end, capacity });
        cur = end; // siguiente bloque
      }
    }

    if (toWrite.length === 0)
      return res.json({ created: 0, warning: "No se generaron turnos" });

    // Escritura en lotes (máx ~500 por batch)
    const chunk = (arr, size) =>
      arr.reduce((acc, _, i) => {
        if (i % size === 0) acc.push(arr.slice(i, i + size));
        return acc;
      }, []);
    const batches = chunk(toWrite, 450);
    let created = 0;
    for (const part of batches) {
      const batch = db.batch();
      for (const s of part) {
        const ref = db.collection(SLOTS).doc();
        batch.set(ref, s);
      }
      await batch.commit();
      created += part.length;
    }

    res.json({ created });
  } catch (e) {
    console.error("/slots/bulk error:", e);
    res.status(500).json({
      error: DEBUG_ERRORS ? e.stack || e.message : "Error en el servidor",
    });
  }
});
app.delete("/api/slots/:id", auth("admin"), async (req, res) => {
  const { id } = req.params;
  const b = await db.collection(BOOKINGS).where("slot_id", "==", id).get();
  const batch = db.batch();
  b.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection(SLOTS).doc(id));
  await batch.commit();
  res.json({ ok: true });
});
app.delete("/api/slots", auth("admin"), async (req, res) => {
  const slotsSnap = await db.collection(SLOTS).get();
  const batch = db.batch();
  for (const s of slotsSnap.docs) {
    const b = await db.collection(BOOKINGS).where("slot_id", "==", s.id).get();
    b.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(s.ref);
  }
  await batch.commit();
  res.json({ ok: true });
});

// Listar inscriptos (bookings confirmados) de un turno con datos de usuario
app.get("/api/slots/:id/attendees", auth("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const s = await db.collection(SLOTS).doc(id).get();
    if (!s.exists) return res.status(404).json({ error: "Slot no encontrado" });
    const bs = await db
      .collection(BOOKINGS)
      .where("slot_id", "==", id)
      .where("status", "==", "confirmed")
      .get();
    const attendees = [];
    for (const bd of bs.docs) {
      const b = { id: bd.id, ...bd.data() };
      const u = await db.collection(USERS).doc(b.user_id).get();
      attendees.push({
        booking_id: b.id,
        user_id: b.user_id,
        email: u.exists ? u.data().email : undefined,
        name: u.exists ? u.data().name : undefined,
        created_at: b.created_at?.toDate
          ? b.created_at.toDate().toISOString()
          : undefined,
        status: b.status,
      });
    }
    // Devolver también info del turno con fechas normalizadas
    const sd = s.data();
    const st = sd.start_time?.toDate
      ? sd.start_time.toDate()
      : new Date(sd.start_time);
    const et = sd.end_time?.toDate
      ? sd.end_time.toDate()
      : new Date(sd.end_time);
    res.json({
      slot: {
        id: s.id,
        capacity: sd.capacity,
        start_time: st.toISOString(),
        end_time: et.toISOString(),
      },
      attendees,
    });
  } catch (e) {
    console.error("/slots/:id/attendees error:", e);
    res.status(500).json({
      error: DEBUG_ERRORS ? e.stack || e.message : "Error en el servidor",
    });
  }
});

// Bookings
app.get("/api/bookings", auth(), async (req, res) => {
  const isAdmin = req.user.role === "admin";
  let q = db.collection(BOOKINGS);
  if (!isAdmin)
    q = q.where("user_id", "==", req.user.id).where("status", "!=", "canceled");
  const snap = await q.get();
  const bookings = await Promise.all(
    snap.docs.map(async (d) => {
      const b = { id: d.id, ...d.data() };
      const s = await db.collection(SLOTS).doc(b.slot_id).get();
      const sd = s.data();
      const st = sd.start_time?.toDate
        ? sd.start_time.toDate()
        : new Date(sd.start_time);
      const et = sd.end_time?.toDate
        ? sd.end_time.toDate()
        : new Date(sd.end_time);
      return {
        ...b,
        start_time: st.toISOString(),
        end_time: et.toISOString(),
      };
    })
  );
  const now = new Date();
  res.json(
    isAdmin ? bookings : bookings.filter((b) => new Date(b.start_time) >= now)
  );
});
app.post("/api/bookings", auth(), async (req, res) => {
  const { slot_id } = req.body || {};
  if (!slot_id) return res.status(400).json({ error: "slot_id requerido" });
  const s = await db.collection(SLOTS).doc(slot_id).get();
  if (!s.exists) return res.status(404).json({ error: "Slot no encontrado" });
  const cap = s.data().capacity || 0;
  const used = (
    await db
      .collection(BOOKINGS)
      .where("slot_id", "==", slot_id)
      .where("status", "==", "confirmed")
      .get()
  ).size;
  if (used >= cap) return res.status(409).json({ error: "Sin cupo" });
  const doc = await db.collection(BOOKINGS).add({
    user_id: req.user.id,
    slot_id,
    status: "confirmed",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  res.status(201).json({ id: doc.id, slot_id, status: "confirmed" });
});
app.delete("/api/bookings/:id", auth(), async (req, res) => {
  const { id } = req.params;
  const b = await db.collection(BOOKINGS).doc(id).get();
  if (!b.exists) return res.json({ ok: true });
  const isAdmin = req.user.role === "admin";
  const can = isAdmin || b.data().user_id === req.user.id;
  if (!can) return res.status(403).json({ error: "Forbidden" });
  await db.collection(BOOKINGS).doc(id).update({ status: "canceled" });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Firestore escuchando en :${PORT}`));
