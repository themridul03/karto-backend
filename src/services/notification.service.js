import prisma from "../prisma.js";

import {
  firebaseMessaging,
} from "../config/firebase.js";

/* =========================
   HELPERS
========================= */

const stringifyData = (data = {}) => {
  return Object.fromEntries(
    Object.entries(data || {}).map(
      ([key, value]) => [
        String(key),
        value === null ||
        value === undefined
          ? ""
          : String(value),
      ]
    )
  );
};

const isInvalidFirebaseTokenError = (
  error
) => {
  const code =
    error?.code ||
    error?.errorInfo?.code ||
    "";

  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument",
  ].includes(code);
};

const cleanText = (value) =>
  value === undefined ||
  value === null
    ? ""
    : String(value).trim();

const normalizeType = (
  value
) => {
  const type =
    cleanText(value)
      .toUpperCase();

  return type || "SYSTEM";
};

/* =========================
   PUSH CHANNEL RESOLVER
========================= */

const ANDROID_DEFAULT_CHANNEL =
  "karto_default";

const ANDROID_NEW_ORDER_CHANNEL =
  "karto_new_orders";

const ANDROID_DEFAULT_SOUND =
  "default";

const ANDROID_NEW_ORDER_SOUND =
  "new_order";

const normalizeUpper = (
  value
) =>
  cleanText(value)
    .toUpperCase();

const isVendorNewOrderPush = ({
  type,
  data = {},
}) => {
  const finalType =
    normalizeType(type);

  const event =
    normalizeUpper(
      data?.event
    );

  const notificationKind =
    normalizeUpper(
      data?.notificationKind
    );

  const target =
    normalizeUpper(
      data?.target
    );

  return (
    finalType === "ORDER" &&
    (
      event === "NEW_ORDER" ||
      notificationKind ===
        "VENDOR_NEW_ORDER"
    ) &&
    (
      !target ||
      target === "VENDOR"
    )
  );
};

const isRiderNewOrderPush = ({
  type,
  data = {},
}) => {
  const finalType =
    normalizeType(type);

  const event =
    normalizeUpper(
      data?.event
    );

  const notificationKind =
    normalizeUpper(
      data?.notificationKind
    );

  const target =
    normalizeUpper(
      data?.target
    );

  return (
    finalType === "ORDER" &&
    (
      event ===
        "NEW_RIDER_ORDER" ||
      event ===
        "NEW_ORDER_ASSIGNMENT" ||
      notificationKind ===
        "RIDER_NEW_ORDER"
    ) &&
    (
      !target ||
      target === "RIDER"
    )
  );
};

/*
 * SOUND FALLBACK:
 * 1) Recognized Vendor/Rider new-order push -> "new_order" on "karto_new_orders"
 * 2) Any other/specific type not matched -> supplied sound/channel if present
 * 3) If nothing specific is supplied -> Android "default" sound on "karto_default"
 */
const resolveAndroidPushConfig = ({
  type,
  data = {},
  androidChannelId,
  androidSound,
  androidVibrate,
}) => {
  const isNewOrderAlert =
    isVendorNewOrderPush({
      type,
      data,
    }) ||
    isRiderNewOrderPush({
      type,
      data,
    });

  /*
   * Vendor/Rider new-order alerts must always use
   * the high-importance native channel created by
   * MainApplication.kt and the bundled raw sound:
   *
   * android/app/src/main/res/raw/new_order.mp3
   *
   * Customer/general notifications continue to use
   * the normal/default channel unless a caller
   * explicitly supplies another override.
   */
  if (isNewOrderAlert) {
    return {
      channelId:
        ANDROID_NEW_ORDER_CHANNEL,

      sound:
        ANDROID_NEW_ORDER_SOUND,

      vibrate:
        true,

      isNewOrderAlert:
        true,
    };
  }

  return {
    channelId:
      cleanText(
        androidChannelId
      ) ||
      ANDROID_DEFAULT_CHANNEL,

    sound:
      cleanText(
        androidSound
      ) ||
      ANDROID_DEFAULT_SOUND,

    vibrate:
      androidVibrate !== false,

    isNewOrderAlert:
      false,
  };
};

