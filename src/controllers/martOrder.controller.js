import prisma from "../prisma.js";
import crypto from "crypto";

/* ============================================================
   KARTOMART ORDER CONTROLLER

   KartoMart:
   - Managed directly by Karto/Admin
   - No restaurant vendor dependency
   - No vendor commission calculation
   - Order prices are calculated server-side
   - Stock is reduced atomically during order creation
   - Cart is cleared only after successful order creation
   - Order items keep product/variant snapshots

   PAYMENT:
   - COD -> PENDING while order is active
   - COD -> PAID automatically on DELIVERED
   - ONLINE -> PENDING when order is created
   - ONLINE -> PAID only through Razorpay verifyPayment
   - ONLINE cannot be DELIVERED unless PAID
============================================================ */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/* ============================================================
   PAYMENT METHODS
============================================================ */

const PAYMENT_METHODS = new Set([
  "COD",
  "ONLINE",
]);

/* ============================================================
   PAYMENT STATUSES
============================================================ */

const PAYMENT_STATUSES = new Set([
  "PENDING",
  "PAID",
  "FAILED",
]);

/* ============================================================
   CANCELLABLE ORDER STATUSES
============================================================ */

const CANCELLABLE_STATUSES = new Set([
  "PLACED",
  "ACCEPTED",
  "PACKING",
]);

/* ============================================================
   ORDER STATUS TRANSITIONS
============================================================ */

const STATUS_TRANSITIONS = {
  PLACED: [
    "ACCEPTED",
    "CANCELLED",
  ],

  ACCEPTED: [
    "PACKING",
    "CANCELLED",
  ],

  PACKING: [
    "READY",
    "CANCELLED",
  ],

  READY: [
    "PICKED",
  ],

  PICKED: [
    "DELIVERED",
  ],

  DELIVERED: [],

  CANCELLED: [],
};

/* ============================================================
   HELPERS
============================================================ */

const cleanString = (value) => {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return String(value).trim();
};

const getUserId = (req) =>
  req.user?.id ||
  req.user?.userId ||
  req.user?.pkid ||
  null;

const getActorId = (req) =>
  req.user?.id ||
  req.user?.userId ||
  req.user?.pkid ||
  null;

const sendError = (
  res,
  status,
  message,
  errors = undefined
) =>
  res.status(status).json({
    success: false,
    message,

    ...(errors
      ? {
          errors,
        }
      : {}),
  });

const toNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

const money = (value) =>
  Number(
    toNumber(value).toFixed(2)
  );

