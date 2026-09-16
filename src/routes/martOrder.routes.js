import express from "express";

import {
  createMartOrder,

  getMyMartOrders,
  getMyMartOrderById,
  getMyMartOrderByNumber,
  cancelMyMartOrder,

  getMartOrders,
  getMartOrderById,
  updateMartOrderStatus,

  assignMartOrderRider,
  unassignMartOrderRider,

  updateMartOrderPaymentStatus,

  getMartOrderStats,
} from "../controllers/martOrder.controller.js";

import {
  protect,
  authorize,
} from "../middleware/auth.middleware.js";

const router = express.Router();

/* ============================================================
   KARTOMART ORDER ROUTES

   Base:
   /api/mart/orders
============================================================ */


/* ============================================================
   CUSTOMER - CREATE ORDER
============================================================ */

/**
 * POST /api/mart/orders
 *
 * Creates order from logged-in user's KartoMart cart.
 *
 * Body:
 * {
 *   "addressId": "ADDRESS_ID",
 *   "paymentMethod": "COD",
 *   "customerNote": "Optional note",
 *   "distanceKm": 3.5
 * }
 *
 * IMPORTANT:
 * Frontend does NOT send:
 *
 * - itemTotal
 * - deliveryFee
 * - platformFee
 * - totalAmount
 * - product price
 * - stock
 *
 * Controller calculates/validates everything server-side.
 */
router.post(
  "/",
  protect,
  createMartOrder
);


/* ============================================================
   CUSTOMER - MY ORDERS
============================================================ */

/**
 * GET /api/mart/orders/my
 *
 * Query:
 *
 * ?page=1
 * ?limit=20
 * ?status=PLACED
 *
 * Example:
 * /my?page=1&limit=20&status=DELIVERED
 */
router.get(
  "/my",
  protect,
  getMyMartOrders
);


/* ============================================================
   CUSTOMER - ORDER BY ORDER NUMBER
============================================================ */

/**
 * GET /api/mart/orders/my/number/:orderNumber
 *
 * Example:
 *
 * /my/number/KM-260916-143012-A8F3
 */
router.get(
  "/my/number/:orderNumber",
  protect,
  getMyMartOrderByNumber
);


/* ============================================================
   CUSTOMER - CANCEL ORDER
============================================================ */

/**
 * PATCH /api/mart/orders/my/:id/cancel
 *
 * Body:
 * {
 *   "reason": "Ordered by mistake"
 * }
 *
 * Controller:
 * - validates ownership
 * - validates cancellable status
 * - cancels order
 * - restores stock
 * - creates stock movement
 * - creates order status history
 */
router.patch(
  "/my/:id/cancel",
  protect,
  cancelMyMartOrder
);


/* ============================================================
   CUSTOMER - GET SINGLE ORDER
============================================================ */

/**
 * GET /api/mart/orders/my/:id
 *
 * User can access only their own order.
 */
router.get(
  "/my/:id",
  protect,
  getMyMartOrderById
);


/* ============================================================
   ADMIN - ORDER STATS
============================================================ */

/**
 * GET /api/mart/orders/admin/stats
 *
 * Optional:
 *
 * ?storeId=STORE_ID
 *
 * Returns:
 *
 * - total
 * - placed
 * - accepted
 * - packing
 * - ready
 * - picked
 * - delivered
 * - cancelled
 * - total revenue
 * - item revenue
 * - delivery fees
 * - platform fees
 * - average order value
 */
router.get(
  "/admin/stats",
  protect,
  authorize("ADMIN"),
  getMartOrderStats
);


/* ============================================================
   ADMIN - GET ALL ORDERS
============================================================ */

/**
 * GET /api/mart/orders/admin
 *
 * Filtering:
 *
 * ?page=1
 * &limit=20
 * &search=KM-260916
 * &storeId=STORE_ID
 * &userId=USER_ID
 * &riderId=RIDER_ID
 * &status=PLACED
 * &paymentStatus=PENDING
 * &paymentMethod=COD
 * &startDate=2026-09-01
 * &endDate=2026-09-16
 * &sortOrder=desc
 */
router.get(
  "/admin",
  protect,
  authorize("ADMIN"),
  getMartOrders
);


/* ============================================================
   ADMIN - UPDATE ORDER STATUS
============================================================ */

/**
 * PATCH /api/mart/orders/admin/:id/status
 *
 * Body:
 * {
 *   "status": "ACCEPTED",
 *   "note": "Order accepted by KartoMart"
 * }
 *
 * Flow:
 *
 * PLACED
 *   ↓
 * ACCEPTED
 *   ↓
 * PACKING
 *   ↓
 * READY
 *   ↓
 * PICKED
 *   ↓
 * DELIVERED
 *
 * Cancellation should use dedicated cancel logic
 * because stock needs to be restored.
 */
router.patch(
  "/admin/:id/status",
  protect,
  authorize("ADMIN"),
  updateMartOrderStatus
);


/* ============================================================
   ADMIN - ASSIGN RIDER
============================================================ */

/**
 * PATCH /api/mart/orders/admin/:id/rider
 *
 * Body:
 * {
 *   "riderId": "RIDER_ID"
 * }
 */
router.patch(
  "/admin/:id/rider",
  protect,
  authorize("ADMIN"),
  assignMartOrderRider
);


/* ============================================================
   ADMIN - UNASSIGN RIDER
============================================================ */

/**
 * DELETE /api/mart/orders/admin/:id/rider
 *
 * Removes assigned rider from order.
 */
router.delete(
  "/admin/:id/rider",
  protect,
  authorize("ADMIN"),
  unassignMartOrderRider
);


/* ============================================================
   ADMIN - UPDATE PAYMENT STATUS
============================================================ */

/**
 * PATCH /api/mart/orders/admin/:id/payment-status
 *
 * Body:
 * {
 *   "paymentStatus": "PAID"
 * }
 */
router.patch(
  "/admin/:id/payment-status",
  protect,
  authorize("ADMIN"),
  updateMartOrderPaymentStatus
);


/* ============================================================
   ADMIN - GET SINGLE ORDER
============================================================ */

/**
 * GET /api/mart/orders/admin/:id
 */
router.get(
  "/admin/:id",
  protect,
  authorize("ADMIN"),
  getMartOrderById
);


export default router;