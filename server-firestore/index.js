// Carga de variables de entorno desde .env (solo en desarrollo/local)
require("dotenv").config();

// Dependencias principales del servidor
const express = require("express"); // Framework HTTP
const cors = require("cors"); // Middleware CORS
const jwt = require("jsonwebtoken"); // Manejo de JWT
const bcrypt = require("bcryptjs"); // Hash/compare de contraseñas
const administrador = require("firebase-admin"); // SDK Admin de Firebase

// ---------------------------------------------
// Inicialización de Firebase Admin (Firestore)
// ---------------------------------------------
// Se puede usar cualquiera de estas variables de entorno (compatibilidad):
// - CREDENCIALES_FIREBASE_JSON (nueva, español) o GOOGLE_APPLICATION_CREDENTIALS_JSON (existente)
// - RUTA_CREDENCIALES_FIREBASE (nueva) o GOOGLE_APPLICATION_CREDENTIALS (existente)
let PROYECTO_FIREBASE =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";

if (!administrador.apps.length) {
  try {
    // Preferencia 1: JSON de credenciales embebido en variable de entorno
    const JSON_CREDENCIALES =
      process.env.CREDENCIALES_FIREBASE_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

    if (JSON_CREDENCIALES) {
      const credenciales = JSON.parse(JSON_CREDENCIALES);
      // Normalización de saltos de línea para la clave privada
      if (
        credenciales.private_key &&
        typeof credenciales.private_key === "string"
      ) {
        credenciales.private_key = credenciales.private_key.replace(
          /\\n/g,
          "\n"
        );
      }
      PROYECTO_FIREBASE = credenciales.project_id || PROYECTO_FIREBASE;
      administrador.initializeApp({
        credential: administrador.credential.cert(credenciales),
        projectId: PROYECTO_FIREBASE || undefined,
      });
    } else {
      // Preferencia 2: Ruta a archivo con credenciales (ADC o GOOGLE_APPLICATION_CREDENTIALS)
      // Si no hay JSON, delega en credenciales por defecto del entorno
      administrador.initializeApp();
    }
  } catch (e) {
    console.error("Error inicializando Firebase Admin:", e.stack || e.message);
    process.exit(1);
  }
}

// Cliente de Firestore y aplicación Express
const baseDeDatos = administrador.firestore();
const aplicacion = express();
aplicacion.use(cors());
aplicacion.use(express.json());

// -------------------------------
// Configuración y constantes APP
// -------------------------------
// Compatibilidad: usa variables en español si existen; si no, las históricas.
const CLAVE_JWT = process.env.CLAVE_JWT || process.env.JWT_SECRET || "secret";
const DEPURAR_ERRORES =
  process.env.DEPURAR_ERRORES === "1" ||
  process.env.DEPURAR_ERRORES === "true" ||
  process.env.DEBUG_ERRORS === "1" ||
  process.env.DEBUG_ERRORS === "true";

// Nombres de colecciones (NO cambiar los literales, solo los identificadores locales)
const COLECCION_USUARIOS = "users";
const COLECCION_TURNOS = "slots";
const COLECCION_RESERVAS = "bookings";
const COLECCION_DEADLINES = "payment_deadlines"; // { id: YYYY-MM, deadline: Date }

// ---------------------------------
// Funciones de utilidad (helpers)
// ---------------------------------
/**
 * Rellena con cero a la izquierda hasta 2 dígitos
 */
function rellenar2(numero) {
  return String(numero).padStart(2, "0");
}

/**
 * Convierte una fecha a cadena local YYYY-MM-DDTHH:MM (según zona horaria del servidor)
 */
function aCadenaLocal(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return `${d.getFullYear()}-${rellenar2(d.getMonth() + 1)}-${rellenar2(
    d.getDate()
  )}T${rellenar2(d.getHours())}:${rellenar2(d.getMinutes())}`;
}

/**
 * Devuelve la clave de mes actual en formato YYYY-MM
 */
function claveMes(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return `${d.getFullYear()}-${rellenar2(d.getMonth() + 1)}`;
}

/**
 * Middleware de autenticación/autorización mediante JWT.
 * Si se indica `rolRequerido`, valida que el usuario posea dicho rol.
 */