const parsePositiveInteger = (
  value,
  fallback
) => {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  return (
    Number.isInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : fallback;
};

/* ============================================================
   ORDER NUMBER

   Example:
   KM-260916-143012-A8F3
============================================================ */

const generateOrderNumber = () => {
  const now = new Date();

  const yy =
    String(
      now.getFullYear()
    ).slice(-2);

  const mm =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const dd =
    String(
      now.getDate()
    ).padStart(2, "0");

  const hh =
    String(
      now.getHours()
    ).padStart(2, "0");

  const mi =
    String(
      now.getMinutes()
    ).padStart(2, "0");

  const ss =
    String(
      now.getSeconds()
    ).padStart(2, "0");

  const random =
    crypto
      .randomBytes(2)
      .toString("hex")
      .toUpperCase();

  return (
    `KM-${yy}${mm}${dd}-` +
    `${hh}${mi}${ss}-${random}`
  );
};

/* ============================================================
   ORDER INCLUDE
============================================================ */

const orderInclude = {
  store: {
    select: {
      id: true,
      cityId: true,
      name: true,
      description: true,
      imageUrl: true,
      bannerUrl: true,
      address: true,
      phone: true,

      minimumOrderAmount: true,
      deliveryFee: true,
      freeDeliveryAbove: true,
      platformFee: true,

      isActive: true,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,
    },
  },

  items: {
    orderBy: {
      createdAt: "asc",
    },
  },

  history: {
    orderBy: {
      createdAt: "asc",
    },
  },
};

/* ============================================================
   ERROR HANDLER
============================================================ */

const handleOrderError = (
  res,
  error,
  action = "process"
) => {
  console.error(
    `KartoMart Order ${action} Error:`,
    error
  );

  if (
    error?.code === "P2002"
  ) {
    return sendError(
      res,
      409,
      "Duplicate KartoMart order"
    );
  }

  if (
    error?.code === "P2003"
  ) {
    return sendError(
      res,
      400,
      "Invalid related record"
    );
  }

  if (
    error?.code === "P2025"
  ) {
    return sendError(
      res,
      404,
      "KartoMart order not found"
    );
  }

  return sendError(
    res,
    500,
    process.env.NODE_ENV ===
      "production"
      ? `Unable to ${action} KartoMart order`
      : error?.message ||
          `Unable to ${action} KartoMart order`
  );
};

/* ============================================================
   CREATE MART ORDER
============================================================ */

export const createMartOrder =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return sendError(
          res,
          401,
          "Authentication required"
        );
      }

      const {
        addressId,
        paymentMethod = "COD",
        customerNote,
        distanceKm,
      } = req.body;

      /* ======================================================
         PAYMENT METHOD
      ====================================================== */

      const normalizedPaymentMethod =
        String(paymentMethod)
          .trim()
          .toUpperCase();

      if (
        !PAYMENT_METHODS.has(
          normalizedPaymentMethod
        )
      ) {
        return sendError(
          res,
          400,
          "Invalid payment method"
        );
      }

      /* ======================================================
         GET CART
      ====================================================== */

      const cartItems =
        await prisma.martCartItem.findMany({
          where: {
            userId,
          },

          include: {
            store: true,

            product: {
              include: {
                category: true,
              },
            },

            variant: true,
          },

          orderBy: {
            createdAt: "asc",
          },
        });

      if (
        !cartItems.length
      ) {
        return sendError(
          res,
          400,
          "KartoMart cart is empty"
        );
      }

      /* ======================================================
         SINGLE STORE CHECK
      ====================================================== */

      const storeIds = [
        ...new Set(
          cartItems.map(
            (item) =>
              item.storeId
          )
        ),
      ];

      if (
        storeIds.length !== 1
      ) {
        return sendError(
          res,
          409,
          "Cart contains products from multiple KartoMart stores"
        );
      }

      const store =
        cartItems[0].store;

      /* ======================================================
         STORE VALIDATION
      ====================================================== */

      if (
        !store ||
        store.deletedAt
      ) {
        return sendError(
          res,
          404,
          "KartoMart store not found"
        );
      }

      if (
        !store.isActive
      ) {
        return sendError(
          res,
          409,
          "KartoMart store is inactive"
        );
      }

      if (
        !store.isVerified
      ) {
        return sendError(
          res,
          409,
          "KartoMart store is not verified"
        );
      }

      if (
        !store.isOpen
      ) {
        return sendError(
          res,
          409,
          "KartoMart store is currently closed"
        );
      }

      if (
        !store.isAcceptingOrders
      ) {
        return sendError(
          res,
          409,
          "KartoMart store is currently not accepting orders"
        );
      }

      /* ======================================================
         VALIDATE PRODUCTS + CALCULATE TOTAL
      ====================================================== */

      let itemTotal = 0;

      const snapshots = [];

      for (
        const item of
        cartItems
      ) {
        const product =
          item.product;

        const variant =
          item.variant;

        /* ----------------------------------------------------
           PRODUCT
        ---------------------------------------------------- */

        if (
          !product ||
          product.deletedAt
        ) {
          return sendError(
            res,
            409,
            "One or more products are no longer available"
          );
        }

        if (
          !product.isActive ||
          !product.isAvailable
        ) {
          return sendError(
            res,
            409,
            `${product.name} is currently unavailable`
          );
        }

        if (
          product.storeId !==
          store.id
        ) {
          return sendError(
            res,
            409,
            `${product.name} does not belong to this store`
          );
        }

        /* ----------------------------------------------------
           CATEGORY
        ---------------------------------------------------- */

        if (
          product.category &&
          (
            product.category
              .deletedAt ||
            !product.category
              .isActive
          )
        ) {
          return sendError(
            res,
            409,
            `${product.name}'s category is currently unavailable`
          );
        }

        /* ----------------------------------------------------
           VARIANT
        ---------------------------------------------------- */

        if (
          !variant ||
          variant.deletedAt
        ) {
          return sendError(
            res,
            409,
            `${product.name} variant is unavailable`
          );
        }

        if (
          variant.productId !==
          product.id
        ) {
          return sendError(
            res,
            409,
            `Invalid variant for ${product.name}`
          );
        }

        if (
          !variant.isActive ||
          !variant.isAvailable
        ) {
          return sendError(
            res,
            409,
            `${product.name} ${variant.label} is currently unavailable`
          );
        }

        /* ----------------------------------------------------
           STOCK
        ---------------------------------------------------- */

        if (
          item.quantity >
          variant.stock
        ) {
          return sendError(
            res,
            409,
            `Only ${variant.stock} unit(s) of ${product.name} ${variant.label} are available`
          );
        }

        /* ----------------------------------------------------
           PRICE

           Never use cart's old price for checkout.
           Always use current variant DB price.
        ---------------------------------------------------- */

        const currentPrice =
          money(
            variant.price
          );

        const currentMrp =
          money(
            variant.mrp
          );

        const lineTotal =
          money(
            currentPrice *
              item.quantity
          );

        itemTotal +=
          lineTotal;

        /* ----------------------------------------------------
           SNAPSHOT
        ---------------------------------------------------- */

        snapshots.push({
          productId:
            product.id,

          variantId:
            variant.id,

          itemName:
            product.name,

          variantLabel:
            variant.label ||
            null,

          quantity:
            item.quantity,

          price:
            currentPrice,

          mrp:
            currentMrp,

          totalPrice:
            lineTotal,

          imageUrl:
            product.imageUrl ||
            null,
        });
      }

      itemTotal =
        money(itemTotal);

      /* ======================================================
         MINIMUM ORDER
      ====================================================== */

      const minimumOrderAmount =
        money(
          store.minimumOrderAmount
        );

      if (
        itemTotal <
        minimumOrderAmount
      ) {
        const remaining =
          money(
            minimumOrderAmount -
              itemTotal
          );

        return sendError(
          res,
          409,
          `Add ₹${remaining.toFixed(
            2
          )} more to place this order`
        );
      }

      /* ======================================================
         DELIVERY FEE
      ====================================================== */

      let deliveryFee =
        money(
          store.deliveryFee
        );

      if (
        store.freeDeliveryAbove !==
          null &&
        store.freeDeliveryAbove !==
          undefined
      ) {
        const freeDeliveryAbove =
          money(
            store.freeDeliveryAbove
          );

        if (
          itemTotal >=
          freeDeliveryAbove
        ) {
          deliveryFee = 0;
        }
      }

      /* ======================================================
         PLATFORM FEE
      ====================================================== */

      const platformFee =
        money(
          store.platformFee
        );

      /* ======================================================
         DISCOUNT / TAX

         Currently 0.
         Coupon/tax system can be connected later.
      ====================================================== */

      const discount = 0;
      const taxAmount = 0;

      /* ======================================================
         TOTAL
      ====================================================== */

      const totalAmount =
        money(
          itemTotal +
            deliveryFee +
            platformFee +
            taxAmount -
            discount
        );

      /* ======================================================
         DISTANCE
      ====================================================== */

      let finalDistanceKm =
        null;

      if (
        distanceKm !==
          undefined &&
        distanceKm !== null &&
        distanceKm !== ""
      ) {
        const parsedDistance =
          Number(
            distanceKm
          );

        if (
          !Number.isFinite(
            parsedDistance
          ) ||
          parsedDistance < 0
        ) {
          return sendError(
            res,
            400,
            "distanceKm must be a valid non-negative number"
          );
        }

        finalDistanceKm =
          Number(
            parsedDistance.toFixed(
              2
            )
          );
      }

      /* ======================================================
         DATABASE TRANSACTION
      ====================================================== */

      const order =
        await prisma.$transaction(
          async (tx) => {
            /* =================================================
               ATOMIC STOCK DEDUCTION
            ================================================= */

            for (
              const snapshot of
              snapshots
            ) {
              const updated =
                await tx
                  .martProductVariant
                  .updateMany({
                    where: {
                      id:
                        snapshot
                          .variantId,

                      productId:
                        snapshot
                          .productId,

                      deletedAt:
                        null,

                      isActive:
                        true,

                      isAvailable:
                        true,

                      stock: {
                        gte:
                          snapshot
                            .quantity,
                      },
                    },

                    data: {
                      stock: {
                        decrement:
                          snapshot
                            .quantity,
                      },
                    },
                  });

              if (
                updated.count !==
                1
              ) {
                const error =
                  new Error(
                    `Insufficient stock for ${snapshot.itemName} ${snapshot.variantLabel || ""}`
                  );

                error.code =
                  "MART_STOCK_CONFLICT";

                throw error;
              }
            }

            /* =================================================
               ORDER NUMBER
            ================================================= */

            let orderNumber =
              generateOrderNumber();

            const duplicate =
              await tx.martOrder
                .findUnique({
                  where: {
                    orderNumber,
                  },

                  select: {
                    id: true,
                  },
                });

            if (duplicate) {
              orderNumber =
                generateOrderNumber();
            }

            /* =================================================
               CREATE ORDER

               IMPORTANT:

               COD:
               paymentStatus = PENDING

               ONLINE:
               paymentStatus = PENDING

               ONLINE becomes PAID only after
               Razorpay verifyPayment().
            ================================================= */

            const createdOrder =
              await tx.martOrder.create({
                data: {
                  userId,

                  storeId:
                    store.id,

                  /*
                     KartoMart is managed
                     directly by Karto.
                  */

                  vendorId:
                    null,

                  riderId:
                    null,

                  addressId:
                    cleanString(
                      addressId
                    ) || null,

                  orderNumber,

                  itemTotal,

                  deliveryFee,

                  discount,

                  taxAmount,

                  platformFee,

                  totalAmount,

                  paymentMethod:
                    normalizedPaymentMethod,

                  paymentStatus:
                    "PENDING",

                  status:
                    "PLACED",

                  customerNote:
                    cleanString(
                      customerNote
                    ) || null,

                  distanceKm:
                    finalDistanceKm,

                  /*
                     No restaurant vendor
                     commission calculation
                     for KartoMart.
                  */

                  commissionableAmount:
                    null,

                  commissionRate:
                    null,

                  platformCommissionAmount:
                    null,

                  vendorSettlementAmount:
                    null,

                  /* ===========================================
                     ORDER ITEMS
                  =========================================== */

                  items: {
                    create:
                      snapshots.map(
                        (
                          snapshot
                        ) => ({
                          productId:
                            snapshot
                              .productId,

                          variantId:
                            snapshot
                              .variantId,

                          itemName:
                            snapshot
                              .itemName,

                          variantLabel:
                            snapshot
                              .variantLabel,

                          quantity:
                            snapshot
                              .quantity,

                          price:
                            snapshot
                              .price,

                          mrp:
                            snapshot
                              .mrp,

                          totalPrice:
                            snapshot
                              .totalPrice,

                          imageUrl:
                            snapshot
                              .imageUrl,
                        })
                      ),
                  },

                  /* ===========================================
                     INITIAL STATUS HISTORY
                  =========================================== */

                  history: {
                    create: {
                      status:
                        "PLACED",

                      changedBy:
                        userId,

                      note:
                        "KartoMart order placed",
                    },
                  },
                },
              });

            /* =================================================
               STOCK MOVEMENT
            ================================================= */

            for (
              const snapshot of
              snapshots
            ) {
              const variant =
                await tx
                  .martProductVariant
                  .findUnique({
                    where: {
                      id:
                        snapshot
                          .variantId,
                    },

                    select: {
                      stock: true,
                    },
                  });

              await tx
                .martStockMovement
                .create({
                  data: {
                    variantId:
                      snapshot
                        .variantId,

                    productId:
                      snapshot
                        .productId,

                    type:
                      "SALE",

                    quantity:
                      -snapshot
                        .quantity,

                    stockAfter:
                      variant.stock,

                    referenceId:
                      createdOrder.id,

                    note:
                      `KartoMart order ${orderNumber}`,

                    createdBy:
                      userId,
                  },
                });
            }

            /* =================================================
               CLEAR CART

               Only happens if complete transaction succeeds.
            ================================================= */

            await tx
              .martCartItem
              .deleteMany({
                where: {
                  userId,

                  storeId:
                    store.id,
                },
              });

            /* =================================================
               RETURN ORDER
            ================================================= */

            return tx.martOrder
              .findUnique({
                where: {
                  id:
                    createdOrder.id,
                },

                include:
                  orderInclude,
              });
          }
        );

      /* ======================================================
         RESPONSE

         paymentRequired lets mobile app know whether
         Razorpay should open.
      ====================================================== */

      const paymentRequired =
        normalizedPaymentMethod ===
        "ONLINE";

      return res
        .status(201)
        .json({
          success: true,

          message:
            "KartoMart order placed successfully",

          paymentRequired,

          paymentMethod:
            order.paymentMethod,

          paymentStatus:
            order.paymentStatus,

          order,

          data:
            order,
        });
    } catch (error) {
      if (
        error?.code ===
        "MART_STOCK_CONFLICT"
      ) {
        return sendError(
          res,
          409,
          error.message
        );
      }

      return handleOrderError(
        res,
        error,
        "create"
      );
    }
  };

