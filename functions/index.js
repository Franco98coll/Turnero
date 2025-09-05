const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Helpers
const JWT_SECRET = process.env.JWT_SECRET || "secret";
function auth(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      if (requiredRole && decoded.role !== requiredRole)
        return res.status(403).json({ error: "Forbidden" });
      next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido" });
    }
  };
}

// Collections
const USERS = "users";
const SLOTS = "slots";
const BOOKINGS = "bookings";

// Auth
app.post("/auth/login", async (req, res) => {
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
    res.status(500).json({ error: "Error de servidor" });
  }
});

// Users
app.get("/users", auth("admin"), async (req, res) => {
  const snap = await db.collection(USERS).orderBy("created_at", "desc").get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});
app.post("/users", auth("admin"), async (req, res) => {
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
  const doc = await db
    .collection(USERS)
    .add({
      name,
      email,
      password_hash: hash,
      role: role || "user",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  res.status(201).json({ id: doc.id, name, email, role: role || "user" });
});
app.patch("/users/:id", auth("admin"), async (req, res) => {
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
app.delete("/users/:id", auth("admin"), async (req, res) => {
  const { id } = req.params;
  await db.collection(USERS).doc(id).delete();
  res.json({ ok: true });
});

// Slots
app.get("/slots", async (req, res) => {
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
  // compute remaining
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
});
app.post("/slots", auth("admin"), async (req, res) => {
  const { start_time, end_time, capacity } = req.body || {};
  if (!start_time || !end_time || !capacity)
    return res.status(400).json({ error: "Datos incompletos" });
  const doc = await db
    .collection(SLOTS)
    .add({
      start_time: new Date(start_time),
      end_time: new Date(end_time),
      capacity,
    });
  res.status(201).json({ id: doc.id, start_time, end_time, capacity });
});
app.delete("/slots/:id", auth("admin"), async (req, res) => {
  const { id } = req.params;
  const b = await db.collection(BOOKINGS).where("slot_id", "==", id).get();
  const batch = db.batch();
  b.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection(SLOTS).doc(id));
  await batch.commit();
  res.json({ ok: true });
});
app.delete("/slots", auth("admin"), async (req, res) => {
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
app.get("/bookings", auth(), async (req, res) => {
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
  // filter future for users
  const now = new Date();
  res.json(
    isAdmin ? bookings : bookings.filter((b) => b.start_time.toDate() >= now)
  );
});
app.post("/bookings", auth(), async (req, res) => {
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
  const doc = await db
    .collection(BOOKINGS)
    .add({
      user_id: req.user.id,
      slot_id,
      status: "confirmed",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  res.status(201).json({ id: doc.id, slot_id, status: "confirmed" });
});
app.delete("/bookings/:id", auth(), async (req, res) => {
  const { id } = req.params;
  const b = await db.collection(BOOKINGS).doc(id).get();
  if (!b.exists) return res.json({ ok: true });
  const isAdmin = req.user.role === "admin";
  const can = isAdmin || b.data().user_id === req.user.id;
  if (!can) return res.status(403).json({ error: "Forbidden" });
  await db.collection(BOOKINGS).doc(id).update({ status: "canceled" });
  res.json({ ok: true });
});

exports.api = functions.https.onRequest(app);
