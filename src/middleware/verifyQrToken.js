import jwt from "jsonwebtoken";
export function verifyQrToken(req, res, next) {
  const token = req.query.t || req.body.t;

  console.log("TOKEN:", token);
  console.log("SECRET:", process.env.JWT_SECRET);
  console.log("✅ VERIFY QR RUNNING");

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