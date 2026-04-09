export function verifyQrToken(req, res, next) {

  const token =
    req.query.t ||
    req.body.t ||
    req.headers["x-qr-token"];

  if (!token) {
    return res.status(400).json({ message: "Missing QR token" });
  }

  try {
    // 👉 thử decode base64 trước
    const decoded = JSON.parse(Buffer.from(token, "base64").toString());

    req.qr = decoded;
    return next();

  } catch (e) {
    try {
      // 👉 fallback JWT (code cũ)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.qr = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid QR token" });
    }
  }
}