import prisma from "../prisma.js";

/* ============================================================
   KARTOMART CART CONTROLLER

   Structure:
   User
     -> MartCartItem
        -> MartStore
        -> MartProduct
        -> MartProductVariant

   IMPORTANT:
   - No restaurant/vendor dependency
   - Price is NEVER trusted from frontend
   - Price always comes from MartProductVariant
   - Stock always comes from MartProductVariant
   - One user's cart can contain products from ONE MartStore only
   - Product/variant/store availability is validated server-side
============================================================ */

const MAX_CART_QUANTITY = 99;

/* ============================================================
   COMMON HELPERS
============================================================ */

const cleanString = (value) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
};

const sendError = (res, status, message, errors = undefined) => {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
};

const getUserId = (req) => {
  return (
    req.user?.id ||
    req.user?.userId ||
    req.user?.pkid ||
    null
  );
};

const parseQuantity = (value) => {
  const quantity = Number(value);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CART_QUANTITY
  ) {
    return undefined;
  }

  return quantity;
};

const decimalToNumber = (value) => {
  if (value === undefined || value === null) return 0;

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const calculateTotal = (price, quantity) => {
  return Number(
    (decimalToNumber(price) * Number(quantity)).toFixed(2)
  );
};

/* ============================================================
   CART INCLUDE
============================================================ */

const cartItemInclude = {
  store: {
    select: {
      id: true,
      cityId: true,
      name: true,
      imageUrl: true,
      bannerUrl: true,

      minimumOrderAmount: true,
      deliveryFee: true,
      freeDeliveryAbove: true,
      platformFee: true,

      isActive: true,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,

      deletedAt: true,
    },
  },

  product: {
    select: {
      id: true,
      storeId: true,
      categoryId: true,

      name: true,
      description: true,
      brand: true,
      imageUrl: true,

      isActive: true,
      isAvailable: true,
      isFeatured: true,
      isPopular: true,
      isBestSeller: true,

      rating: true,
      totalReviews: true,

      deletedAt: true,
    },
  },

  variant: {
    select: {
      id: true,
      productId: true,

      label: true,
      quantity: true,
      unit: true,

      mrp: true,
      price: true,
      costPrice: true,

      stock: true,

      sku: true,
      barcode: true,

      isDefault: true,
      isAvailable: true,
      isActive: true,

      sortOrder: true,

      deletedAt: true,
    },
  },
};

/* ============================================================
   ERROR HANDLER
============================================================ */

const handleCartError = (
  res,
  error,
  action = "process"
) => {
  console.error(
    `KartoMart Cart ${action} Error:`,
    error
  );

  if (error?.code === "P2002") {
    return sendError(
      res,
      409,
      "This product variant already exists in the cart"
    );
  }

  if (error?.code === "P2003") {
    return sendError(
      res,
      400,
      "Invalid cart relation"
    );
  }

  if (error?.code === "P2025") {
    return sendError(
      res,
      404,
      "Cart item not found"
    );
  }

  return sendError(
    res,
    500,
    process.env.NODE_ENV === "production"
      ? `Unable to ${action} KartoMart cart`
      : error?.message ||
          `Unable to ${action} KartoMart cart`
  );
};

/* ============================================================
   VALIDATE STORE
============================================================ */

const validateStore = async (storeId) => {
  if (!storeId) {
    return {
      valid: false,
      status: 400,
      message: "Store ID is required",
    };
  }

  const store =
    await prisma.martStore.findFirst({
      where: {
        id: storeId,
        deletedAt: null,
      },
      select: {
        id: true,
        cityId: true,
        name: true,

        minimumOrderAmount: true,
        deliveryFee: true,
        freeDeliveryAbove: true,
        platformFee: true,

        isActive: true,
        isOpen: true,
        isVerified: true,
        isAcceptingOrders: true,
      },
    });

  if (!store) {
    return {
      valid: false,
      status: 404,
      message: "KartoMart store not found",
    };
  }

  if (!store.isActive) {
    return {
      valid: false,
      status: 409,
      message: "KartoMart store is inactive",
    };
  }

  if (!store.isVerified) {
    return {
      valid: false,
      status: 409,
      message: "KartoMart store is not verified",
    };
  }

  if (!store.isOpen) {
    return {
      valid: false,
      status: 409,
      message: "KartoMart store is currently closed",
    };
  }

  if (!store.isAcceptingOrders) {
    return {
      valid: false,
      status: 409,
      message:
        "KartoMart store is currently not accepting orders",
    };
  }

  return {
    valid: true,
    store,
  };
};

/* ============================================================
   VALIDATE PRODUCT + VARIANT
============================================================ */

const validateProductVariant = async ({
  storeId,
  productId,
  variantId,
}) => {
  if (!productId) {
    return {
      valid: false,
      status: 400,
      message: "Product ID is required",
    };
  }

  if (!variantId) {
    return {
      valid: false,
      status: 400,
      message: "Variant ID is required",
    };
  }

  const product =
    await prisma.martProduct.findFirst({
      where: {
        id: productId,
        storeId,
        deletedAt: null,
      },

      select: {
        id: true,
        storeId: true,
        categoryId: true,

        name: true,
        imageUrl: true,

        isActive: true,
        isAvailable: true,

        category: {
          select: {
            id: true,
            storeId: true,
            name: true,
            isActive: true,
            deletedAt: true,
          },
        },

        variants: {
          where: {
            id: variantId,
            deletedAt: null,
          },

          select: {
            id: true,
            productId: true,

            label: true,
            quantity: true,
            unit: true,

            mrp: true,
            price: true,
            costPrice: true,

            stock: true,

            sku: true,
            barcode: true,

            isDefault: true,
            isAvailable: true,
            isActive: true,

            sortOrder: true,
          },

          take: 1,
        },
      },
    });

  if (!product) {
    return {
      valid: false,
      status: 404,
      message:
        "Product not found in this KartoMart store",
    };
  }

  if (!product.isActive) {
    return {
      valid: false,
      status: 409,
      message: "Product is inactive",
    };
  }

  if (!product.isAvailable) {
    return {
      valid: false,
      status: 409,
      message: "Product is currently unavailable",
    };
  }

  if (
    product.category &&
    (
      product.category.deletedAt ||
      !product.category.isActive
    )
  ) {
    return {
      valid: false,
      status: 409,
      message:
        "Product category is currently unavailable",
    };
  }

  const variant = product.variants[0];

  if (!variant) {
    return {
      valid: false,
      status: 404,
      message:
        "Product variant not found",
    };
  }

  if (variant.productId !== product.id) {
    return {
      valid: false,
      status: 400,
      message:
        "Variant does not belong to this product",
    };
  }

  if (!variant.isActive) {
    return {
      valid: false,
      status: 409,
      message:
        "Product variant is inactive",
    };
  }

  if (!variant.isAvailable) {
    return {
      valid: false,
      status: 409,
      message:
        "Product variant is currently unavailable",
    };
  }

  if (variant.stock <= 0) {
    return {
      valid: false,
      status: 409,
      message:
        "Product variant is out of stock",
    };
  }

  return {
    valid: true,
    product,
    variant,
  };
};

/* ============================================================
   CHECK SINGLE STORE CART
============================================================ */

const validateSingleStoreCart = async (
  userId,
  storeId
) => {
  const existingCart =
    await prisma.martCartItem.findFirst({
      where: {
        userId,
      },

      select: {
        id: true,
        storeId: true,

        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

  if (
    existingCart &&
    existingCart.storeId !== storeId
  ) {
    return {
      valid: false,
      status: 409,

      message:
        "Your KartoMart cart contains items from another store. Clear the cart before adding items from this store.",

      currentStore: existingCart.store,
    };
  }

  return {
    valid: true,
  };
};

/* ============================================================
   CART SUMMARY BUILDER
============================================================ */

const buildCartResponse = (items) => {
  let itemTotal = 0;
  let totalMrp = 0;
  let totalQuantity = 0;

  for (const item of items) {
    const price =
      decimalToNumber(item.variant?.price);

    const mrp =
      decimalToNumber(item.variant?.mrp);

    itemTotal += price * item.quantity;

    totalMrp += mrp * item.quantity;

    totalQuantity += item.quantity;
  }

  itemTotal =
    Number(itemTotal.toFixed(2));

  totalMrp =
    Number(totalMrp.toFixed(2));

  const savings =
    Number(
      Math.max(
        0,
        totalMrp - itemTotal
      ).toFixed(2)
    );

  const store =
    items.length > 0
      ? items[0].store
      : null;

  let deliveryFee = 0;
  let platformFee = 0;

  if (store) {
    deliveryFee =
      decimalToNumber(
        store.deliveryFee
      );

    platformFee =
      decimalToNumber(
        store.platformFee
      );

    const freeDeliveryAbove =
      store.freeDeliveryAbove === null ||
      store.freeDeliveryAbove === undefined
        ? null
        : decimalToNumber(
            store.freeDeliveryAbove
          );

    if (
      freeDeliveryAbove !== null &&
      itemTotal >= freeDeliveryAbove
    ) {
      deliveryFee = 0;
    }
  }

  const payableAmount =
    Number(
      (
        itemTotal +
        deliveryFee +
        platformFee
      ).toFixed(2)
    );

  const minimumOrderAmount =
    store
      ? decimalToNumber(
          store.minimumOrderAmount
        )
      : 0;

  const minimumOrderRemaining =
    Number(
      Math.max(
        0,
        minimumOrderAmount -
          itemTotal
      ).toFixed(2)
    );

  return {
    items,

    store,

    summary: {
      uniqueItems: items.length,
      totalQuantity,

      totalMrp,
      itemTotal,

      savings,

      deliveryFee,
      platformFee,

      payableAmount,

      minimumOrderAmount,

      minimumOrderRemaining,

      minimumOrderReached:
        itemTotal >=
        minimumOrderAmount,
    },
  };
};

/* ============================================================
   REFRESH CART PRICES

   Cart stores price snapshots, but before returning the cart
   we update them from the current variant price.

   This prevents stale prices from remaining indefinitely.
============================================================ */

const refreshCartPrices = async (
  userId
) => {
  const items =
    await prisma.martCartItem.findMany({
      where: {
        userId,
      },

      include: cartItemInclude,

      orderBy: {
        createdAt: "asc",
      },
    });

  if (!items.length) {
    return [];
  }

  const updates = [];

  for (const item of items) {
    if (!item.variant) continue;

    const currentPrice =
      decimalToNumber(
        item.variant.price
      );

    const storedPrice =
      decimalToNumber(
        item.price
      );

    const newTotal =
      calculateTotal(
        currentPrice,
        item.quantity
      );

    const storedTotal =
      decimalToNumber(
        item.totalPrice
      );

    if (
      currentPrice !== storedPrice ||
      newTotal !== storedTotal
    ) {
      updates.push(
        prisma.martCartItem.update({
          where: {
            id: item.id,
          },

          data: {
            price: currentPrice,
            totalPrice: newTotal,
          },
        })
      );
    }
  }

  if (updates.length) {
    await prisma.$transaction(
      updates
    );

    return prisma.martCartItem.findMany({
      where: {
        userId,
      },

      include: cartItemInclude,

      orderBy: {
        createdAt: "asc",
      },
    });
  }

  return items;
};

/* ============================================================
   ADD ITEM TO CART
============================================================ */

export const addMartCartItem = async (
  req,
  res
) => {
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

    const storeId =
      cleanString(
        req.body.storeId
      );

    const productId =
      cleanString(
        req.body.productId
      );

    const variantId =
      cleanString(
        req.body.variantId
      );

    const quantity =
      parseQuantity(
        req.body.quantity ?? 1
      );

    const note =
      cleanString(
        req.body.note
      );

    if (!storeId) {
      return sendError(
        res,
        400,
        "Store ID is required"
      );
    }

    if (!productId) {
      return sendError(
        res,
        400,
        "Product ID is required"
      );
    }

    if (!variantId) {
      return sendError(
        res,
        400,
        "Variant ID is required"
      );
    }

    if (!quantity) {
      return sendError(
        res,
        400,
        `Quantity must be between 1 and ${MAX_CART_QUANTITY}`
      );
    }

    /* ------------------------------
       STORE VALIDATION
    ------------------------------ */

    const storeValidation =
      await validateStore(
        storeId
      );

    if (!storeValidation.valid) {
      return sendError(
        res,
        storeValidation.status,
        storeValidation.message
      );
    }

    /* ------------------------------
       SINGLE STORE VALIDATION
    ------------------------------ */

    const singleStoreValidation =
      await validateSingleStoreCart(
        userId,
        storeId
      );

    if (!singleStoreValidation.valid) {
      return res
        .status(
          singleStoreValidation.status
        )
        .json({
          success: false,

          message:
            singleStoreValidation.message,

          currentStore:
            singleStoreValidation.currentStore,
        });
    }

    /* ------------------------------
       PRODUCT / VARIANT VALIDATION
    ------------------------------ */

    const validation =
      await validateProductVariant({
        storeId,
        productId,
        variantId,
      });

    if (!validation.valid) {
      return sendError(
        res,
        validation.status,
        validation.message
      );
    }

    const {
      product,
      variant,
    } = validation;

    /* ------------------------------
       EXISTING ITEM
    ------------------------------ */

    const existingItem =
      await prisma.martCartItem.findUnique({
        where: {
          userId_variantId: {
            userId,
            variantId,
          },
        },
      });

    const finalQuantity =
      existingItem
        ? existingItem.quantity +
          quantity
        : quantity;

    if (
      finalQuantity >
      MAX_CART_QUANTITY
    ) {
      return sendError(
        res,
        400,
        `Maximum allowed quantity is ${MAX_CART_QUANTITY}`
      );
    }

    if (
      finalQuantity >
      variant.stock
    ) {
      return sendError(
        res,
        409,
        `Only ${variant.stock} item(s) available in stock`
      );
    }

    const price =
      decimalToNumber(
        variant.price
      );

    const totalPrice =
      calculateTotal(
        price,
        finalQuantity
      );

    let cartItem;

    if (existingItem) {
      cartItem =
        await prisma.martCartItem.update({
          where: {
            id: existingItem.id,
          },

          data: {
            quantity:
              finalQuantity,

            price,

            totalPrice,

            ...(note !== undefined && {
              note: note || null,
            }),
          },

          include:
            cartItemInclude,
        });
    } else {
      cartItem =
        await prisma.martCartItem.create({
          data: {
            userId,

            storeId,

            productId:
              product.id,

            variantId:
              variant.id,

            quantity,

            price,

            totalPrice:
              calculateTotal(
                price,
                quantity
              ),

            note:
              note || null,
          },

          include:
            cartItemInclude,
        });
    }

    return res
      .status(
        existingItem
          ? 200
          : 201
      )
      .json({
        success: true,

        message:
          existingItem
            ? "Cart quantity updated successfully"
            : "Product added to cart successfully",

        cartItem,
        data: cartItem,
      });
  } catch (error) {
    return handleCartError(
      res,
      error,
      "add item to"
    );
  }
};

/* ============================================================
   GET MY CART
============================================================ */

export const getMartCart = async (
  req,
  res
) => {
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

    const items =
      await refreshCartPrices(
        userId
      );

    const cart =
      buildCartResponse(
        items
      );

    return res.json({
      success: true,

      cart,

      data: cart,
    });
  } catch (error) {
    return handleCartError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   UPDATE CART ITEM QUANTITY

   Body:
   {
      quantity: 3
   }
============================================================ */

export const updateMartCartItem = async (
  req,
  res
) => {
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

    const quantity =
      parseQuantity(
        req.body.quantity
      );

    const note =
      cleanString(
        req.body.note
      );

    if (!id) {
      return sendError(
        res,
        400,
        "Cart item ID is required"
      );
    }

    if (!quantity) {
      return sendError(
        res,
        400,
        `Quantity must be between 1 and ${MAX_CART_QUANTITY}`
      );
    }

    const item =
      await prisma.martCartItem.findFirst({
        where: {
          id,
          userId,
        },

        include:
          cartItemInclude,
      });

    if (!item) {
      return sendError(
        res,
        404,
        "Cart item not found"
      );
    }

    const storeValidation =
      await validateStore(
        item.storeId
      );

    if (!storeValidation.valid) {
      return sendError(
        res,
        storeValidation.status,
        storeValidation.message
      );
    }

    const validation =
      await validateProductVariant({
        storeId:
          item.storeId,

        productId:
          item.productId,

        variantId:
          item.variantId,
      });

    if (!validation.valid) {
      return sendError(
        res,
        validation.status,
        validation.message
      );
    }

    const variant =
      validation.variant;

    if (
      quantity >
      variant.stock
    ) {
      return sendError(
        res,
        409,
        `Only ${variant.stock} item(s) available in stock`
      );
    }

    const price =
      decimalToNumber(
        variant.price
      );

    const updated =
      await prisma.martCartItem.update({
        where: {
          id,
        },

        data: {
          quantity,

          price,

          totalPrice:
            calculateTotal(
              price,
              quantity
            ),

          ...(note !== undefined && {
            note:
              note || null,
          }),
        },

        include:
          cartItemInclude,
      });

    return res.json({
      success: true,

      message:
        "Cart item updated successfully",

      cartItem: updated,

      data: updated,
    });
  } catch (error) {
    return handleCartError(
      res,
      error,
      "update"
    );
  }
};

/* ============================================================
   INCREMENT CART ITEM
============================================================ */

export const incrementMartCartItem =
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

      const item =
        await prisma.martCartItem.findFirst({
          where: {
            id,
            userId,
          },
        });

      if (!item) {
        return sendError(
          res,
          404,
          "Cart item not found"
        );
      }

      const newQuantity =
        item.quantity + 1;

      if (
        newQuantity >
        MAX_CART_QUANTITY
      ) {
        return sendError(
          res,
          400,
          `Maximum allowed quantity is ${MAX_CART_QUANTITY}`
        );
      }

      const storeValidation =
        await validateStore(
          item.storeId
        );

      if (!storeValidation.valid) {
        return sendError(
          res,
          storeValidation.status,
          storeValidation.message
        );
      }

      const validation =
        await validateProductVariant({
          storeId:
            item.storeId,

          productId:
            item.productId,

          variantId:
            item.variantId,
        });

      if (!validation.valid) {
        return sendError(
          res,
          validation.status,
          validation.message
        );
      }

      if (
        newQuantity >
        validation.variant.stock
      ) {
        return sendError(
          res,
          409,
          `Only ${validation.variant.stock} item(s) available in stock`
        );
      }

      const price =
        decimalToNumber(
          validation.variant.price
        );

      const updated =
        await prisma.martCartItem.update({
          where: {
            id,
          },

          data: {
            quantity:
              newQuantity,

            price,

            totalPrice:
              calculateTotal(
                price,
                newQuantity
              ),
          },

          include:
            cartItemInclude,
        });

      return res.json({
        success: true,

        message:
          "Cart quantity increased successfully",

        cartItem:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "increment"
      );
    }
  };

/* ============================================================
   DECREMENT CART ITEM

   If quantity becomes 0, item is removed.
============================================================ */

export const decrementMartCartItem =
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

      const item =
        await prisma.martCartItem.findFirst({
          where: {
            id,
            userId,
          },
        });

      if (!item) {
        return sendError(
          res,
          404,
          "Cart item not found"
        );
      }

      if (
        item.quantity <= 1
      ) {
        await prisma.martCartItem.delete({
          where: {
            id,
          },
        });

        return res.json({
          success: true,

          message:
            "Item removed from cart",

          removed: true,

          cartItemId:
            id,
        });
      }

      const validation =
        await validateProductVariant({
          storeId:
            item.storeId,

          productId:
            item.productId,

          variantId:
            item.variantId,
        });

      if (!validation.valid) {
        return sendError(
          res,
          validation.status,
          validation.message
        );
      }

      const newQuantity =
        item.quantity - 1;

      const price =
        decimalToNumber(
          validation.variant.price
        );

      const updated =
        await prisma.martCartItem.update({
          where: {
            id,
          },

          data: {
            quantity:
              newQuantity,

            price,

            totalPrice:
              calculateTotal(
                price,
                newQuantity
              ),
          },

          include:
            cartItemInclude,
        });

      return res.json({
        success: true,

        message:
          "Cart quantity decreased successfully",

        cartItem:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "decrement"
      );
    }
  };

/* ============================================================
   REMOVE CART ITEM
============================================================ */

export const removeMartCartItem =
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
          "Cart item ID is required"
        );
      }

      const item =
        await prisma.martCartItem.findFirst({
          where: {
            id,
            userId,
          },

          select: {
            id: true,
          },
        });

      if (!item) {
        return sendError(
          res,
          404,
          "Cart item not found"
        );
      }

      await prisma.martCartItem.delete({
        where: {
          id,
        },
      });

      return res.json({
        success: true,

        message:
          "Item removed from cart successfully",

        cartItemId:
          id,
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "remove item from"
      );
    }
  };

