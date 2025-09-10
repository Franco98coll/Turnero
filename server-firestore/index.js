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
    res
      .status(500)
      .json({
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
      const fromD = new Date(`${from}T00:00:00.000Z`);
      const toD = new Date(`${to}T23:59:59.999Z`);
      q = q.where("start_time", ">=", fromD).where("start_time", "<=", toD);
    } else if (date) {
      const d0 = new Date(`${date}T00:00:00.000Z`);
      const d1 = new Date(`${date}T23:59:59.999Z`);
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
        return { ...s, remaining: (s.capacity || 0) - used };
      })
    );
    res.json(slots);
  } catch (e) {
    console.error("/slots error:", e);
    res
      .status(500)
      .json({
        error: DEBUG_ERRORS ? e.stack || e.message : "Error en el servidor",
      });
  }
});
app.post("/api/slots", auth("admin"), async (req, res) => {
  const { start_time, end_time, capacity } = req.body || {};
  if (!start_time || !end_time || !capacity)
    return res.status(400).json({ error: "Datos incompletos" });
  const doc = await db.collection(SLOTS).add({
    start_time: new Date(start_time),
    end_time: new Date(end_time),
    capacity,
  });
  res.status(201).json({ id: doc.id, start_time, end_time, capacity });
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
      return {
        ...b,
        start_time: s.data().start_time,
        end_time: s.data().end_time,
      };
    })
  );
  const now = new Date();
  res.json(
    isAdmin ? bookings : bookings.filter((b) => b.start_time.toDate() >= now)
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
