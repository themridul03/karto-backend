import express from "express";

import {
  addMartCartItem,
  getMartCart,
  updateMartCartItem,

  incrementMartCartItem,
  decrementMartCartItem,

  removeMartCartItem,
  removeMartCartItemByVariant,

  clearMartCart,
  getMartCartCount,
  validateMartCart,

  changeMartCartVariant,
  getMartCartItemByVariant,
} from "../controllers/martCart.controller.js";

import {
  protect,
} from "../middleware/auth.middleware.js";

const router = express.Router();

/* ============================================================
   KARTOMART CART ROUTES

   All cart routes require logged-in user.

   Base:
   /api/mart/cart
============================================================ */


/* ============================================================
   GET MY CART
============================================================ */

/**
 * GET /api/mart/cart
 *
 * Returns:
 * - Cart items
 * - Store
 * - Current prices
 * - Item total
 * - MRP total
 * - Savings
 * - Delivery fee
 * - Platform fee
 * - Minimum order information
 * - Payable amount
 */
router.get(
  "/",
  protect,
  getMartCart
);


/* ============================================================
   ADD ITEM TO CART
============================================================ */

/**
 * POST /api/mart/cart
 *
 * Body:
 * {
 *   "storeId": "STORE_ID",
 *   "productId": "PRODUCT_ID",
 *   "variantId": "VARIANT_ID",
 *   "quantity": 2,
 *   "note": "Optional note"
 * }
 *
 * IMPORTANT:
 * price / totalPrice are NOT accepted from frontend.
 * Controller calculates them from MartProductVariant.
 */
router.post(
  "/",
  protect,
  addMartCartItem
);


/* ============================================================
   CART COUNT
   Keep before /:id
============================================================ */

/**
 * GET /api/mart/cart/count
 *
 * Returns:
 * {
 *   uniqueItems,
 *   totalQuantity
 * }
 */
router.get(
  "/count",
  protect,
  getMartCartCount
);


/* ============================================================
   VALIDATE CART BEFORE CHECKOUT
============================================================ */

/**
 * POST /api/mart/cart/validate
 *
 * Checks:
 * - Store active
 * - Store open
 * - Store verified
 * - Store accepting orders
 * - Product active
 * - Product available
 * - Category active
 * - Variant active
 * - Variant available
 * - Current stock
 * - Current price
 * - Minimum order amount
 *
 * Use this before creating MartOrder.
 */
router.post(
  "/validate",
  protect,
  validateMartCart
);


/* ============================================================
   CLEAR COMPLETE CART
============================================================ */

/**
 * DELETE /api/mart/cart/clear
 *
 * Removes all KartoMart cart items
 * belonging to logged-in user.
 */
router.delete(
  "/clear",
  protect,
  clearMartCart
);


/* ============================================================
   GET CART ITEM BY VARIANT
============================================================ */

/**
 * GET /api/mart/cart/variant/:variantId
 *
 * Useful on product listing/detail screen.
 *
 * Example:
 * GET /api/mart/cart/variant/VARIANT_ID
 *
 * Returns whether this variant
 * already exists in user's cart.
 */
router.get(
  "/variant/:variantId",
  protect,
  getMartCartItemByVariant
);


/* ============================================================
   REMOVE CART ITEM BY VARIANT
============================================================ */

/**
 * DELETE /api/mart/cart/variant/:variantId
 *
 * Useful when frontend has variantId
 * instead of cartItemId.
 */
router.delete(
  "/variant/:variantId",
  protect,
  removeMartCartItemByVariant
);


/* ============================================================
   INCREMENT CART QUANTITY
============================================================ */

/**
 * PATCH /api/mart/cart/:id/increment
 *
 * Example:
 *
 * quantity:
 * 2 -> 3
 *
 * Stock is validated before increment.
 */
router.patch(
  "/:id/increment",
  protect,
  incrementMartCartItem
);


/* ============================================================
   DECREMENT CART QUANTITY
============================================================ */

/**
 * PATCH /api/mart/cart/:id/decrement
 *
 * Example:
 *
 * quantity:
 * 3 -> 2
 *
 * If quantity:
 * 1 -> 0
 *
 * Controller removes the item automatically.
 */
router.patch(
  "/:id/decrement",
  protect,
  decrementMartCartItem
);


/* ============================================================
   CHANGE PRODUCT VARIANT
============================================================ */

/**
 * PATCH /api/mart/cart/:id/variant
 *
 * Example:
 *
 * Tomato:
 * 500 G -> 1 KG
 *
 * Body:
 * {
 *   "variantId": "NEW_VARIANT_ID"
 * }
 *
 * Controller verifies:
 * - New variant belongs to same product
 * - Variant active
 * - Variant available
 * - Stock available
 *
 * If same new variant already exists in cart,
 * quantities are merged.
 */
router.patch(
  "/:id/variant",
  protect,
  changeMartCartVariant
);


/* ============================================================
   UPDATE CART ITEM
============================================================ */

/**
 * PATCH /api/mart/cart/:id
 *
 * Body:
 * {
 *   "quantity": 3,
 *   "note": "Optional note"
 * }
 *
 * Current variant price and stock
 * are validated again.
 */
router.patch(
  "/:id",
  protect,
  updateMartCartItem
);


/**
 * PUT /api/mart/cart/:id
 *
 * Same controller can also support PUT.
 */
router.put(
  "/:id",
  protect,
  updateMartCartItem
);


/* ============================================================
   REMOVE CART ITEM
============================================================ */

/**
 * DELETE /api/mart/cart/:id
 *
 * :id = MartCartItem.id
 */
router.delete(
  "/:id",
  protect,
  removeMartCartItem
);


export default router;