function autenticar(rolRequerido) {
  return (req, res, next) => {
    const cabeceraAuth = req.headers.authorization || "";
    const token = cabeceraAuth.startsWith("Bearer ")
      ? cabeceraAuth.slice(7)
      : "";
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decodificado = jwt.verify(token, CLAVE_JWT);
      req.user = decodificado;
      if (rolRequerido && decodificado.role !== rolRequerido) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido" });
    }
  };
}

// Endpoint de salud para verificar disponibilidad del servicio
aplicacion.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    project: PROYECTO_FIREBASE || "unknown",
  });
});

// Diagnóstico de Firestore: prueba de escritura/lectura
// Endpoint de diagnóstico simple: prueba de escritura/lectura en Firestore
aplicacion.get("/api/diag", async (req, res) => {
  try {
    const referenciaPing = baseDeDatos.collection("diag").doc("ping");
    await referenciaPing.set(
      { t: administrador.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    const obtenido = await referenciaPing.get();
    res.json({
      ok: true,
      project: PROYECTO_FIREBASE || "unknown",
      exists: obtenido.exists,
    });
  } catch (e) {
    const err = DEPURAR_ERRORES ? e.stack || e.message : "Error en el servidor";
    res.status(500).json({ error: err });
  }
});

// Auth
// ---------------------------------
// Autenticación (login con email)
// ---------------------------------
aplicacion.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Datos incompletos" });
  try {
    const instantanea = await baseDeDatos
      .collection(COLECCION_USUARIOS)
      .where("email", "==", email)
      .limit(1)
      .get();
    const documento = instantanea.docs[0];
    if (!documento)
      return res.status(401).json({ error: "Credenciales inválidas" });
    const usuario = { id: documento.id, ...documento.data() };
    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide)
      return res.status(401).json({ error: "Credenciales inválidas" });
    const token = jwt.sign(
      {
        id: usuario.id,
        role: usuario.role,
        email: usuario.email,
        name: usuario.name,
      },
      CLAVE_JWT,
      { expiresIn: "8h" }
    );
    res.json({
      token,
      user: {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        role: usuario.role,
      },
    });
  } catch (e) {
    console.error("/auth/login error:", e);
    res.status(500).json({
      error: DEPURAR_ERRORES ? e.stack || e.message : "Error en el servidor",
    });
  }
});

// Users
// ----------------------
// Gestión de usuarios
// ----------------------
aplicacion.get("/api/users", autenticar("admin"), async (req, res) => {
  const instantanea = await baseDeDatos
    .collection(COLECCION_USUARIOS)
    .orderBy("created_at", "desc")
    .get();
  res.json(instantanea.docs.map((d) => ({ id: d.id, ...d.data() })));
});
aplicacion.post("/api/users", autenticar("admin"), async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: "Datos incompletos" });
  const existe = await baseDeDatos
    .collection(COLECCION_USUARIOS)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existe.empty) return res.status(409).json({ error: "Email ya existe" });
  const hash = await bcrypt.hash(password, 10);
  const documento = await baseDeDatos.collection(COLECCION_USUARIOS).add({
    name,
    email,
    password_hash: hash,
    role: role || "user",
    payment_due_date: req.body?.payment_due_date || null, // YYYY-MM-DD
    paid_months: Array.isArray(req.body?.paid_months)
      ? req.body.paid_months
      : [],
    created_at: administrador.firestore.FieldValue.serverTimestamp(),
  });
  res.status(201).json({ id: documento.id, name, email, role: role || "user" });
});
aplicacion.patch("/api/users/:id", autenticar("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role } = req.body || {};
  const updates = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (role) updates.role = role;
  if (typeof req.body?.payment_due_date !== "undefined")
    updates.payment_due_date = req.body.payment_due_date;
  if (Array.isArray(req.body?.paid_months))
    updates.paid_months = req.body.paid_months;
  if (password) updates.password_hash = await bcrypt.hash(password, 10);
  if (Object.keys(updates).length === 0) return res.json({ ok: true });
  await baseDeDatos.collection(COLECCION_USUARIOS).doc(id).update(updates);
  const obtenido = await baseDeDatos
    .collection(COLECCION_USUARIOS)
    .doc(id)
    .get();
  res.json({ id: obtenido.id, ...obtenido.data() });
});
aplicacion.delete("/api/users/:id", autenticar("admin"), async (req, res) => {
  const { id } = req.params;
  await baseDeDatos.collection(COLECCION_USUARIOS).doc(id).delete();
  res.json({ ok: true });
});

