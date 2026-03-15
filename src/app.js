import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { pool } from "./db.js";

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
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();

const limiter = rateLimit({
  windowMs: 1000,
  max: 50
});

app.use("/api/", limiter);

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

  /* JOIN STORE ROOM */
  socket.on("join_store", (store_id) => {
    const room = `store_${store_id}`;
    socket.join(room);
    console.log(`🏪 Socket ${socket.id} joined ${room}`);
  });

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


const PORT = process.env.PORT || 4000;

async function startServer() {

  try {

    await pool.query("SELECT 1");

    console.log("✅ PostgreSQL ready");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`);
    });

  } catch (err) {

    console.error("❌ DB start error:", err);

  }

}

startServer();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});