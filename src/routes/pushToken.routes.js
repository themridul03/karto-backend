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
  authenticate,
} from "../middlewares/auth.middleware.js";

const router =
  express.Router();

/* =========================================
   REGISTER TOKEN
========================================= */

router.post(
  "/register",
  authenticate,
  registerPushToken
);

/* =========================================
   UNREGISTER TOKEN
========================================= */

router.post(
  "/unregister",
  authenticate,
  unregisterPushToken
);

/* =========================================
   MY TOKENS
========================================= */

router.get(
  "/me",
  authenticate,
  getMyPushTokens
);

export default router;