/* ============================================================
   REMOVE BY VARIANT

   Useful directly from product listing screen.
============================================================ */

export const removeMartCartItemByVariant =
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

      const variantId =
        cleanString(
          req.params.variantId
        );

      if (!variantId) {
        return sendError(
          res,
          400,
          "Variant ID is required"
        );
      }

      const item =
        await prisma.martCartItem.findUnique({
          where: {
            userId_variantId: {
              userId,
              variantId,
            },
          },

          select: {
            id: true,
          },
        });

      if (!item) {
        return sendError(
          res,
          404,
          "Cart item not found"
        );
      }

      await prisma.martCartItem.delete({
        where: {
          id:
            item.id,
        },
      });

      return res.json({
        success: true,

        message:
          "Item removed from cart successfully",

        cartItemId:
          item.id,
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "remove item from"
      );
    }
  };

/* ============================================================
   CLEAR CART
============================================================ */

export const clearMartCart =
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

      const result =
        await prisma.martCartItem.deleteMany({
          where: {
            userId,
          },
        });

      return res.json({
        success: true,

        message:
          "KartoMart cart cleared successfully",

        removedCount:
          result.count,

        data: {
          removedCount:
            result.count,
        },
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "clear"
      );
    }
  };

/* ============================================================
   CART COUNT
============================================================ */

