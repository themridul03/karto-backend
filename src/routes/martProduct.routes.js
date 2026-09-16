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
  updateMartProductPopular,
  updateMartProductBestSeller,

  createMartProductVariant,
  getMartProductVariants,
  updateMartProductVariant,
  deleteMartProductVariant,
  restoreMartProductVariant,
  hardDeleteMartProductVariant,

  adjustMartProductStock,

  deleteMartProduct,
  restoreMartProduct,
  hardDeleteMartProduct,

  bulkUpdateMartProductStatus,
  getMartProductStats,
} from "../controllers/martProduct.controller.js";

import {
  protect,
  allowRoles,
} from "../middleware/auth.middleware.js";

import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

/* ============================================================
   KARTOMART PRODUCT ROUTES

   Base:
   /api/mart/products
============================================================ */


/* ============================================================
   PUBLIC - GET PRODUCTS
============================================================ */

/**
 * GET /api/mart/products/public
 *
 * Examples:
 *
 * ?storeId=STORE_ID
 * ?categoryId=CATEGORY_ID
 * ?search=tomato
 * ?featured=true
 * ?popular=true
 * ?bestSeller=true
 * ?page=1
 * ?limit=20
 *
 * Public API returns only products which are:
 *
 * - not deleted
 * - active
 * - available
 * - inside active store
 * - store is open
 * - store is verified
 * - store is accepting orders
 *
 * Variant price/stock information comes from
 * MartProductVariant.
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
 *
 * ?storeId=STORE_ID
 * ?categoryId=CATEGORY_ID
 *
 * Returns product statistics.
 */
router.get(
  "/stats",
  protect,
  allowRoles("ADMIN"),
  getMartProductStats
);


/* ============================================================
   ADMIN - BULK PRODUCT STATUS
============================================================ */

/**
 * PATCH /api/mart/products/bulk-status
 *
 * Body:
 *
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
  allowRoles("ADMIN"),
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
 *
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
 *
 * image
 *
 * IMPORTANT:
 *
 * unit
 * quantity
 * mrp
 * price
 * costPrice
 * stock
 *
 * are NOT MartProduct fields.
 *
 * They belong to MartProductVariant.
 *
 *
 * Variants can contain:
 *
 * [
 *   {
 *     "label": "1 KG",
 *     "quantity": 1,
 *     "unit": "KG",
 *     "mrp": 30,
 *     "price": 28,
 *     "costPrice": 24,
 *     "stock": 100,
 *     "sku": "TATA-SALT-1KG",
 *     "barcode": "123456789",
 *     "isDefault": true,
 *     "isAvailable": true,
 *     "isActive": true,
 *     "sortOrder": 1
 *   }
 * ]
 *
 * When using multipart/form-data,
 * variants should normally be sent as JSON string.
 */
router.post(
  "/",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  createMartProduct
);


/* ============================================================
   GET ALL PRODUCTS - ADMIN
============================================================ */

/**
 * GET /api/mart/products
 *
 * Examples:
 *
 * ?page=1
 * ?limit=20
 * ?storeId=STORE_ID
 * ?categoryId=CATEGORY_ID
 * ?search=milk
 * ?isActive=true
 * ?isAvailable=true
 * ?isFeatured=true
 * ?isPopular=true
 * ?isBestSeller=true
 * ?sortBy=sortOrder
 * ?sortOrder=asc
 * ?includeDeleted=true
 * ?onlyDeleted=true
 *
 * Product response includes variants.
 */
router.get(
  "/",
  protect,
  allowRoles("ADMIN"),
  getMartProducts
);


/* ============================================================
   PRODUCT STATUS

   IMPORTANT:
   Keep all specific /:id/... routes BEFORE /:id
============================================================ */

/**
 * PATCH /api/mart/products/:id/status
 *
 * Body:
 *
 * {
 *   "isActive": true
 * }
 */
router.patch(
  "/:id/status",
  protect,
  allowRoles("ADMIN"),
  updateMartProductStatus
);


/* ============================================================
   PRODUCT AVAILABILITY
============================================================ */

/**
 * PATCH /api/mart/products/:id/availability
 *
 * Body:
 *
 * {
 *   "isAvailable": true
 * }
 */
router.patch(
  "/:id/availability",
  protect,
  allowRoles("ADMIN"),
  updateMartProductAvailability
);


/* ============================================================
   PRODUCT FEATURED STATUS
============================================================ */

/**
 * PATCH /api/mart/products/:id/featured
 *
 * Body:
 *
 * {
 *   "isFeatured": true
 * }
 */
router.patch(
  "/:id/featured",
  protect,
  allowRoles("ADMIN"),
  updateMartProductFeatured
);


/* ============================================================
   PRODUCT POPULAR STATUS
============================================================ */

/**
 * PATCH /api/mart/products/:id/popular
 *
 * Body:
 *
 * {
 *   "isPopular": true
 * }
 */
router.patch(
  "/:id/popular",
  protect,
  allowRoles("ADMIN"),
  updateMartProductPopular
);


/* ============================================================
   PRODUCT BEST SELLER STATUS
============================================================ */

/**
 * PATCH /api/mart/products/:id/best-seller
 *
 * Body:
 *
 * {
 *   "isBestSeller": true
 * }
 */
router.patch(
  "/:id/best-seller",
  protect,
  allowRoles("ADMIN"),
  updateMartProductBestSeller
);


/* ============================================================
   PRODUCT VARIANTS
============================================================ */


/* ============================================================
   CREATE PRODUCT VARIANT
============================================================ */

