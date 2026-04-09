import jwt from "jsonwebtoken";

export function verifyQrToken(req, res, next) {

  const token =
    req.query.t ||
    req.body.t ||
    req.headers["x-qr-token"]; // ✅ THÊM DÒNG NÀY

  console.log("TOKEN:", token);
  console.log("SECRET:", process.env.JWT_SECRET);

  if (!token) {
    return res.status(400).json({ message: "Missing QR token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.qr = decoded;
    next();
  } catch (err) {
    console.error("QR TOKEN ERROR:", err.message);
    return res.status(401).json({ message: "Invalid QR token" });
  }
}