const getActivePushTokens = async (
  userId
) => {
  return prisma.pushToken.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
      token: true,
      platform: true,
      deviceId: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
};

const deactivatePushTokens = async (
  tokens
) => {
  const normalized =
    [
      ...new Set(
        (tokens || [])
          .map((token) =>
            cleanText(token)
          )
          .filter(Boolean)
      ),
    ];

  if (!normalized.length) {
    return {
      count: 0,
    };
  }

  try {
    return await prisma.pushToken.updateMany({
      where: {
        token: {
          in: normalized,
        },
      },
      data: {
        isActive: false,
      },
    });
  } catch (error) {
    console.error(
      "Deactivate Push Tokens Error:",
      error
    );

    return {
      count: 0,
    };
  }
};

/* =========================
   SAVE NOTIFICATION
========================= */

export const saveNotification = async ({
  userId,
  type = "SYSTEM",
  title,
  body,
  data = {},
}) => {
  const finalUserId =
    cleanText(userId);

  const finalTitle =
    cleanText(title);

  const finalBody =
    cleanText(body);

  if (
    !finalUserId ||
    !finalTitle ||
    !finalBody
  ) {
    return null;
  }

  return prisma.notification.create({
    data: {
      userId:
        finalUserId,

      type:
        normalizeType(type),

      title:
        finalTitle,

      body:
        finalBody,

      data:
        data || {},

      isRead: false,

      readAt: null,
    },
  });
};

/* =========================
   PUSH TO ONE USER
========================= */

export const sendPushToUser = async ({
  userId,
  type = "SYSTEM",
  title,
  body,
  data = {},
  saveToDb = true,

  // Optional push overrides.
  // Existing callers can ignore these and will keep the default channel/sound.
  androidChannelId = ANDROID_DEFAULT_CHANNEL,
  androidSound = ANDROID_DEFAULT_SOUND,
  androidVibrate = true,
}) => {
  const finalUserId =
    cleanText(userId);

  const finalTitle =
    cleanText(title);

  const finalBody =
    cleanText(body);

  const finalType =
    normalizeType(type);


  const androidPushConfig =
    resolveAndroidPushConfig({
      type:
        finalType,

      data,

      androidChannelId,

      androidSound,

      androidVibrate,
    });

  if (
    !finalUserId ||
    !finalTitle ||
    !finalBody
  ) {
    return {
      success: false,
      message:
        "userId, title and body are required",
      notification: null,
      sent: 0,
      failed: 0,
      skipped: true,
    };
  }

  let notification = null;

  try {
    if (saveToDb) {
      notification =
        await saveNotification({
          userId:
            finalUserId,

          type:
            finalType,

          title:
            finalTitle,

          body:
            finalBody,

          data,
        });
    }

    const tokens =
      await getActivePushTokens(
        finalUserId
      );

    if (!tokens.length) {
      return {
        success: true,
        message:
          "Notification saved. No active push tokens found.",

        notification,

        sent: 0,
        failed: 0,
        skipped: true,
      };
    }

    if (!firebaseMessaging) {
      return {
        success: true,
        message:
          "Notification saved. Firebase push is not configured.",

        notification,

        sent: 0,
        failed: tokens.length,
        skipped: true,
      };
    }

    const payload = {
      notification: {
        title:
          finalTitle,

        body:
          finalBody,
      },

      data:
        stringifyData({
          ...data,

          notificationId:
            notification?.id ||
            "",

          type:
            finalType,
        }),

      tokens:
        tokens.map(
          (item) =>
            item.token
        ),

      android: {
        /*
         * High delivery priority wakes Android promptly.
         * Android 8+ visual/sound importance is controlled
         * by the notification channel itself.
         */
        priority: "high",

        notification: {
          /*
           * New Vendor/Rider orders:
           *   channelId = karto_new_orders
           *   sound     = new_order
           *
           * Other notifications:
           *   normal/default channel and sound.
           */
          sound:
            androidPushConfig.sound,

          channelId:
            androidPushConfig.channelId,

          defaultVibrateTimings:
            androidPushConfig.vibrate,

          visibility:
            "public",

          /*
           * Useful on Android 7.1 and below.
           * Android 8+ uses channel importance.
           */
          priority:
            androidPushConfig.isNewOrderAlert
              ? "max"
              : "high",
        },
      },

      apns: {
        headers: {
          "apns-priority":
            "10",
        },

        payload: {
          aps: {
            sound:
              "default",

            contentAvailable:
              true,
          },
        },
      },
    };

    const response =
      await firebaseMessaging.sendEachForMulticast(
        payload
      );

    const invalidTokens = [];

    response.responses.forEach(
      (result, index) => {
        if (
          result.success
        ) {
          return;
        }

        const failedToken =
          tokens[index]
            ?.token;

        const error =
          result.error;

        console.warn(
          "Push send failed:",
          error?.code ||
            error?.message ||
            "Unknown Firebase error"
        );

        if (
          failedToken &&
          isInvalidFirebaseTokenError(
            error
          )
        ) {
          invalidTokens.push(
            failedToken
          );
        }
      }
    );

    if (
      invalidTokens.length
    ) {
      await deactivatePushTokens(
        invalidTokens
      );
    }

    return {
      success:
        response.successCount >
        0,

      message:
        response.successCount >
        0
          ? "Push notification sent"
          : "Notification saved but push delivery failed",

      notification,

      sent:
        response.successCount,

      failed:
        response.failureCount,

      invalidTokensDisabled:
        invalidTokens.length,
    };
  } catch (error) {
    console.error(
      "Send Push To User Error:",
      error
    );

    return {
      success: false,

      message:
        error?.message ||
        "Unable to send notification",

      notification,

      sent: 0,
      failed: 0,
      error,
    };
  }
};

