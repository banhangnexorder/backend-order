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

/* ===== MIDDLEWARE ===== */
import adminAuth from "./middleware/adminAuth.js";

import adminImportFull from "./routes/adminImportFull.js";


dotenv.config();

const app = express();
app.use(cors({
  origin: "*"
}));
app.use(express.json());

/* ===== HTTP + SOCKET ===== */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
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
app.use(
  "/uploads/menu",
  express.static(path.resolve("src/uploads/menu"))
);

/* ===== PUBLIC ROUTES ===== */

// login admin
app.use("/api/admin", adminLogin);

// client / staff / kitchen auth
app.use("/api", authRoutes);

// menu cho client
app.use("/api/menu", menuRoutes);

/* ===== ADMIN PROTECTED ROUTES ===== */
app.use("/api/admin", adminAuth, adminRoutes);

// upload ảnh menu
app.use("/api/admin/menu-images", adminAuth, menuImages);

/* ===== ORDERS ===== */
app.use("/api/orders", orderRoutes);

//import full
app.use("/api/admin", adminImportFull);

console.log("ENV:", process.env.NODE_ENV);

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});


app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});