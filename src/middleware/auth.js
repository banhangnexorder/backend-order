import jwt from "jsonwebtoken";

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

export const requireRole = (...roles) => {
  return (req, res, next) => {
    console.log("USER ROLE:", req.user.role);
    console.log("ALLOWED:", roles);

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Không có quyền" });
    }

    next();
  };
};

export function verifyQrToken(req, res, next) {
  const token = req.query.t || req.body.t;

  if (!token) {
    return res.status(400).json({ message: "Missing QR token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // gắn vào request để dùng tiếp
    req.qr = decoded;

    next();
  } catch (err) {
    console.error("QR TOKEN ERROR:", err.message);
    return res.status(401).json({ message: "Invalid QR token" });
  }
}