/* ============================================================
   GET MY MART ORDERS
============================================================ */

export const getMyMartOrders =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return sendError(
          res,
          401,
          "Authentication required"
        );
      }

      const page =
        parsePositiveInteger(
          req.query.page,
          DEFAULT_PAGE
        );

      const limit =
        Math.min(
          parsePositiveInteger(
            req.query.limit,
            DEFAULT_LIMIT
          ),
          MAX_LIMIT
        );

      const skip =
        (page - 1) *
        limit;

      const where = {
        userId,
      };

      /* ======================================================
         STATUS FILTER
      ====================================================== */

      if (
        req.query.status &&
        req.query.status !==
          "ALL"
      ) {
        where.status =
          String(
            req.query.status
          )
            .trim()
            .toUpperCase();
      }

      /* ======================================================
         PAYMENT FILTER
      ====================================================== */

      if (
        req.query
          .paymentStatus &&
        req.query
          .paymentStatus !==
          "ALL"
      ) {
        where.paymentStatus =
          String(
            req.query
              .paymentStatus
          )
            .trim()
            .toUpperCase();
      }

      /* ======================================================
         QUERY
      ====================================================== */

      const [
        orders,
        total,
      ] =
        await prisma.$transaction([
          prisma.martOrder
            .findMany({
              where,

              include: {
                store: {
                  select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                    address: true,
                  },
                },

                items: true,
              },

              skip,

              take:
                limit,

              orderBy: {
                createdAt:
                  "desc",
              },
            }),

          prisma.martOrder
            .count({
              where,
            }),
        ]);

      const totalPages =
        Math.ceil(
          total / limit
        );

      return res.json({
        success: true,

        orders,

        data:
          orders,

        pagination: {
          page,

          limit,

          total,

          totalPages,

          hasNextPage:
            page <
            totalPages,

          hasPreviousPage:
            page > 1,
        },
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "fetch"
      );
    }
  };

