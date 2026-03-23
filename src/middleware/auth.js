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