/* =========================
   PUSH TO MULTIPLE USERS
========================= */

export const sendPushToUsers = async ({
  userIds = [],
  type = "SYSTEM",
  title,
  body,
  data = {},
  saveToDb = true,
  androidChannelId = ANDROID_DEFAULT_CHANNEL,
  androidSound = ANDROID_DEFAULT_SOUND,
  androidVibrate = true,
}) => {
  const ids =
    [
      ...new Set(
        (userIds || [])
          .map((id) =>
            cleanText(id)
          )
          .filter(Boolean)
      ),
    ];

  if (!ids.length) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      saved: 0,
      message:
        "No users supplied",
    };
  }

  const results = [];

  for (const userId of ids) {
    results.push(
      await sendPushToUser({
        userId,
        type,
        title,
        body,
        data,
        saveToDb,
        androidChannelId,
        androidSound,
        androidVibrate,
      })
    );
  }

  return {
    success:
      results.some(
        (result) =>
          result.success
      ),

    users:
      results.length,

    sent:
      results.reduce(
        (sum, result) =>
          sum +
          Number(
            result.sent || 0
          ),
        0
      ),

    failed:
      results.reduce(
        (sum, result) =>
          sum +
          Number(
            result.failed || 0
          ),
        0
      ),

    saved:
      results.filter(
        (result) =>
          result.notification
      ).length,

    results,
  };
};

/* =========================
   NOTIFICATION TEMPLATES
========================= */