// Pagos: marcar mes como pago o impago
// Marcar un mes como pago/impago para un usuario
aplicacion.post("/api/users/:id/pay", autenticar("admin"), async (req, res) => {
  const { id } = req.params;
  const { year, month, paid } = req.body || {}; // month 1-12
  if (!year || !month || typeof paid === "undefined")
    return res.status(400).json({ error: "Datos incompletos" });
  const key = `${year}-${rellenar2(parseInt(month, 10))}`;
  const referencia = baseDeDatos.collection(COLECCION_USUARIOS).doc(id);
  const documento = await referencia.get();
  if (!documento.exists)
    return res.status(404).json({ error: "Usuario no encontrado" });
  const usuario = documento.data();
  const arr = Array.isArray(usuario.paid_months) ? usuario.paid_months : [];
  const set = new Set(arr);
  if (paid) set.add(key);
  else set.delete(key);
  await referencia.update({ paid_months: Array.from(set) });
  res.json({ ok: true, paid_months: Array.from(set) });
});

// Listado de pagos por mes (admin): devuelve [{ user_id, year, month, paid }]
aplicacion.get("/api/users/payments", autenticar("admin"), async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month)
      return res.status(400).json({ error: "year y month requeridos" });
    const clave = `${year}-${rellenar2(month)}`;
    const snap = await baseDeDatos.collection(COLECCION_USUARIOS).get();
    const items = snap.docs.map((d) => {
      const u = d.data();
      const arr = Array.isArray(u.paid_months) ? u.paid_months : [];
      return { user_id: d.id, year, month, paid: arr.includes(clave) };
    });
    res.json(items);
  } catch (e) {
    console.error("/users/payments error:", e);
    res
      .status(500)
      .json({
        error: DEPURAR_ERRORES ? e.stack || e.message : "Error en el servidor",
      });
  }
});

// Obtener fecha límite (admin): { year, month, deadline: 'YYYY-MM-DD' } | null
aplicacion.get(
  "/api/users/payments/deadline",
  autenticar("admin"),
  async (req, res) => {
    try {
      const year = parseInt(req.query.year, 10);
      const month = parseInt(req.query.month, 10);
      if (!year || !month)
        return res.status(400).json({ error: "year y month requeridos" });
      const id = `${year}-${rellenar2(month)}`;
      const doc = await baseDeDatos
        .collection(COLECCION_DEADLINES)
        .doc(id)
        .get();
      if (!doc.exists) return res.json(null);
      const data = doc.data();
      let d = data.deadline;
      if (d && d.toDate) d = d.toDate();
      const ymd =
        d instanceof Date
          ? `${d.getFullYear()}-${rellenar2(d.getMonth() + 1)}-${rellenar2(
              d.getDate()
            )}`
          : String(d);
      res.json({ year, month, deadline: ymd });
    } catch (e) {
      console.error("/users/payments/deadline GET error:", e);
      res
        .status(500)
        .json({
          error: DEPURAR_ERRORES
            ? e.stack || e.message
            : "Error en el servidor",
        });
    }
  }
);

