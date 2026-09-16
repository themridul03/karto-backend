import Razorpay from "razorpay";
import crypto from "crypto";
import prisma from "../prisma.js";

/* ============================================================
   RAZORPAY
============================================================ */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ============================================================
   HELPERS
============================================================ */

const toNumber = (value) => Number(value || 0);

const normalizeOrderType = (value) => {
  const type = String(value || "FOOD")
    .trim()
    .toUpperCase();

  return type;
};

const isValidOrderType = (value) =>
  ["FOOD", "MART"].includes(value);

/**
 * Find order belonging to current user.
 *
 * FOOD = existing normal restaurant Order
 * MART = KartoMart MartOrder
 */
const findUserOrder = async ({
  orderId,
  userId,
  orderType,
}) => {
  if (orderType === "MART") {
    return prisma.martOrder.findFirst({
      where: {
        id: orderId,
        userId,
      },
    });
  }

  return prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
    },
  });
};

/**
 * Find order by ID.
 *
 * Used during payment verification.
 */
const findOrderById = async ({
  orderId,
  orderType,
}) => {
  if (orderType === "MART") {
    return prisma.martOrder.findUnique({
      where: {
        id: orderId,
      },
    });
  }

  return prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });
};

/**
 * Update payment information.
 */
const updateOrderPayment = async ({
  orderId,
  orderType,
  paymentMethod,
  paymentStatus,
}) => {
  const data = {};

  if (paymentMethod !== undefined) {
    data.paymentMethod = paymentMethod;
  }

  if (paymentStatus !== undefined) {
    data.paymentStatus = paymentStatus;
  }

  if (orderType === "MART") {
    return prisma.martOrder.update({
      where: {
        id: orderId,
      },
      data,
    });
  }

  return prisma.order.update({
    where: {
      id: orderId,
    },
    data,
  });
};

/* ============================================================
   CREATE RAZORPAY PAYMENT ORDER

   FOOD:
   {
     "orderId": "ORDER_ID"
   }

   Existing FOOD frontend remains compatible because
   orderType defaults to FOOD.

   MART:
   {
     "orderId": "MART_ORDER_ID",
     "orderType": "MART"
   }
============================================================ */

export const createPaymentOrder = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      orderId,
      orderType: requestedOrderType,
    } = req.body;

    /* --------------------------------------------------------
       CONFIG VALIDATION
    -------------------------------------------------------- */

    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Payment gateway is not configured",
      });
    }

    /* --------------------------------------------------------
       AUTH VALIDATION
    -------------------------------------------------------- */

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /* --------------------------------------------------------
       ORDER ID
    -------------------------------------------------------- */

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order id is required",
      });
    }

    /* --------------------------------------------------------
       ORDER TYPE

       IMPORTANT:
       Default FOOD keeps old frontend working.
    -------------------------------------------------------- */

    const orderType =
      normalizeOrderType(requestedOrderType);

    if (!isValidOrderType(orderType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid orderType. Allowed values are FOOD or MART",
      });
    }

    /* --------------------------------------------------------
       FIND ORDER

       FOOD -> prisma.order
       MART -> prisma.martOrder
    -------------------------------------------------------- */

    const order = await findUserOrder({
      orderId,
      userId,
      orderType,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          orderType === "MART"
            ? "KartoMart order not found"
            : "Order not found",
      });
    }

    /* --------------------------------------------------------
       ONLINE PAYMENT ONLY
    -------------------------------------------------------- */

    if (order.paymentMethod !== "ONLINE") {
      return res.status(400).json({
        success: false,
        message:
          "Online payment is not enabled for this order",
      });
    }

    /* --------------------------------------------------------
       ALREADY PAID
    -------------------------------------------------------- */

    if (order.paymentStatus === "PAID") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    /* --------------------------------------------------------
       CANCELLED ORDER
    -------------------------------------------------------- */

    if (order.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message:
          "Payment cannot be created for a cancelled order",
      });
    }

    /* --------------------------------------------------------
       DELIVERED ORDER

       Prevent new online payment attempt after order has
       already completed.
    -------------------------------------------------------- */

    if (order.status === "DELIVERED") {
      return res.status(400).json({
        success: false,
        message:
          "Payment cannot be created for a delivered order",
      });
    }

    /* --------------------------------------------------------
       AMOUNT

       IMPORTANT:
       Amount always comes from DB.
       Never trust frontend amount.
    -------------------------------------------------------- */

    const amountInPaise = Math.round(
      toNumber(order.totalAmount) * 100
    );

    if (
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise < 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    /* --------------------------------------------------------
       RECEIPT

       Razorpay receipt has length restrictions.
       Keep it safe even if orderNumber becomes longer later.
    -------------------------------------------------------- */

    const receipt = String(
      order.orderNumber || order.id
    ).slice(0, 40);

    /* --------------------------------------------------------
       CREATE RAZORPAY ORDER
    -------------------------------------------------------- */

    const razorpayOrder =
      await razorpay.orders.create({
        amount: amountInPaise,

        currency: "INR",

        receipt,

        notes: {
          kartoOrderId: String(order.id),
          userId: String(userId),
          orderType,
        },
      });

    /* --------------------------------------------------------
       RESPONSE

       Existing fields preserved.
       orderType added.
    -------------------------------------------------------- */

    return res.json({
      success: true,

      message:
        "Payment order created successfully",

      key:
        process.env.RAZORPAY_KEY_ID,

      razorpayOrderId:
        razorpayOrder.id,

      amount:
        razorpayOrder.amount,

      currency:
        razorpayOrder.currency,

      kartoOrderId:
        order.id,

      orderNumber:
        order.orderNumber,

      orderType,
    });
  } catch (error) {
    console.error(
      "Create Payment Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Payment order create failed",
    });
  }
};