export const notificationTemplates = {
  ORDER_PLACED_VENDOR:
    (restaurantName) => ({
      title:
        "New order received 🛎️",

      body:
        `A fresh order just came in for ${restaurantName}. Please accept it quickly.`,
    }),

  ORDER_PLACED_CUSTOMER:
    () => ({
      title:
        "Order placed successfully 🎉",

      body:
        "Your order is received. The store will start preparing it soon.",
    }),

  ORDER_ACCEPTED_CUSTOMER:
    (restaurantName) => ({
      title:
        "Order accepted ✅",

      body:
        `${restaurantName} accepted your order. Fresh food is on the way soon.`,
    }),

  ORDER_PREPARING_CUSTOMER:
    () => ({
      title:
        "Your order is being prepared 👨‍🍳",

      body:
        "The store has started preparing your order with care.",
    }),

  ORDER_READY_VENDOR:
    () => ({
      title:
        "Order ready for pickup 📦",

      body:
        "Your order is ready. Waiting for rider pickup.",
    }),

  ORDER_ASSIGNED_RIDER:
    () => ({
      title:
        "New delivery assigned 🛵",

      body:
        "You have a new order to pick up. Please reach the store on time.",
    }),

  ORDER_OUT_FOR_DELIVERY_CUSTOMER:
    () => ({
      title:
        "Out for delivery 🛵",

      body:
        "Your order is on the way. Please keep your phone nearby.",
    }),

  ORDER_DELIVERED_CUSTOMER:
    () => ({
      title:
        "Order delivered 💚",

      body:
        "Hope you loved it. Thanks for choosing Karto.",
    }),

  ORDER_CANCELLED_CUSTOMER:
    () => ({
      title:
        "Order cancelled",

      body:
        "Your order has been cancelled. Any eligible refund will be processed soon.",
    }),

  RIDER_ASSIGNED_CUSTOMER:
    (
      riderName =
        "Your rider"
    ) => ({
      title:
        "Rider assigned 🛵",

      body:
        `${riderName} will pick up your order soon.`,
    }),

  PAYMENT_SUCCESS_CUSTOMER:
    () => ({
      title:
        "Payment successful ✅",

      body:
        "Your payment is confirmed. Your order is being processed.",
    }),

  PAYMENT_FAILED_CUSTOMER:
    () => ({
      title:
        "Payment failed",

      body:
        "Your payment could not be completed. Please try again.",
    }),

  REFUND_STARTED_CUSTOMER:
    () => ({
      title:
        "Refund initiated 💳",

      body:
        "Your refund request has been initiated. We will update you once it is completed.",
    }),

  REFUND_COMPLETED_CUSTOMER:
    () => ({
      title:
        "Refund completed ✅",

      body:
        "Your refund has been processed successfully.",
    }),

  RIDER_PICKED_ORDER_CUSTOMER:
    () => ({
      title:
        "Rider picked up your order 📦",

      body:
        "Your rider has collected the order from the store.",
    }),

  DELIVERY_OTP_CUSTOMER:
    (otp) => ({
      title:
        "Delivery OTP 🔐",

      body:
        `Your delivery OTP is ${otp}. Share it only with your Karto rider at delivery.`,
    }),

  VENDOR_VERIFIED:
    () => ({
      title:
        "Store verified ✅",

      body:
        "Your Karto store verification is complete.",
    }),

  VENDOR_REJECTED:
    () => ({
      title:
        "Store verification needs attention",

      body:
        "Your store verification was not approved. Please review the submitted details.",
    }),

  RIDER_VERIFIED:
    () => ({
      title:
        "Rider verification approved ✅",

      body:
        "Your Karto rider profile has been verified. You can start accepting deliveries.",
    }),

  RIDER_KYC_REJECTED:
    () => ({
      title:
        "KYC verification needs attention",

      body:
        "Your rider KYC was not approved. Please review and resubmit the required documents.",
    }),

  VENDOR_SETTLEMENT_PAID:
    (amount) => ({
      title:
        "Settlement paid 💰",

      body:
        `Your vendor settlement of ₹${amount} has been marked as paid.`,
    }),

  RIDER_SETTLEMENT_PAID:
    (amount) => ({
      title:
        "Rider payout completed 💰",

      body:
        `Your rider payout of ₹${amount} has been marked as paid.`,
    }),

  COUPON_RECEIVED:
    (code) => ({
      title:
        "New coupon received 🎁",

      body:
        `You received coupon ${code}. Open Karto to view the offer.`,
    }),

  SYSTEM:
    (
      title,
      body
    ) => ({
      title:
        title ||
        "KARTO",

      body:
        body ||
        "You have a new update from Karto.",
    }),
};

export default {
  saveNotification,
  sendPushToUser,
  sendPushToUsers,
  notificationTemplates,
};