// Guardar fecha límite (admin): body { year, month, deadline: 'YYYY-MM-DD' }
aplicacion.post(
  "/api/users/payments/deadline",
  autenticar("admin"),
  async (req, res) => {
    try {
      const { year, month, deadline } = req.body || {};
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      if (!y || !m || !deadline)
        return res.status(400).json({ error: "Parámetros inválidos" });
      const [yy, mm, dd] = String(deadline)
        .split("-")
        .map((n) => parseInt(n, 10));
      const fecha = new Date(yy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
      if (isNaN(fecha))
        return res.status(400).json({ error: "Fecha inválida" });
      const id = `${y}-${rellenar2(m)}`;
      await baseDeDatos
        .collection(COLECCION_DEADLINES)
        .doc(id)
        .set({ deadline: fecha }, { merge: true });
      res.json({ ok: true });
    } catch (e) {
      console.error("/users/payments/deadline POST error:", e);
      res
        .status(500)
        .json({
          error: DEPURAR_ERRORES
            ? e.stack || e.message
            : "Error en el servidor",
        });
    }
  }
);

// Slots
// ----------------------
// Gestión de turnos
// ----------------------
aplicacion.get("/api/slots", async (req, res) => {
  try {
    const { date, from, to } = req.query;
    let consulta = baseDeDatos.collection(COLECCION_TURNOS);
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
      consulta = consulta
        .where("start_time", ">=", fromD)
        .where("start_time", "<=", toD);
    } else if (date) {
      const [y, m, d] = String(date)
        .split("-")
        .map((n) => parseInt(n, 10));
      const d0 = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
      const d1 = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
      consulta = consulta
        .where("start_time", ">=", d0)
        .where("start_time", "<=", d1);
    }
    const instantanea = await consulta.orderBy("start_time", "asc").get();
    const turnos = await Promise.all(
      instantanea.docs.map(async (docTurno) => {
        const turno = { id: docTurno.id, ...docTurno.data() };
        const reservasConfirmadas = await baseDeDatos
          .collection(COLECCION_RESERVAS)
          .where("slot_id", "==", docTurno.id)
          .where("status", "==", "confirmed")
          .get();
        const ocupados = reservasConfirmadas.size;
        const inicio = turno.start_time?.toDate
          ? turno.start_time.toDate()
          : new Date(turno.start_time);
        const fin = turno.end_time?.toDate
          ? turno.end_time.toDate()
          : new Date(turno.end_time);
        return {
          id: turno.id,
          capacity: turno.capacity,
          start_time: inicio.toISOString(),
          end_time: fin.toISOString(),
          start_local: aCadenaLocal(inicio),
          end_local: aCadenaLocal(fin),
          remaining: (turno.capacity || 0) - ocupados,
        };
      })
    );
    res.json(turnos);
  } catch (e) {
    console.error("/slots error:", e);
    res.status(500).json({
      error: DEPURAR_ERRORES ? e.stack || e.message : "Error en el servidor",
    });
  }
});
aplicacion.post("/api/slots", autenticar("admin"), async (req, res) => {
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
  const documento = await baseDeDatos.collection(COLECCION_TURNOS).add({
    start_time: st,
    end_time: et,
    capacity,
  });
  res.status(201).json({ id: documento.id, start_time, end_time, capacity });
});

// Crear turnos en bloque (agenda semanal)
// Crear turnos en bloque según rango de fechas, días de semana y duración
aplicacion.post("/api/slots/bulk", autenticar("admin"), async (req, res) => {
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

    const aEscribir = [];
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
        aEscribir.push({ start_time: new Date(cur), end_time: end, capacity });
        cur = end; // siguiente bloque
      }
    }

    if (aEscribir.length === 0)
      return res.json({ created: 0, warning: "No se generaron turnos" });

    // Escritura en lotes (máx ~500 por batch)
    const chunk = (arr, size) =>
      arr.reduce((acc, _, i) => {
        if (i % size === 0) acc.push(arr.slice(i, i + size));
        return acc;
      }, []);
    const lotes = chunk(aEscribir, 450);
    let creados = 0;
    for (const parte of lotes) {
      const lote = baseDeDatos.batch();
      for (const turno of parte) {
        const referencia = baseDeDatos.collection(COLECCION_TURNOS).doc();
        lote.set(referencia, turno);
      }
      await lote.commit();
      creados += parte.length;
    }

    res.json({ created: creados });
  } catch (e) {
    console.error("/slots/bulk error:", e);
    res.status(500).json({
      error: DEPURAR_ERRORES ? e.stack || e.message : "Error en el servidor",
    });
  }
});
aplicacion.delete("/api/slots/:id", autenticar("admin"), async (req, res) => {
  const { id } = req.params;
  const reservas = await baseDeDatos
    .collection(COLECCION_RESERVAS)
    .where("slot_id", "==", id)
    .get();
  const lote = baseDeDatos.batch();
  reservas.docs.forEach((docReserva) => lote.delete(docReserva.ref));
  lote.delete(baseDeDatos.collection(COLECCION_TURNOS).doc(id));
  await lote.commit();
  res.json({ ok: true });
});
aplicacion.delete("/api/slots", autenticar("admin"), async (req, res) => {
  const turnosSnap = await baseDeDatos.collection(COLECCION_TURNOS).get();
  const lote = baseDeDatos.batch();
  for (const dTurno of turnosSnap.docs) {
    const reservas = await baseDeDatos
      .collection(COLECCION_RESERVAS)
      .where("slot_id", "==", dTurno.id)
      .get();
    reservas.docs.forEach((docReserva) => lote.delete(docReserva.ref));
    lote.delete(dTurno.ref);
  }
  await lote.commit();
  res.json({ ok: true });
});

