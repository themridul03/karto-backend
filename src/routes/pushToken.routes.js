import express from "express";

import {
  registerPushToken,
  unregisterPushToken,
  getMyPushTokens,
} from "../controllers/pushToken.controller.js";

/*
 * IMPORTANT:
 *
 * Replace this import with the same auth middleware
 * already used by your protected Karto routes.
 */
import {
  protect,
} from "../middleware/auth.middleware.js";

const router =
  express.Router();

/* =========================================
   REGISTER TOKEN
========================================= */

router.post(
  "/register",
  protect,
  registerPushToken
);

/* =========================================
   UNREGISTER TOKEN
========================================= */

router.post(
  "/unregister",
  protect,
  unregisterPushToken
);

/* =========================================
   MY TOKENS
========================================= */

router.get(
  "/me",
  protect,
  getMyPushTokens
);

export default router;