/* ============================================================
   GET MY MART ORDER BY ID
============================================================ */

export const getMyMartOrderById =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return sendError(
          res,
          401,
          "Authentication required"
        );
      }

      const id =
        cleanString(
          req.params.id
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      const order =
        await prisma.martOrder
          .findFirst({
            where: {
              id,
              userId,
            },

            include:
              orderInclude,
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      return res.json({
        success: true,

        order,

        data:
          order,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "fetch"
      );
    }
  };

/* ============================================================
   GET MY ORDER BY ORDER NUMBER
============================================================ */

export const getMyMartOrderByNumber =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return sendError(
          res,
          401,
          "Authentication required"
        );
      }

      const orderNumber =
        cleanString(
          req.params
            .orderNumber
        );

      if (!orderNumber) {
        return sendError(
          res,
          400,
          "Order number is required"
        );
      }

      const order =
        await prisma.martOrder
          .findFirst({
            where: {
              orderNumber,
              userId,
            },

            include:
              orderInclude,
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      return res.json({
        success: true,

        order,

        data:
          order,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "fetch"
      );
    }
  };

/* ============================================================
   CANCEL MY MART ORDER
============================================================ */

export const cancelMyMartOrder =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return sendError(
          res,
          401,
          "Authentication required"
        );
      }

      const id =
        cleanString(
          req.params.id
        );

      const reason =
        cleanString(
          req.body.reason
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      if (!reason) {
        return sendError(
          res,
          400,
          "Cancellation reason is required"
        );
      }

      /* ======================================================
         CHECK ORDER BEFORE TRANSACTION

         IMPORTANT:
         A PAID ONLINE order requires actual Razorpay
         refund handling.

         Since MartOrder currently does not persist the
         Razorpay payment id separately, don't pretend
         a refund happened.

         This protects customer money.
      ====================================================== */

      const existingOrder =
        await prisma.martOrder
          .findFirst({
            where: {
              id,
              userId,
            },

            select: {
              id: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
            },
          });

      if (!existingOrder) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      if (
        existingOrder
          .paymentMethod ===
          "ONLINE" &&
        existingOrder
          .paymentStatus ===
          "PAID"
      ) {
        return sendError(
          res,
          409,
          "This online order is already paid. Refund processing is required before cancellation."
        );
      }

      /* ======================================================
         CANCEL TRANSACTION
      ====================================================== */

      const result =
        await prisma.$transaction(
          async (tx) => {
            const order =
              await tx.martOrder
                .findFirst({
                  where: {
                    id,
                    userId,
                  },

                  include: {
                    items:
                      true,
                  },
                });

            if (!order) {
              const error =
                new Error(
                  "KartoMart order not found"
                );

              error.code =
                "ORDER_NOT_FOUND";

              throw error;
            }

            /* =================================================
               STATUS VALIDATION
            ================================================= */

            if (
              !CANCELLABLE_STATUSES.has(
                order.status
              )
            ) {
              const error =
                new Error(
                  `Order cannot be cancelled in ${order.status} status`
                );

              error.code =
                "ORDER_NOT_CANCELLABLE";

              throw error;
            }

            /* =================================================
               RESTORE STOCK
            ================================================= */

            for (
              const item of
              order.items
            ) {
              if (
                !item.variantId
              ) {
                continue;
              }

              const variant =
                await tx
                  .martProductVariant
                  .findUnique({
                    where: {
                      id:
                        item.variantId,
                    },

                    select: {
                      id: true,
                      productId:
                        true,
                    },
                  });

              /*
                 Variant may have been
                 permanently removed later.
              */

              if (!variant) {
                continue;
              }

              const updatedVariant =
                await tx
                  .martProductVariant
                  .update({
                    where: {
                      id:
                        variant.id,
                    },

                    data: {
                      stock: {
                        increment:
                          item.quantity,
                      },
                    },

                    select: {
                      stock:
                        true,
                    },
                  });

              /* ===============================================
                 STOCK MOVEMENT
              =============================================== */

              await tx
                .martStockMovement
                .create({
                  data: {
                    variantId:
                      variant.id,

                    productId:
                      variant
                        .productId,

                    type:
                      "RETURN",

                    quantity:
                      item.quantity,

                    stockAfter:
                      updatedVariant
                        .stock,

                    referenceId:
                      order.id,

                    note:
                      `Stock restored after cancellation of ${order.orderNumber}`,

                    createdBy:
                      userId,
                  },
                });
            }

            /* =================================================
               UPDATE ORDER
            ================================================= */

            const updatedOrder =
              await tx.martOrder
                .update({
                  where: {
                    id:
                      order.id,
                  },

                  data: {
                    status:
                      "CANCELLED",

                    cancelledAt:
                      new Date(),

                    cancelReason:
                      reason,

                    cancelledBy:
                      userId,

                    /*
                       PENDING online payment should no
                       longer remain payable after cancel.
                    */

                    ...(
                      order.paymentMethod ===
                        "ONLINE" &&
                      order.paymentStatus !==
                        "PAID"
                        ? {
                            paymentStatus:
                              "FAILED",
                          }
                        : {}
                    ),

                    history: {
                      create: {
                        status:
                          "CANCELLED",

                        changedBy:
                          userId,

                        note:
                          reason,
                      },
                    },
                  },

                  include:
                    orderInclude,
                });

            return updatedOrder;
          }
        );

      return res.json({
        success: true,

        message:
          "KartoMart order cancelled successfully",

        order:
          result,

        data:
          result,
      });
    } catch (error) {
      if (
        error?.code ===
        "ORDER_NOT_FOUND"
      ) {
        return sendError(
          res,
          404,
          error.message
        );
      }

      if (
        error?.code ===
        "ORDER_NOT_CANCELLABLE"
      ) {
        return sendError(
          res,
          409,
          error.message
        );
      }

      return handleOrderError(
        res,
        error,
        "cancel"
      );
    }
  };

