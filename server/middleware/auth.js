const jwt = require("jsonwebtoken");

function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No autorizado" });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "changeme");
      req.user = payload;
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: "Prohibido" });
      }
      next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido" });
    }
  };
}

module.exports = { auth };
