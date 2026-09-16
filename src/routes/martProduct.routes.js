import express from "express";

import {
  createMartProduct,
  getMartProducts,
  getMartProductById,
  updateMartProduct,

  getPublicMartProducts,

  updateMartProductStatus,
  updateMartProductAvailability,
  updateMartProductFeatured,
  updateMartProductBestSeller,

  adjustMartProductStock,

  deleteMartProduct,
  restoreMartProduct,
  hardDeleteMartProduct,

  bulkUpdateMartProductStatus,
  getMartProductStats,
} from "../controllers/martProduct.controller.js";

import {
  protect,
  authorize,
} from "../middleware/auth.middleware.js";

import upload from "../middleware/upload.middleware.js";

const router = express.Router();

/* ============================================================
   PUBLIC ROUTES
============================================================ */

/**
 * GET /api/mart/products/public
 *
 * Examples:
 * ?storeId=STORE_ID
 * ?categoryId=CATEGORY_ID
 * ?search=tomato
 * ?featured=true
 * ?bestSeller=true
 * ?page=1&limit=20
 */
router.get(
  "/public",
  getPublicMartProducts
);

/* ============================================================
   ADMIN - PRODUCT STATS
============================================================ */

/**
 * GET /api/mart/products/stats
 *
 * Optional:
 * ?storeId=STORE_ID
 * ?categoryId=CATEGORY_ID
 */
router.get(
  "/stats",
  protect,
  authorize("ADMIN"),
  getMartProductStats
);

/* ============================================================
   ADMIN - BULK STATUS
============================================================ */

/**
 * PATCH /api/mart/products/bulk-status
 *
 * Example:
 * {
 *   "ids": [
 *     "PRODUCT_ID_1",
 *     "PRODUCT_ID_2"
 *   ],
 *   "isActive": true
 * }
 */
router.patch(
  "/bulk-status",
  protect,
  authorize("ADMIN"),
  bulkUpdateMartProductStatus
);

/* ============================================================
   CREATE PRODUCT
============================================================ */

/**
 * POST /api/mart/products
 *
 * Content-Type:
 * multipart/form-data
 *
 * Product fields:
 * storeId
 * categoryId
 * name
 * description
 * brand
 * isActive
 * isAvailable
 * isFeatured
 * isPopular
 * isBestSeller
 * sortOrder
 *
 * File:
 * image
 *
 * Variants can contain:
 * label
 * quantity
 * unit
 * mrp
 * price
 * costPrice
 * stock
 * sku
 * barcode
 * isDefault
 * isAvailable
 * isActive
 * sortOrder
 */
router.post(
  "/",
  protect,
  authorize("ADMIN"),
  upload.single("image"),
  createMartProduct
);

/* ============================================================
   GET ALL PRODUCTS - ADMIN
============================================================ */

/**
 * GET /api/mart/products
 *
 * Supports controller filtering/sorting/pagination.
 *
 * Examples:
 * ?page=1&limit=20
 * ?storeId=STORE_ID
 * ?categoryId=CATEGORY_ID
 * ?search=milk
 * ?isActive=true
 * ?isAvailable=true
 * ?isFeatured=true
 * ?isBestSeller=true
 * ?sortBy=sortOrder
 * ?sortOrder=asc
 * ?includeDeleted=true
 * ?onlyDeleted=true
 */
router.get(
  "/",
  protect,
  authorize("ADMIN"),
  getMartProducts
);

/* ============================================================
   PRODUCT STATUS
   Keep specific routes BEFORE /:id
============================================================ */

/**
 * PATCH /api/mart/products/:id/status
 *
 * {
 *   "isActive": true
 * }
 */
router.patch(
  "/:id/status",
  protect,
  authorize("ADMIN"),
  updateMartProductStatus
);

/* ============================================================
   PRODUCT AVAILABILITY
============================================================ */

/**
 * PATCH /api/mart/products/:id/availability
 *
 * {
 *   "isAvailable": true
 * }
 */
router.patch(
  "/:id/availability",
  protect,
  authorize("ADMIN"),
  updateMartProductAvailability
);

/* ============================================================
   FEATURED
============================================================ */

/**
 * PATCH /api/mart/products/:id/featured
 *
 * {
 *   "isFeatured": true
 * }
 */
router.patch(
  "/:id/featured",
  protect,
  authorize("ADMIN"),
  updateMartProductFeatured
);

/* ============================================================
   BEST SELLER
============================================================ */

/**
 * PATCH /api/mart/products/:id/best-seller
 *
 * {
 *   "isBestSeller": true
 * }
 */
router.patch(
  "/:id/best-seller",
  protect,
  authorize("ADMIN"),
  updateMartProductBestSeller
);

/* ============================================================
   STOCK MANAGEMENT
============================================================ */

/**
 * PATCH /api/mart/products/:id/stock
 *
 * Stock is maintained at MartProductVariant level.
 *
 * Controller handles:
 * ADD
 * REMOVE
 * SET
 * ADJUSTMENT
 *
 * and creates MartStockMovement history.
 */
router.patch(
  "/:id/stock",
  protect,
  authorize("ADMIN"),
  adjustMartProductStock
);

/* ============================================================
   RESTORE PRODUCT
============================================================ */

/**
 * PATCH /api/mart/products/:id/restore
 *
 * Restores soft-deleted product.
 */
router.patch(
  "/:id/restore",
  protect,
  authorize("ADMIN"),
  restoreMartProduct
);

/* ============================================================
   HARD DELETE PRODUCT
============================================================ */

/**
 * DELETE /api/mart/products/:id/hard
 *
 * Permanent delete.
 *
 * Controller should block deletion when historical/order
 * dependencies make permanent deletion unsafe.
 */
router.delete(
  "/:id/hard",
  protect,
  authorize("ADMIN"),
  hardDeleteMartProduct
);

/* ============================================================
   GET PRODUCT BY ID
============================================================ */

/**
 * GET /api/mart/products/:id
 */
router.get(
  "/:id",
  protect,
  authorize("ADMIN"),
  getMartProductById
);

/* ============================================================
   UPDATE PRODUCT
============================================================ */

/**
 * PUT /api/mart/products/:id
 *
 * multipart/form-data
 *
 * image is optional.
 */
router.put(
  "/:id",
  protect,
  authorize("ADMIN"),
  upload.single("image"),
  updateMartProduct
);

/**
 * PATCH /api/mart/products/:id
 *
 * Partial product update.
 */
router.patch(
  "/:id",
  protect,
  authorize("ADMIN"),
  upload.single("image"),
  updateMartProduct
);

/* ============================================================
   SOFT DELETE PRODUCT
============================================================ */

/**
 * DELETE /api/mart/products/:id
 */
router.delete(
  "/:id",
  protect,
  authorize("ADMIN"),
  deleteMartProduct
);

export default router;