export const getMartCartCount =
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

      const items =
        await prisma.martCartItem.findMany({
          where: {
            userId,
          },

          select: {
            quantity: true,
          },
        });

      const uniqueItems =
        items.length;

      const totalQuantity =
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.quantity,
          0
        );

      return res.json({
        success: true,

        uniqueItems,

        totalQuantity,

        count:
          totalQuantity,

        data: {
          uniqueItems,
          totalQuantity,
        },
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "fetch count for"
      );
    }
  };

/* ============================================================
   VALIDATE CART

   Useful before checkout.

   Checks:
   - Store availability
   - Product availability
   - Variant availability
   - Stock
   - Current prices
   - Minimum order
============================================================ */

export const validateMartCart =
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

      const items =
        await prisma.martCartItem.findMany({
          where: {
            userId,
          },

          include:
            cartItemInclude,

          orderBy: {
            createdAt:
              "asc",
          },
        });

      if (!items.length) {
        return sendError(
          res,
          400,
          "KartoMart cart is empty"
        );
      }

      /* ------------------------------
         Defensive mixed-store check
      ------------------------------ */

      const storeIds =
        new Set(
          items.map(
            (item) =>
              item.storeId
          )
        );

      if (
        storeIds.size > 1
      ) {
        return res
          .status(409)
          .json({
            success: false,

            valid: false,

            message:
              "Cart contains items from multiple KartoMart stores",

            errors: [
              {
                type:
                  "MULTIPLE_STORES",
              },
            ],
          });
      }

      const storeId =
        items[0].storeId;

      const storeValidation =
        await validateStore(
          storeId
        );

      if (!storeValidation.valid) {
        return res
          .status(
            storeValidation.status
          )
          .json({
            success: false,

            valid: false,

            message:
              storeValidation.message,
          });
      }

      const errors = [];
      const priceChanges = [];

      for (
        const item of items
      ) {
        const validation =
          await validateProductVariant({
            storeId:
              item.storeId,

            productId:
              item.productId,

            variantId:
              item.variantId,
          });

        if (!validation.valid) {
          errors.push({
            cartItemId:
              item.id,

            productId:
              item.productId,

            variantId:
              item.variantId,

            message:
              validation.message,
          });

          continue;
        }

        const variant =
          validation.variant;

        if (
          item.quantity >
          variant.stock
        ) {
          errors.push({
            cartItemId:
              item.id,

            productId:
              item.productId,

            variantId:
              item.variantId,

            type:
              "INSUFFICIENT_STOCK",

            requested:
              item.quantity,

            available:
              variant.stock,

            message:
              `Only ${variant.stock} item(s) available`,
          });
        }

        const oldPrice =
          decimalToNumber(
            item.price
          );

        const currentPrice =
          decimalToNumber(
            variant.price
          );

        if (
          oldPrice !==
          currentPrice
        ) {
          priceChanges.push({
            cartItemId:
              item.id,

            productId:
              item.productId,

            variantId:
              item.variantId,

            oldPrice,

            currentPrice,
          });
        }
      }

      /* ------------------------------
         Refresh prices
      ------------------------------ */

      const refreshedItems =
        await refreshCartPrices(
          userId
        );

      const cart =
        buildCartResponse(
          refreshedItems
        );

      if (
        cart.summary
          .minimumOrderRemaining >
        0
      ) {
        errors.push({
          type:
            "MINIMUM_ORDER_NOT_REACHED",

          minimumOrderAmount:
            cart.summary
              .minimumOrderAmount,

          itemTotal:
            cart.summary
              .itemTotal,

          remaining:
            cart.summary
              .minimumOrderRemaining,

          message:
            `Add ₹${cart.summary.minimumOrderRemaining.toFixed(
              2
            )} more to reach the minimum order amount`,
        });
      }

      const valid =
        errors.length === 0;

      return res
        .status(
          valid
            ? 200
            : 409
        )
        .json({
          success: valid,

          valid,

          message:
            valid
              ? "KartoMart cart is valid for checkout"
              : "KartoMart cart requires attention before checkout",

          errors,

          priceChanges,

          cart,

          data:
            cart,
        });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "validate"
      );
    }
  };