/**
 * POST /api/mart/products/:id/variants
 *
 * :id = PRODUCT_ID
 *
 * Body:
 *
 * {
 *   "label": "1 KG",
 *   "quantity": 1,
 *   "unit": "KG",
 *   "mrp": 30,
 *   "price": 28,
 *   "costPrice": 24,
 *   "stock": 100,
 *   "sku": "TATA-SALT-1KG",
 *   "barcode": "123456789",
 *   "isDefault": true,
 *   "isAvailable": true,
 *   "isActive": true,
 *   "sortOrder": 1
 * }
 *
 * Product-level price/mrp/stock is NOT used.
 */
router.post(
  "/:id/variants",
  protect,
  allowRoles("ADMIN"),
  createMartProductVariant
);


/* ============================================================
   GET PRODUCT VARIANTS
============================================================ */

/**
 * GET /api/mart/products/:id/variants
 *
 * :id = PRODUCT_ID
 *
 * Returns variants belonging to the product.
 */
router.get(
  "/:id/variants",
  protect,
  allowRoles("ADMIN"),
  getMartProductVariants
);


/* ============================================================
   UPDATE PRODUCT VARIANT
============================================================ */

/**
 * PUT /api/mart/products/:id/variants/:variantId
 *
 * :id        = PRODUCT_ID
 * :variantId = VARIANT_ID
 *
 * Body can contain:
 *
 * {
 *   "label": "1 KG",
 *   "quantity": 1,
 *   "unit": "KG",
 *   "mrp": 32,
 *   "price": 29,
 *   "costPrice": 24,
 *   "stock": 120,
 *   "sku": "TATA-SALT-1KG",
 *   "barcode": "123456789",
 *   "isDefault": true,
 *   "isAvailable": true,
 *   "isActive": true,
 *   "sortOrder": 1
 * }
 */
router.put(
  "/:id/variants/:variantId",
  protect,
  allowRoles("ADMIN"),
  updateMartProductVariant
);


/**
 * PATCH /api/mart/products/:id/variants/:variantId
 *
 * Partial variant update.
 *
 * Can also be used for:
 *
 * - price
 * - MRP
 * - cost price
 * - stock
 * - active status
 * - availability
 * - default variant
 * - sort order
 */
router.patch(
  "/:id/variants/:variantId",
  protect,
  allowRoles("ADMIN"),
  updateMartProductVariant
);


/* ============================================================
   RESTORE PRODUCT VARIANT
============================================================ */

/**
 * PATCH
 * /api/mart/products/:id/variants/:variantId/restore
 *
 * Restores soft-deleted variant.
 */
router.patch(
  "/:id/variants/:variantId/restore",
  protect,
  allowRoles("ADMIN"),
  restoreMartProductVariant
);


/* ============================================================
   HARD DELETE PRODUCT VARIANT
============================================================ */

/**
 * DELETE
 * /api/mart/products/:id/variants/:variantId/hard
 *
 * Permanently deletes variant.
 *
 * Controller should block permanent deletion when
 * order/history dependencies make deletion unsafe.
 */
router.delete(
  "/:id/variants/:variantId/hard",
  protect,
  allowRoles("ADMIN"),
  hardDeleteMartProductVariant
);


/* ============================================================
   SOFT DELETE PRODUCT VARIANT
============================================================ */

/**
 * DELETE
 * /api/mart/products/:id/variants/:variantId
 *
 * Soft deletes variant.
 */
router.delete(
  "/:id/variants/:variantId",
  protect,
  allowRoles("ADMIN"),
  deleteMartProductVariant
);


/* ============================================================
   PRODUCT STOCK MANAGEMENT
============================================================ */

/**
 * PATCH /api/mart/products/:id/stock
 *
 * IMPORTANT:
 *
 * Actual stock belongs to MartProductVariant.
 *
 * This controller endpoint manages stock using
 * the target variant and creates MartStockMovement.
 *
 * Supports controller operations such as:
 *
 * ADD
 * REMOVE
 * SET
 * ADJUSTMENT
 *
 * Do not directly update stock from frontend without
 * server-side validation.
 */
router.patch(
  "/:id/stock",
  protect,
  allowRoles("ADMIN"),
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
  allowRoles("ADMIN"),
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
 * Controller prevents unsafe permanent deletion when
 * related historical/order records exist.
 */
router.delete(
  "/:id/hard",
  protect,
  allowRoles("ADMIN"),
  hardDeleteMartProduct
);


/* ============================================================
   GET PRODUCT BY ID
============================================================ */

/**
 * GET /api/mart/products/:id
 *
 * Admin product details.
 *
 * Includes variant information.
 */
router.get(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  getMartProductById
);


/* ============================================================
   UPDATE PRODUCT
============================================================ */

/**
 * PUT /api/mart/products/:id
 *
 * Content-Type:
 * multipart/form-data
 *
 * Product fields:
 *
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
 * Optional:
 *
 * image
 *
 * Variant information can be handled by controller
 * according to its variants payload support.
 *
 * Remember:
 *
 * price/mrp/costPrice/stock/unit/quantity
 * belong to MartProductVariant.
 */
router.put(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  updateMartProduct
);


/**
 * PATCH /api/mart/products/:id
 *
 * Partial product update.
 *
 * Optional image replacement supported.
 */
router.patch(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  upload.single("image"),
  updateMartProduct
);


/* ============================================================
   SOFT DELETE PRODUCT
============================================================ */

/**
 * DELETE /api/mart/products/:id
 *
 * Soft deletes product.
 */
router.delete(
  "/:id",
  protect,
  allowRoles("ADMIN"),
  deleteMartProduct
);


export default router;