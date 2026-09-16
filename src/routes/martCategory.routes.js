import express from "express";

import {
  createMartCategory,
  getMartCategories,
  getMartCategoryById,
  updateMartCategory,
  updateMartCategoryStatus,
  deleteMartCategory,
  restoreMartCategory,
  hardDeleteMartCategory,
  getPublicMartCategories,
  bulkUpdateMartCategoryStatus,
  reorderMartCategories,
  getMartCategoryStats,
} from "../controllers/martCategory.controller.js";

import {
  protect,
  allowRoles,
} from "../middleware/auth.middleware.js";

import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

/* ============================================================
   PUBLIC ROUTES
============================================================ */

/**
 * GET /api/mart/categories/public
 *
 * Query:
 * ?storeId=STORE_ID
 * ?storeId=STORE_ID&search=grocery
 *
 * Returns active categories from an active/available KartoMart.
 */
router.get(
  "/public",
  getPublicMartCategories
);

/* ============================================================
   ADMIN - CATEGORY STATS
============================================================ */

/**
 * GET /api/mart/categories/stats
 *
 * Optional:
 * ?storeId=STORE_ID
 */
router.get(
  "/stats",
  protect,
  allowRoles("ADMIN"),
  getMartCategoryStats
);

/* ============================================================
   ADMIN - BULK STATUS
============================================================ */

/**
 * PATCH /api/mart/categories/bulk-status
 *
 * Body:
 * {
 *   "ids": [
 *     "CATEGORY_ID_1",
 *     "CATEGORY_ID_2"
 *   ],
 *   "isActive": true
 * }
 */
router.patch(
  "/bulk-status",
  protect,
  allowRoles("ADMIN"),
  bulkUpdateMartCategoryStatus
);

/* ============================================================
   ADMIN - REORDER CATEGORIES
============================================================ */

/**
 * PATCH /api/mart/categories/reorder
 *
 * Body:
 * {
 *   "storeId": "STORE_ID",
 *   "categories": [
 *     {
 *       "id": "CATEGORY_ID_1",
 *       "sortOrder": 0
 *     },
 *     {
 *       "id": "CATEGORY_ID_2",
 *       "sortOrder": 1
 *     }
 *   ]
 * }
 */
router.patch(
  "/reorder",
  protect,
  allowRoles("ADMIN"),
  reorderMartCategories
);

/* ============================================================
   CREATE CATEGORY
============================================================ */

/**
 * POST /api/mart/categories
 *
 * Content-Type:
 * multipart/form-data
 *
 * Fields:
 * storeId
 * name
 * description
 * sortOrder
 * isActive
 *
 * File:
 * image
 */
router.post(
  "/",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  createMartCategory
);

/* ============================================================
   GET ALL CATEGORIES - ADMIN
============================================================ */

/**
 * GET /api/mart/categories
 *
 * Query:
 *
 * ?page=1
 * &limit=20
 * &storeId=STORE_ID
 * &search=grocery
 * &isActive=true
 * &sortBy=sortOrder
 * &sortOrder=asc
 * &includeDeleted=false
 * &onlyDeleted=false
 */
router.get(
  "/",
  protect,
  allowRoles("ADMIN"),
  getMartCategories
);

/* ============================================================
   CATEGORY STATUS
============================================================ */

/**
 * PATCH /api/mart/categories/:id/status
 *
 * Body:
 * {
 *   "isActive": true
 * }
 */
router.patch(
  "/:id/status",
  protect,
  allowRoles("ADMIN"),
  updateMartCategoryStatus
);

/* ============================================================
   RESTORE CATEGORY
============================================================ */

/**
 * PATCH /api/mart/categories/:id/restore
 *
 * Restores a soft-deleted category.
 * Restored category remains inactive until Admin activates it.
 */
router.patch(
  "/:id/restore",
  protect,
  allowRoles("ADMIN"),
  restoreMartCategory
);

/* ============================================================
   HARD DELETE CATEGORY
============================================================ */

/**
 * DELETE /api/mart/categories/:id/hard
 *
 * Permanently deletes category.
 *
 * Controller should prevent permanent deletion when
 * related products exist.
 */
router.delete(
  "/:id/hard",
  protect,
  allowRoles("ADMIN"),
  hardDeleteMartCategory
);

/* ============================================================
   GET CATEGORY BY ID
============================================================ */

/**
 * GET /api/mart/categories/:id
 */
router.get(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  getMartCategoryById
);

/* ============================================================
   UPDATE CATEGORY
============================================================ */

/**
 * PUT /api/mart/categories/:id
 *
 * Content-Type:
 * multipart/form-data
 *
 * Optional fields:
 * storeId
 * name
 * description
 * sortOrder
 * isActive
 *
 * Optional file:
 * image
 */
router.put(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  updateMartCategory
);

/**
 * PATCH /api/mart/categories/:id
 *
 * Partial update.
 */
router.patch(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  updateMartCategory
);

/* ============================================================
   SOFT DELETE CATEGORY
============================================================ */

/**
 * DELETE /api/mart/categories/:id
 *
 * Sets deletedAt instead of permanently deleting.
 */
router.delete(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  deleteMartCategory
);

export default router;