// Listar inscriptos (bookings confirmados) de un turno con datos de usuario
// Listar inscriptos confirmados en un turno, con datos de usuario
aplicacion.get(
  "/api/slots/:id/attendees",
  autenticar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const turnoDoc = await baseDeDatos
        .collection(COLECCION_TURNOS)
        .doc(id)
        .get();
      if (!turnoDoc.exists)
        return res.status(404).json({ error: "Slot no encontrado" });
      const reservasSnap = await baseDeDatos
        .collection(COLECCION_RESERVAS)
        .where("slot_id", "==", id)
        .where("status", "==", "confirmed")
        .get();
      const asistentes = [];
      for (const docReserva of reservasSnap.docs) {
        const reserva = { id: docReserva.id, ...docReserva.data() };
        const docUsuario = await baseDeDatos
          .collection(COLECCION_USUARIOS)
          .doc(reserva.user_id)
          .get();
        asistentes.push({
          booking_id: reserva.id,
          user_id: reserva.user_id,
          email: docUsuario.exists ? docUsuario.data().email : undefined,
          name: docUsuario.exists ? docUsuario.data().name : undefined,
          created_at: reserva.created_at?.toDate
            ? reserva.created_at.toDate().toISOString()
            : undefined,
          status: reserva.status,
        });
      }
      // Devolver también info del turno con fechas normalizadas
      const datosTurno = turnoDoc.data();
      const inicio = datosTurno.start_time?.toDate
        ? datosTurno.start_time.toDate()
        : new Date(datosTurno.start_time);
      const fin = datosTurno.end_time?.toDate
        ? datosTurno.end_time.toDate()
        : new Date(datosTurno.end_time);
      res.json({
        slot: {
          id: turnoDoc.id,
          capacity: datosTurno.capacity,
          start_time: inicio.toISOString(),
          end_time: fin.toISOString(),
        },
        attendees: asistentes,
      });
    } catch (e) {
      console.error("/slots/:id/attendees error:", e);
      res.status(500).json({
        error: DEPURAR_ERRORES ? e.stack || e.message : "Error en el servidor",
      });
    }
  }
);

