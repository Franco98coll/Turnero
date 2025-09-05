require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const app = express();
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const slotsRouter = require("./routes/slots");
const bookingsRouter = require("./routes/bookings");

app.use(cors());
app.use(express.json());
// No servimos 'public' aquí; se decide más abajo según si existe web/dist

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/db-ping", async (req, res) => {
  try {
    const { getPool } = require("./db");
    const pool = await getPool();
    const result = await pool.request().query("SELECT 1 as ok");
    res.json({ ok: true, result: result.recordset[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/bookings", bookingsRouter);

// Servir frontend de Vite si existe el build (web/dist)
const webDistPath = path.join(__dirname, "..", "web", "dist");
const publicPath = path.join(__dirname, "..", "public");
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
} else {
  app.use(express.static(publicPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
