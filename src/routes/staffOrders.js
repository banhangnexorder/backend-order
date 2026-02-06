import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import db from "../db.js";

const router = express.Router();

// STAFF xem đơn trong ngày
router.get("/", verifyToken, authorize(["staff"]), async (req, res) => {
  const orders = await db.order.findMany({
    where: {
      createdAt: {
        gte: new Date(new Date().setHours(0,0,0,0))
      }
    },
    orderBy: { createdAt: "desc" }
  });

  res.json(orders);
});

export default router;
