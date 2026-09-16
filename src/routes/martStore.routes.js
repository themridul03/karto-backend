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
  allowRoles,
} from "../middleware/auth.middleware.js";

import { upload } from "../middleware/upload.middleware.js";

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
  allowRoles("ADMIN"),
  getMartStoreStats
);

/* ============================================================
   ADMIN - BULK STATUS
============================================================ */

router.patch(
  "/bulk-status",
  protect,
  allowRoles("ADMIN"),
  bulkUpdateMartStoreStatus
);

/* ============================================================
   ADMIN - REORDER STORES
============================================================ */

router.patch(
  "/reorder",
  protect,
  allowRoles("ADMIN"),
  reorderMartStores
);

/* ============================================================
   CREATE STORE
============================================================ */

router.post(
  "/",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  createMartStore
);

/* ============================================================
   GET ALL STORES - ADMIN
============================================================ */

router.get(
  "/",
  protect,
  allowRoles("ADMIN"),
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
  allowRoles("ADMIN"),
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
  allowRoles("ADMIN"),
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
  allowRoles("ADMIN"),
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
  allowRoles("ADMIN"),
  updateMartStoreVerification
);

/* ============================================================
   RESTORE STORE
============================================================ */

router.patch(
  "/:id/restore",
  protect,
  allowRoles("ADMIN"),
  restoreMartStore
);

/* ============================================================
   HARD DELETE STORE
============================================================ */

router.delete(
  "/:id/hard",
  protect,
  allowRoles("ADMIN"),
  hardDeleteMartStore
);

/* ============================================================
   GET STORE BY ID
============================================================ */

router.get(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  getMartStoreById
);

/* ============================================================
   UPDATE STORE
============================================================ */

router.put(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  updateMartStore
);

router.patch(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  updateMartStore
);

/* ============================================================
   SOFT DELETE STORE
============================================================ */

router.delete(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  deleteMartStore
);

export default router;