/* ============================================================
   ADMIN - GET ALL MART ORDERS
============================================================ */

export const getMartOrders =
  async (req, res) => {
    try {
      const page =
        parsePositiveInteger(
          req.query.page,
          DEFAULT_PAGE
        );

      const limit =
        Math.min(
          parsePositiveInteger(
            req.query.limit,
            DEFAULT_LIMIT
          ),
          MAX_LIMIT
        );

      const skip =
        (page - 1) *
        limit;

      const {
        search,
        storeId,
        userId,
        riderId,
        status,
        paymentStatus,
        paymentMethod,
        startDate,
        endDate,
        sortOrder = "desc",
      } = req.query;

      const where = {};

      /* ======================================================
         STORE
      ====================================================== */

      if (storeId) {
        where.storeId =
          cleanString(
            storeId
          );
      }

      /* ======================================================
         USER
      ====================================================== */

      if (userId) {
        where.userId =
          cleanString(
            userId
          );
      }

      /* ======================================================
         RIDER
      ====================================================== */

      if (riderId) {
        where.riderId =
          cleanString(
            riderId
          );
      }

      /* ======================================================
         STATUS
      ====================================================== */

      if (
        status &&
        status !== "ALL"
      ) {
        where.status =
          String(status)
            .trim()
            .toUpperCase();
      }

      /* ======================================================
         PAYMENT STATUS
      ====================================================== */

      if (
        paymentStatus &&
        paymentStatus !==
          "ALL"
      ) {
        where.paymentStatus =
          String(
            paymentStatus
          )
            .trim()
            .toUpperCase();
      }

      /* ======================================================
         PAYMENT METHOD
      ====================================================== */

      if (
        paymentMethod &&
        paymentMethod !==
          "ALL"
      ) {
        where.paymentMethod =
          String(
            paymentMethod
          )
            .trim()
            .toUpperCase();
      }

      /* ======================================================
         SEARCH
      ====================================================== */

      if (search) {
        const value =
          cleanString(
            search
          );

        where.OR = [
          {
            orderNumber: {
              contains:
                value,

              mode:
                "insensitive",
            },
          },

          {
            customerNote: {
              contains:
                value,

              mode:
                "insensitive",
            },
          },
        ];
      }

      /* ======================================================
         DATE RANGE
      ====================================================== */

      if (
        startDate ||
        endDate
      ) {
        where.createdAt = {};

        if (startDate) {
          const start =
            new Date(
              startDate
            );

          if (
            Number.isNaN(
              start.getTime()
            )
          ) {
            return sendError(
              res,
              400,
              "Invalid startDate"
            );
          }

          where.createdAt.gte =
            start;
        }

        if (endDate) {
          const end =
            new Date(
              endDate
            );

          if (
            Number.isNaN(
              end.getTime()
            )
          ) {
            return sendError(
              res,
              400,
              "Invalid endDate"
            );
          }

          if (
            /^\d{4}-\d{2}-\d{2}$/.test(
              endDate
            )
          ) {
            end.setHours(
              23,
              59,
              59,
              999
            );
          }

          where.createdAt.lte =
            end;
        }
      }

      /* ======================================================
         QUERY
      ====================================================== */

      const [
        orders,
        total,
      ] =
        await prisma.$transaction([
          prisma.martOrder
            .findMany({
              where,

              include: {
                store: {
                  select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                    cityId: true,
                  },
                },

                items:
                  true,

                history: {
                  orderBy: {
                    createdAt:
                      "desc",
                  },

                  take: 1,
                },
              },

              skip,

              take:
                limit,

              orderBy: {
                createdAt:
                  String(
                    sortOrder
                  ).toLowerCase() ===
                  "asc"
                    ? "asc"
                    : "desc",
              },
            }),

          prisma.martOrder
            .count({
              where,
            }),
        ]);

      const totalPages =
        Math.ceil(
          total / limit
        );

      return res.json({
        success: true,

        orders,

        data:
          orders,

        pagination: {
          page,

          limit,

          total,

          totalPages,

          hasNextPage:
            page <
            totalPages,

          hasPreviousPage:
            page > 1,
        },
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "fetch"
      );
    }
  };