/* ============================================================
   CHANGE PRODUCT VARIANT

   Example:
   User changes:
   Tomato 500G -> Tomato 1KG

   Body:
   {
      variantId: "NEW_VARIANT_ID"
   }
============================================================ */

export const changeMartCartVariant =
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

      const newVariantId =
        cleanString(
          req.body.variantId
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Cart item ID is required"
        );
      }

      if (!newVariantId) {
        return sendError(
          res,
          400,
          "New variant ID is required"
        );
      }

      const item =
        await prisma.martCartItem.findFirst({
          where: {
            id,
            userId,
          },
        });

      if (!item) {
        return sendError(
          res,
          404,
          "Cart item not found"
        );
      }

      if (
        item.variantId ===
        newVariantId
      ) {
        return sendError(
          res,
          400,
          "Selected variant is already in cart"
        );
      }

      const validation =
        await validateProductVariant({
          storeId:
            item.storeId,

          productId:
            item.productId,

          variantId:
            newVariantId,
        });

      if (!validation.valid) {
        return sendError(
          res,
          validation.status,
          validation.message
        );
      }

      const variant =
        validation.variant;

      if (
        item.quantity >
        variant.stock
      ) {
        return sendError(
          res,
          409,
          `Only ${variant.stock} item(s) available for selected variant`
        );
      }

      /* ------------------------------
         UNIQUE CONSTRAINT CHECK

         @@unique([userId, variantId])
      ------------------------------ */

      const existing =
        await prisma.martCartItem.findUnique({
          where: {
            userId_variantId: {
              userId,
              variantId:
                newVariantId,
            },
          },
        });

      if (
        existing &&
        existing.id !== item.id
      ) {
        const combinedQuantity =
          existing.quantity +
          item.quantity;

        if (
          combinedQuantity >
          variant.stock
        ) {
          return sendError(
            res,
            409,
            `Only ${variant.stock} item(s) available for selected variant`
          );
        }

        if (
          combinedQuantity >
          MAX_CART_QUANTITY
        ) {
          return sendError(
            res,
            400,
            `Maximum allowed quantity is ${MAX_CART_QUANTITY}`
          );
        }

        const price =
          decimalToNumber(
            variant.price
          );

        const updated =
          await prisma.$transaction(
            async (tx) => {
              const merged =
                await tx.martCartItem.update({
                  where: {
                    id:
                      existing.id,
                  },

                  data: {
                    quantity:
                      combinedQuantity,

                    price,

                    totalPrice:
                      calculateTotal(
                        price,
                        combinedQuantity
                      ),
                  },

                  include:
                    cartItemInclude,
                });

              await tx.martCartItem.delete({
                where: {
                  id:
                    item.id,
                },
              });

              return merged;
            }
          );

        return res.json({
          success: true,

          message:
            "Cart variant changed and matching cart items merged successfully",

          cartItem:
            updated,

          data:
            updated,
        });
      }

      const price =
        decimalToNumber(
          variant.price
        );

      const updated =
        await prisma.martCartItem.update({
          where: {
            id,
          },

          data: {
            variantId:
              newVariantId,

            price,

            totalPrice:
              calculateTotal(
                price,
                item.quantity
              ),
          },

          include:
            cartItemInclude,
        });

      return res.json({
        success: true,

        message:
          "Cart variant changed successfully",

        cartItem:
          updated,

        data:
          updated,
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "change variant in"
      );
    }
  };

/* ============================================================
   GET CART ITEM BY VARIANT

   Useful for product cards:
   determine whether a particular variant is already in cart.
============================================================ */

export const getMartCartItemByVariant =
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

      const variantId =
        cleanString(
          req.params.variantId
        );

      if (!variantId) {
        return sendError(
          res,
          400,
          "Variant ID is required"
        );
      }

      const cartItem =
        await prisma.martCartItem.findUnique({
          where: {
            userId_variantId: {
              userId,
              variantId,
            },
          },

          include:
            cartItemInclude,
        });

      return res.json({
        success: true,

        exists:
          Boolean(cartItem),

        cartItem:
          cartItem || null,

        data:
          cartItem || null,
      });
    } catch (error) {
      return handleCartError(
        res,
        error,
        "fetch item from"
      );
    }
  };