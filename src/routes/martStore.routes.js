import express from "express";

import {
  createMartStore,
  getMartStores,
  getMartStoreById,
  updateMartStore,
  deleteMartStore,
  restoreMartStore,
  hardDeleteMartStore,

  updateMartStoreActiveStatus,
  updateMartStoreOpenStatus,
  updateMartStoreAcceptingOrders,
  updateMartStoreVerification,

  getPublicMartStores,
  getNearbyMartStores,
  getMartStoreStats,
  bulkUpdateMartStoreStatus,
  reorderMartStores,
} from "../controllers/martStore.controller.js";

import {
  protect,
  authorize,
} from "../middleware/auth.middleware.js";

import upload from "../middleware/upload.middleware.js";

const router = express.Router();

/* ============================================================
   PUBLIC KARTOMART ROUTES
============================================================ */

router.get(
  "/public",
  getPublicMartStores
);

router.get(
  "/nearby",
  getNearbyMartStores
);

/* ============================================================
   ADMIN - STATS
============================================================ */

router.get(
  "/stats",
  protect,
  authorize("ADMIN"),
  getMartStoreStats
);

/* ============================================================
   ADMIN - BULK STATUS
============================================================ */

router.patch(
  "/bulk-status",
  protect,
  authorize("ADMIN"),
  bulkUpdateMartStoreStatus
);

/* ============================================================
   ADMIN - REORDER STORES
============================================================ */

router.patch(
  "/reorder",
  protect,
  authorize("ADMIN"),
  reorderMartStores
);

/* ============================================================
   CREATE STORE
============================================================ */

router.post(
  "/",
  protect,
  authorize("ADMIN"),
  upload.single("image"),
  createMartStore
);

/* ============================================================
   GET ALL STORES - ADMIN
============================================================ */

router.get(
  "/",
  protect,
  authorize("ADMIN"),
  getMartStores
);

/* ============================================================
   STORE STATUS ROUTES
============================================================ */

/**
 * PATCH /api/mart/stores/:id/active-status
 *
 * {
 *   "isActive": true
 * }
 */
router.patch(
  "/:id/active-status",
  protect,
  authorize("ADMIN"),
  updateMartStoreActiveStatus
);

/**
 * PATCH /api/mart/stores/:id/open-status
 *
 * {
 *   "isOpen": true
 * }
 */
router.patch(
  "/:id/open-status",
  protect,
  authorize("ADMIN"),
  updateMartStoreOpenStatus
);

/**
 * PATCH /api/mart/stores/:id/accepting-orders
 *
 * {
 *   "isAcceptingOrders": true
 * }
 */
router.patch(
  "/:id/accepting-orders",
  protect,
  authorize("ADMIN"),
  updateMartStoreAcceptingOrders
);

/**
 * PATCH /api/mart/stores/:id/verification
 *
 * {
 *   "isVerified": true
 * }
 */
router.patch(
  "/:id/verification",
  protect,
  authorize("ADMIN"),
  updateMartStoreVerification
);

/* ============================================================
   RESTORE STORE
============================================================ */

router.patch(
  "/:id/restore",
  protect,
  authorize("ADMIN"),
  restoreMartStore
);

/* ============================================================
   HARD DELETE STORE
============================================================ */

router.delete(
  "/:id/hard",
  protect,
  authorize("ADMIN"),
  hardDeleteMartStore
);

/* ============================================================
   GET STORE BY ID
============================================================ */

router.get(
  "/:id",
  protect,
  authorize("ADMIN"),
  getMartStoreById
);

/* ============================================================
   UPDATE STORE
============================================================ */

router.put(
  "/:id",
  protect,
  authorize("ADMIN"),
  upload.single("image"),
  updateMartStore
);

router.patch(
  "/:id",
  protect,
  authorize("ADMIN"),
  upload.single("image"),
  updateMartStore
);

/* ============================================================
   SOFT DELETE STORE
============================================================ */

router.delete(
  "/:id",
  protect,
  authorize("ADMIN"),
  deleteMartStore
);

export default router;