/* ============================================================
   ADMIN - GET MART ORDER BY ID
============================================================ */

export const getMartOrderById =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      const order =
        await prisma.martOrder
          .findUnique({
            where: {
              id,
            },

            include:
              orderInclude,
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      return res.json({
        success: true,

        order,

        data:
          order,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "fetch"
      );
    }
  };

/* ============================================================
   ADMIN - UPDATE ORDER STATUS
============================================================ */

export const updateMartOrderStatus =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      const actorId =
        getActorId(req);

      const status =
        String(
          req.body.status ||
            ""
        )
          .trim()
          .toUpperCase();

      const note =
        cleanString(
          req.body.note
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      if (!status) {
        return sendError(
          res,
          400,
          "Order status is required"
        );
      }

      /* ======================================================
         FIND ORDER
      ====================================================== */

      const order =
        await prisma.martOrder
          .findUnique({
            where: {
              id,
            },
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      /* ======================================================
         SAME STATUS
      ====================================================== */

      if (
        order.status ===
        status
      ) {
        return sendError(
          res,
          409,
          `Order is already ${status}`
        );
      }

      /* ======================================================
         STATUS TRANSITION
      ====================================================== */

      const allowed =
        STATUS_TRANSITIONS[
          order.status
        ] || [];

      if (
        !allowed.includes(
          status
        )
      ) {
        return sendError(
          res,
          409,
          `Cannot change order status from ${order.status} to ${status}`
        );
      }

      /* ======================================================
         CANCELLATION

         Must use cancellation endpoint because stock
         needs to be restored.
      ====================================================== */

      if (
        status ===
        "CANCELLED"
      ) {
        return sendError(
          res,
          400,
          "Use the order cancellation endpoint to cancel an order"
        );
      }

      /* ======================================================
         ONLINE PAYMENT DELIVERY VALIDATION

         CRITICAL:

         ONLINE order cannot become DELIVERED until
         Razorpay verifyPayment() has marked it PAID.
      ====================================================== */

      if (
        status ===
          "DELIVERED" &&
        order.paymentMethod ===
          "ONLINE" &&
        order.paymentStatus !==
          "PAID"
      ) {
        return sendError(
          res,
          409,
          "Online payment must be completed before delivery"
        );
      }

      /* ======================================================
         UPDATE DATA
      ====================================================== */

      const data = {
        status,
      };

      const now =
        new Date();

      /* ======================================================
         STATUS TIMESTAMPS
      ====================================================== */

      switch (status) {
        case "ACCEPTED":
          data.acceptedAt =
            now;

          break;

        case "PACKING":
          data.packingAt =
            now;

          break;

        case "READY":
          data.readyAt =
            now;

          break;

        case "PICKED":
          data.pickedAt =
            now;

          break;

        case "DELIVERED":
          data.deliveredAt =
            now;

          /*
             COD payment is collected
             during successful delivery.

             Therefore COD becomes PAID
             automatically here.
          */

          if (
            order.paymentMethod ===
              "COD" &&
            order.paymentStatus !==
              "PAID"
          ) {
            data.paymentStatus =
              "PAID";
          }

          break;

        default:
          break;
      }

      /* ======================================================
         UPDATE ORDER + HISTORY
      ====================================================== */

      const updated =
        await prisma.martOrder
          .update({
            where: {
              id,
            },

            data: {
              ...data,

              history: {
                create: {
                  status,

                  changedBy:
                    actorId,

                  note:
                    note ||
                    `Order status changed to ${status}`,
                },
              },
            },

            include:
              orderInclude,
          });

      return res.json({
        success: true,

        message:
          `KartoMart order status updated to ${status}`,

        order:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "update status for"
      );
    }
  };

/* ============================================================
   ADMIN - ASSIGN RIDER
============================================================ */

export const assignMartOrderRider =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      const riderId =
        cleanString(
          req.body.riderId
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      if (!riderId) {
        return sendError(
          res,
          400,
          "Rider ID is required"
        );
      }

      /* ======================================================
         FIND ORDER
      ====================================================== */

      const order =
        await prisma.martOrder
          .findUnique({
            where: {
              id,
            },

            select: {
              id: true,
              status: true,
              riderId: true,
            },
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      /* ======================================================
         FINAL ORDER CHECK
      ====================================================== */

      if (
        [
          "DELIVERED",
          "CANCELLED",
        ].includes(
          order.status
        )
      ) {
        return sendError(
          res,
          409,
          `Cannot assign rider to ${order.status} order`
        );
      }

      /* ======================================================
         SAME RIDER
      ====================================================== */

      if (
        order.riderId ===
        riderId
      ) {
        return sendError(
          res,
          409,
          "This rider is already assigned to the order"
        );
      }

      /* ======================================================
         UPDATE
      ====================================================== */

      const updated =
        await prisma.martOrder
          .update({
            where: {
              id,
            },

            data: {
              riderId,
            },

            include:
              orderInclude,
          });

      return res.json({
        success: true,

        message:
          "Rider assigned successfully",

        order:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "assign rider to"
      );
    }
  };

/* ============================================================
   ADMIN - UNASSIGN RIDER
============================================================ */

export const unassignMartOrderRider =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      const order =
        await prisma.martOrder
          .findUnique({
            where: {
              id,
            },

            select: {
              id: true,
              status: true,
              riderId: true,
            },
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      if (
        order.status ===
        "DELIVERED"
      ) {
        return sendError(
          res,
          409,
          "Cannot unassign rider from delivered order"
        );
      }

      if (
        order.status ===
        "CANCELLED"
      ) {
        return sendError(
          res,
          409,
          "Cannot unassign rider from cancelled order"
        );
      }

      if (!order.riderId) {
        return sendError(
          res,
          409,
          "No rider is assigned to this order"
        );
      }

      const updated =
        await prisma.martOrder
          .update({
            where: {
              id,
            },

            data: {
              riderId:
                null,
            },

            include:
              orderInclude,
          });

      return res.json({
        success: true,

        message:
          "Rider unassigned successfully",

        order:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "unassign rider from"
      );
    }
  };

/* ============================================================
   ADMIN - UPDATE PAYMENT STATUS

   IMPORTANT:

   ONLINE + PAID is intentionally blocked here.

   Razorpay verifyPayment() is the only endpoint that should
   mark an ONLINE MartOrder as PAID.

   This prevents:
   Admin/API -> paymentStatus=PAID
   without actual payment verification.
============================================================ */

export const updateMartOrderPaymentStatus =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      const paymentStatus =
        String(
          req.body
            .paymentStatus ||
            ""
        )
          .trim()
          .toUpperCase();

      if (!id) {
        return sendError(
          res,
          400,
          "Order id is required"
        );
      }

      if (!paymentStatus) {
        return sendError(
          res,
          400,
          "Payment status is required"
        );
      }

      /* ======================================================
         ENUM VALIDATION
      ====================================================== */

      if (
        !PAYMENT_STATUSES.has(
          paymentStatus
        )
      ) {
        return sendError(
          res,
          400,
          "Invalid payment status"
        );
      }

      /* ======================================================
         FIND ORDER
      ====================================================== */

      const order =
        await prisma.martOrder
          .findUnique({
            where: {
              id,
            },

            select: {
              id: true,
              status: true,
              paymentMethod:
                true,
              paymentStatus:
                true,
            },
          });

      if (!order) {
        return sendError(
          res,
          404,
          "KartoMart order not found"
        );
      }

      /* ======================================================
         FINAL ORDER
      ====================================================== */

      if (
        order.status ===
        "CANCELLED"
      ) {
        return sendError(
          res,
          409,
          "Payment status cannot be changed for a cancelled order"
        );
      }

      /* ======================================================
         ONLINE PAYMENT SECURITY

         ONLINE order can only become PAID after Razorpay
         signature/payment verification.
      ====================================================== */

      if (
        order.paymentMethod ===
          "ONLINE" &&
        paymentStatus ===
          "PAID"
      ) {
        return sendError(
          res,
          409,
          "Online payment can only be marked PAID through Razorpay verification"
        );
      }

      /* ======================================================
         SAME STATUS
      ====================================================== */

      if (
        order.paymentStatus ===
        paymentStatus
      ) {
        return sendError(
          res,
          409,
          `Payment status is already ${paymentStatus}`
        );
      }

      /* ======================================================
         DELIVERED COD

         A delivered COD order should remain PAID.
      ====================================================== */

      if (
        order.status ===
          "DELIVERED" &&
        order.paymentMethod ===
          "COD" &&
        paymentStatus !==
          "PAID"
      ) {
        return sendError(
          res,
          409,
          "Delivered COD order payment status cannot be changed from PAID"
        );
      }

      /* ======================================================
         UPDATE
      ====================================================== */

      const updated =
        await prisma.martOrder
          .update({
            where: {
              id,
            },

            data: {
              paymentStatus,
            },

            include:
              orderInclude,
          });

      return res.json({
        success: true,

        message:
          "Payment status updated successfully",

        order:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "update payment status for"
      );
    }
  };

/* ============================================================
   ADMIN - MART ORDER STATS
============================================================ */

export const getMartOrderStats =
  async (req, res) => {
    try {
      const where = {};

      /* ======================================================
         STORE FILTER
      ====================================================== */

      if (
        req.query.storeId
      ) {
        where.storeId =
          cleanString(
            req.query.storeId
          );
      }

      /* ======================================================
         STATS
      ====================================================== */

      const [
        total,

        placed,

        accepted,

        packing,

        ready,

        picked,

        delivered,

        cancelled,

        pendingPayments,

        paidPayments,

        failedPayments,

        revenue,
      ] =
        await prisma.$transaction([
          /* TOTAL */

          prisma.martOrder
            .count({
              where,
            }),

          /* PLACED */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "PLACED",
              },
            }),

          /* ACCEPTED */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "ACCEPTED",
              },
            }),

          /* PACKING */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "PACKING",
              },
            }),

          /* READY */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "READY",
              },
            }),

          /* PICKED */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "PICKED",
              },
            }),

          /* DELIVERED */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "DELIVERED",
              },
            }),

          /* CANCELLED */

          prisma.martOrder
            .count({
              where: {
                ...where,

                status:
                  "CANCELLED",
              },
            }),

          /* PAYMENT PENDING */

          prisma.martOrder
            .count({
              where: {
                ...where,

                paymentStatus:
                  "PENDING",
              },
            }),

          /* PAYMENT PAID */

          prisma.martOrder
            .count({
              where: {
                ...where,

                paymentStatus:
                  "PAID",
              },
            }),

          /* PAYMENT FAILED */

          prisma.martOrder
            .count({
              where: {
                ...where,

                paymentStatus:
                  "FAILED",
              },
            }),

          /* REVENUE */

          prisma.martOrder
            .aggregate({
              where: {
                ...where,

                status:
                  "DELIVERED",

                paymentStatus:
                  "PAID",
              },

              _sum: {
                totalAmount:
                  true,

                itemTotal:
                  true,

                deliveryFee:
                  true,

                platformFee:
                  true,

                discount:
                  true,

                taxAmount:
                  true,
              },

              _avg: {
                totalAmount:
                  true,
              },
            }),
        ]);

      /* ======================================================
         RESPONSE DATA
      ====================================================== */

      const data = {
        total,

        statuses: {
          placed,

          accepted,

          packing,

          ready,

          picked,

          delivered,

          cancelled,
        },

        payments: {
          pending:
            pendingPayments,

          paid:
            paidPayments,

          failed:
            failedPayments,
        },

        revenue: {
          totalRevenue:
            money(
              revenue
                ._sum
                .totalAmount
            ),

          itemRevenue:
            money(
              revenue
                ._sum
                .itemTotal
            ),

          deliveryFees:
            money(
              revenue
                ._sum
                .deliveryFee
            ),

          platformFees:
            money(
              revenue
                ._sum
                .platformFee
            ),

          discounts:
            money(
              revenue
                ._sum
                .discount
            ),

          taxes:
            money(
              revenue
                ._sum
                .taxAmount
            ),

          averageOrderValue:
            money(
              revenue
                ._avg
                .totalAmount
            ),
        },
      };

      return res.json({
        success: true,

        stats:
          data,

        data,
      });
    } catch (error) {
      return handleOrderError(
        res,
        error,
        "fetch statistics for"
      );
    }
  };