/* ============================================================
   VERIFY RAZORPAY PAYMENT

   FOOD existing request:

   {
     "kartoOrderId": "...",
     "razorpay_order_id": "...",
     "razorpay_payment_id": "...",
     "razorpay_signature": "..."
   }

   MART:

   {
     "kartoOrderId": "...",
     "razorpay_order_id": "...",
     "razorpay_payment_id": "...",
     "razorpay_signature": "...",
     "orderType": "MART"
   }
============================================================ */

export const verifyPayment = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      kartoOrderId,

      razorpay_order_id,

      razorpay_payment_id,

      razorpay_signature,

      orderType: requestedOrderType,
    } = req.body;

    /* --------------------------------------------------------
       CONFIG
    -------------------------------------------------------- */

    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Payment gateway is not configured",
      });
    }

    /* --------------------------------------------------------
       AUTH
    -------------------------------------------------------- */

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /* --------------------------------------------------------
       REQUIRED PAYMENT DETAILS
    -------------------------------------------------------- */

    if (
      !kartoOrderId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment details missing",
      });
    }

    /* --------------------------------------------------------
       ORDER TYPE
    -------------------------------------------------------- */

    const orderType =
      normalizeOrderType(requestedOrderType);

    if (!isValidOrderType(orderType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid orderType. Allowed values are FOOD or MART",
      });
    }

    /* --------------------------------------------------------
       FIND ORDER
    -------------------------------------------------------- */

    const existingOrder =
      await findOrderById({
        orderId: kartoOrderId,
        orderType,
      });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message:
          orderType === "MART"
            ? "KartoMart order not found"
            : "Order not found",
      });
    }

    /* --------------------------------------------------------
       OWNERSHIP
    -------------------------------------------------------- */

    if (existingOrder.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized payment",
      });
    }

    /* --------------------------------------------------------
       PAYMENT METHOD
    -------------------------------------------------------- */

    if (
      existingOrder.paymentMethod !==
      "ONLINE"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Online payment is not enabled for this order",
      });
    }

    /* --------------------------------------------------------
       ALREADY PAID

       Makes endpoint safer against repeated frontend calls.
    -------------------------------------------------------- */

    if (
      existingOrder.paymentStatus ===
      "PAID"
    ) {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    /* --------------------------------------------------------
       CANCELLED
    -------------------------------------------------------- */

    if (
      existingOrder.status ===
      "CANCELLED"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment cannot be verified for a cancelled order",
      });
    }

    /* --------------------------------------------------------
       SIGNATURE

       Razorpay standard signature:
       HMAC_SHA256(
          razorpay_order_id + "|" + razorpay_payment_id,
          key_secret
       )
    -------------------------------------------------------- */

    const body =
      `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(body)
        .digest("hex");

    /* --------------------------------------------------------
       TIMING-SAFE SIGNATURE COMPARISON
    -------------------------------------------------------- */

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "utf8"
      );

    const receivedBuffer =
      Buffer.from(
        String(razorpay_signature),
        "utf8"
      );

    const signatureValid =
      expectedBuffer.length ===
        receivedBuffer.length &&
      crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      );

    /* --------------------------------------------------------
       INVALID SIGNATURE
    -------------------------------------------------------- */

    if (!signatureValid) {
      await updateOrderPayment({
        orderId: kartoOrderId,

        orderType,

        paymentMethod: "ONLINE",

        paymentStatus: "FAILED",
      });

      return res.status(400).json({
        success: false,
        message:
          "Invalid payment signature",
      });
    }

    /* --------------------------------------------------------
       OPTIONAL BUT IMPORTANT:
       VERIFY PAYMENT WITH RAZORPAY

       Signature proves response authenticity.
       Fetching payment lets server additionally confirm
       Razorpay payment state/order/amount.
    -------------------------------------------------------- */

    let razorpayPayment;

    try {
      razorpayPayment =
        await razorpay.payments.fetch(
          razorpay_payment_id
        );
    } catch (paymentFetchError) {
      console.error(
        "Razorpay Payment Fetch Error:",
        paymentFetchError
      );

      return res.status(400).json({
        success: false,
        message:
          "Unable to confirm payment with payment gateway",
      });
    }

    /* --------------------------------------------------------
       VERIFY RAZORPAY ORDER ID
    -------------------------------------------------------- */

    if (
      razorpayPayment.order_id !==
      razorpay_order_id
    ) {
      await updateOrderPayment({
        orderId: kartoOrderId,

        orderType,

        paymentMethod: "ONLINE",

        paymentStatus: "FAILED",
      });

      return res.status(400).json({
        success: false,
        message:
          "Payment order verification failed",
      });
    }

    /* --------------------------------------------------------
       VERIFY AMOUNT

       Prevent successful payment for wrong amount.
    -------------------------------------------------------- */

    const expectedAmount =
      Math.round(
        toNumber(
          existingOrder.totalAmount
        ) * 100
      );

    if (
      Number(razorpayPayment.amount) !==
      expectedAmount
    ) {
      await updateOrderPayment({
        orderId: kartoOrderId,

        orderType,

        paymentMethod: "ONLINE",

        paymentStatus: "FAILED",
      });

      return res.status(400).json({
        success: false,
        message:
          "Payment amount verification failed",
      });
    }

    /* --------------------------------------------------------
       VERIFY CURRENCY
    -------------------------------------------------------- */

    if (
      String(
        razorpayPayment.currency
      ).toUpperCase() !== "INR"
    ) {
      await updateOrderPayment({
        orderId: kartoOrderId,

        orderType,

        paymentMethod: "ONLINE",

        paymentStatus: "FAILED",
      });

      return res.status(400).json({
        success: false,
        message:
          "Invalid payment currency",
      });
    }

    /* --------------------------------------------------------
       PAYMENT STATE

       Razorpay payment should normally be captured.

       Depending on your Razorpay account configuration,
       an authorized payment may require capture.
    -------------------------------------------------------- */

    if (
      !["captured", "authorized"].includes(
        String(
          razorpayPayment.status
        ).toLowerCase()
      )
    ) {
      await updateOrderPayment({
        orderId: kartoOrderId,

        orderType,

        paymentMethod: "ONLINE",

        paymentStatus: "FAILED",
      });

      return res.status(400).json({
        success: false,
        message:
          "Payment is not successful",
      });
    }

    /* --------------------------------------------------------
       CAPTURE AUTHORIZED PAYMENT

       If Razorpay auto-capture is enabled this normally
       won't execute because payment is already captured.
    -------------------------------------------------------- */

    if (
      String(
        razorpayPayment.status
      ).toLowerCase() ===
      "authorized"
    ) {
      try {
        razorpayPayment =
          await razorpay.payments.capture(
            razorpay_payment_id,
            expectedAmount,
            "INR"
          );
      } catch (captureError) {
        console.error(
          "Razorpay Payment Capture Error:",
          captureError
        );

        return res.status(400).json({
          success: false,
          message:
            "Payment authorization succeeded but capture failed",
        });
      }

      if (
        String(
          razorpayPayment.status
        ).toLowerCase() !==
        "captured"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment could not be captured",
        });
      }
    }

    /* --------------------------------------------------------
       FINAL UPDATE

       FOOD -> Order
       MART -> MartOrder
    -------------------------------------------------------- */

    const updatedOrder =
      await updateOrderPayment({
        orderId: kartoOrderId,

        orderType,

        paymentMethod: "ONLINE",

        paymentStatus: "PAID",
      });

    /* --------------------------------------------------------
       RESPONSE

       Existing response structure preserved.
    -------------------------------------------------------- */

    return res.json({
      success: true,

      message:
        "Payment verified successfully",

      data:
        updatedOrder,

      order:
        updatedOrder,

      orderType,

      payment: {
        razorpayOrderId:
          razorpay_order_id,

        razorpayPaymentId:
          razorpay_payment_id,

        status:
          razorpayPayment.status,
      },
    });
  } catch (error) {
    console.error(
      "Verify Payment Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Payment verification failed",
    });
  }
};