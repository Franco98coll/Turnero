const sql = require("mssql");

function buildConfigFromEnv() {
  // Soportar: DB_SERVER como 'host' o 'host\\instancia'
  // o bien usar DB_HOST + DB_INSTANCE explícitos.
  const rawServer = process.env.DB_HOST || process.env.DB_SERVER || "localhost";
  let host = rawServer;
  let instanceName = process.env.DB_INSTANCE || undefined;
  if (!instanceName) {
    // Aceptar uno o más backslashes: 'host\\instancia' o incluso 'host\\\\instancia'
    const m = rawServer.match(/^([^\\]+)\\+(.+)$/);
    if (m) {
      host = m[1];
      instanceName = m[2];
    }
  }

  const connTimeout = process.env.DB_CONN_TIMEOUT
    ? parseInt(process.env.DB_CONN_TIMEOUT, 10)
    : 30000; // 30s
  const reqTimeout = process.env.DB_REQUEST_TIMEOUT
    ? parseInt(process.env.DB_REQUEST_TIMEOUT, 10)
    : 30000;
  const encrypt =
    String(process.env.DB_ENCRYPT || "false").toLowerCase() === "true";
  const trustCert =
    String(process.env.DB_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() !==
    "false";

  const base = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: host,
    database: process.env.DB_NAME,
    options: {
      encrypt,
      trustServerCertificate: trustCert,
    },
    connectionTimeout: connTimeout,
    requestTimeout: reqTimeout,
  };

  if (instanceName) {
    base.options.instanceName = instanceName;
    // No forzar puerto para instancia con nombre (usa SQL Browser/dynamic).
  } else {
    base.port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433;
  }

  return base;
}

const config = buildConfigFromEnv();

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool) => {
        console.log("Conectado a SQL Server");
        return pool;
      })
      .catch((err) => {
        console.error("Error de conexión a SQL Server:", err);
        poolPromise = undefined;
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
