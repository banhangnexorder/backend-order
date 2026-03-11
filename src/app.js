import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

/* ===== ROUTES ===== */
import orderRoutes from "./routes/order.js";
import adminRoutes from "./routes/admin.js";
import adminLogin from "./routes/adminAuth.js";
import authRoutes from "./routes/auth.js";
import menuRoutes from "./routes/menu.js";
import menuImages from "./routes/menuImages.js";
import adminImportFull from "./routes/adminImportFull.js";

/* ===== MIDDLEWARE ===== */
import adminAuth from "./middleware/adminAuth.js";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

/* ===== GLOBAL MIDDLEWARE ===== */

app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"]
}));

app.use(express.json());

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/* ===== HTTP + SOCKET ===== */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET","POST"]
  }
});

app.set("io", io);

io.on("connection", socket => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* ===== STATIC FILES ===== */

app.use("/uploads", express.static(path.resolve("src/uploads")));

/* ===== PUBLIC ROUTES ===== */

app.use("/api/admin", adminLogin);

app.use("/api", authRoutes);

app.use("/api/menu", menuRoutes);

/* ===== ADMIN PROTECTED ROUTES ===== */

app.use("/api/admin", adminAuth, adminRoutes);

app.use("/api/admin/menu-images", adminAuth, menuImages);

app.use("/api/admin", adminImportFull);

/* ===== ORDERS ===== */

app.use("/api/orders", orderRoutes);

console.log("ENV:", process.env.NODE_ENV);

/* ===== START SERVER ===== */

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});