// Bookings
// ----------------------
// Reservas (bookings)
// ----------------------
aplicacion.get("/api/bookings", autenticar(), async (req, res) => {
  const esAdministrador = req.user.role === "admin";
  let consulta = baseDeDatos.collection(COLECCION_RESERVAS);
  if (!esAdministrador)
    consulta = consulta
      .where("user_id", "==", req.user.id)
      .where("status", "!=", "canceled");
  const instantanea = await consulta.get();
  const reservas = await Promise.all(
    instantanea.docs.map(async (docReserva) => {
      const reserva = { id: docReserva.id, ...docReserva.data() };
      const docTurno = await baseDeDatos
        .collection(COLECCION_TURNOS)
        .doc(reserva.slot_id)
        .get();
      const datosTurno = docTurno.data();
      const inicio = datosTurno.start_time?.toDate
        ? datosTurno.start_time.toDate()
        : new Date(datosTurno.start_time);
      const fin = datosTurno.end_time?.toDate
        ? datosTurno.end_time.toDate()
        : new Date(datosTurno.end_time);
      return {
        ...reserva,
        start_time: inicio.toISOString(),
        end_time: fin.toISOString(),
        start_local: aCadenaLocal(inicio),
        end_local: aCadenaLocal(fin),
      };
    })
  );
  const ahora = new Date();
  res.json(
    esAdministrador
      ? reservas
      : reservas.filter((r) => new Date(r.start_time) >= ahora)
  );
});
aplicacion.post("/api/bookings", autenticar(), async (req, res) => {
  const { slot_id } = req.body || {};
  if (!slot_id) return res.status(400).json({ error: "slot_id requerido" });
  // Obtener turno para conocer el mes/año de la reserva
  const docTurno = await baseDeDatos
    .collection(COLECCION_TURNOS)
    .doc(slot_id)
    .get();
  if (!docTurno.exists)
    return res.status(404).json({ error: "Slot no encontrado" });
  // Validación de pago según fecha límite del mes del turno
  try {
    const datosTurno = docTurno.data();
    const inicio = datosTurno.start_time?.toDate
      ? datosTurno.start_time.toDate()
      : new Date(datosTurno.start_time);
    const y = inicio.getFullYear();
    const m = inicio.getMonth() + 1; // 1..12
    const clave = `${y}-${rellenar2(m)}`;
    const docUsuario = await baseDeDatos
      .collection(COLECCION_USUARIOS)
      .doc(req.user.id)
      .get();
    const mesesPagos =
      docUsuario.exists && Array.isArray(docUsuario.data().paid_months)
        ? docUsuario.data().paid_months
        : [];
    const pagado = mesesPagos.includes(clave);
    if (!pagado) {
      const docDeadline = await baseDeDatos
        .collection(COLECCION_DEADLINES)
        .doc(clave)
        .get();
      if (docDeadline.exists) {
        let d = docDeadline.data().deadline;
        if (d && d.toDate) d = d.toDate();
        const hoy = new Date();
        const d0 = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          0,
          0,
          0,
          0
        );
        if (hoy >= d0) {
          return res.status(403).json({
            error:
              "Pago vencido: no podés reservar turnos para este mes hasta regularizar el pago",
          });
        }
        // Antes del deadline: permitir aun sin pago
      } else {
        // Sin fecha límite configurada: regla estricta → bloquear si no pagó
        return res
          .status(403)
          .json({ error: "Debes tener al día el pago del mes del turno" });
      }
    }
  } catch (e) {
    console.warn("check payment rule error", e.message);
  }
  const capacidad = docTurno.data().capacity || 0;
  const ocupados = (
    await baseDeDatos
      .collection(COLECCION_RESERVAS)
      .where("slot_id", "==", slot_id)
      .where("status", "==", "confirmed")
      .get()
  ).size;
  if (ocupados >= capacidad) return res.status(409).json({ error: "Sin cupo" });
  const documento = await baseDeDatos.collection(COLECCION_RESERVAS).add({
    user_id: req.user.id,
    slot_id,
    status: "confirmed",
    created_at: administrador.firestore.FieldValue.serverTimestamp(),
  });
  res.status(201).json({ id: documento.id, slot_id, status: "confirmed" });
});
aplicacion.delete("/api/bookings/:id", autenticar(), async (req, res) => {
  const { id } = req.params;
  const docReserva = await baseDeDatos
    .collection(COLECCION_RESERVAS)
    .doc(id)
    .get();
  if (!docReserva.exists) return res.json({ ok: true });
  const esAdministrador = req.user.role === "admin";
  const puede = esAdministrador || docReserva.data().user_id === req.user.id;
  if (!puede) return res.status(403).json({ error: "Forbidden" });
  await baseDeDatos
    .collection(COLECCION_RESERVAS)
    .doc(id)
    .update({ status: "canceled" });
  res.json({ ok: true });
});

// Puesto de escucha del servidor HTTP
const PUERTO = parseInt(process.env.PUERTO || process.env.PORT || 3000, 10);
aplicacion.listen(PUERTO, () =>
  console.log(`API Firestore escuchando en :${PUERTO}`)
);
