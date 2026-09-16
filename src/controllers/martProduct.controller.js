import prisma from "../prisma.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";

/* ============================================================
   KARTOMART PRODUCT CONTROLLER

   KartoMart is owned and managed directly by Karto.

   Store
      └── Category
            └── Product
                  └── Variants

   No Vendor
   No Commission
============================================================ */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = new Set([
  "name",
  "brand",
  "mrp",
  "price",
  "costPrice",
  "stock",
  "sortOrder",
  "isActive",
  "isAvailable",
  "isFeatured",
  "isBestSeller",
  "createdAt",
  "updatedAt",
]);

/* ============================================================
   BASIC HELPERS
============================================================ */

const cleanString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value).trim();
};

const strictBoolean = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1") {
    return true;
  }

  if (value === 0 || value === "0") {
    return false;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (
    ["true", "yes", "y", "active", "on"].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    ["false", "no", "n", "inactive", "off"].includes(
      normalized
    )
  ) {
    return false;
  }

  return undefined;
};

const boolValue = (value, fallback = false) => {
  const parsed = strictBoolean(value);

  return parsed === undefined
    ? fallback
    : parsed;
};

const parseNumber = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : undefined;
};

const parseNonNegativeNumber = (value) => {
  const number = parseNumber(value);

  if (
    number === undefined ||
    number < 0
  ) {
    return undefined;
  }

  return number;
};

const parseNonNegativeInteger = (
  value,
  fallback = undefined
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    return undefined;
  }

  return number;
};

const parsePositiveInteger = (
  value,
  fallback
) => {
  const number = Number.parseInt(
    value,
    10
  );

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return number;
};

const sendError = (
  res,
  status,
  message,
  errors = undefined
) => {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
};

const uploadImage = async (
  req,
  folder
) => {
  if (!req.file) {
    return undefined;
  }

  return uploadToCloudinary(
    req.file,
    folder
  );
};

/* ============================================================
   COMMON INCLUDE
============================================================ */

const productInclude = {
  store: {
    select: {
      id: true,
      name: true,
      cityId: true,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,
    },
  },

  category: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      isActive: true,
    },
  },

  variants: {
    where: {
      deletedAt: null,
    },

    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  },
};

/* ============================================================
   ERROR HANDLER
============================================================ */

const handleMartProductError = (
  res,
  error,
  action = "process"
) => {
  console.error(
    `KartoMart Product ${action} Error:`,
    error
  );

  if (error?.code === "P2002") {
    return sendError(
      res,
      409,
      "A product with the same unique data already exists"
    );
  }

  if (error?.code === "P2003") {
    return sendError(
      res,
      400,
      "Invalid KartoMart store, category or product relation"
    );
  }

  if (error?.code === "P2025") {
    return sendError(
      res,
      404,
      "KartoMart product not found"
    );
  }

  return sendError(
    res,
    500,
    error?.message ||
      `Unable to ${action} KartoMart product`
  );
};

/* ============================================================
   PRODUCT VALIDATION
============================================================ */

const validateProductPayload = (
  body,
  isUpdate = false
) => {
  const errors = {};

  if (!isUpdate) {
    if (!cleanString(body.storeId)) {
      errors.storeId =
        "KartoMart store ID is required";
    }

    if (!cleanString(body.categoryId)) {
      errors.categoryId =
        "Category ID is required";
    }

    if (!cleanString(body.name)) {
      errors.name =
        "Product name is required";
    }

    if (
      body.price === undefined ||
      body.price === null ||
      body.price === ""
    ) {
      errors.price =
        "Selling price is required";
    }
  }

  if (
    body.name !== undefined &&
    !cleanString(body.name)
  ) {
    errors.name =
      "Product name cannot be empty";
  }

  if (
    body.name &&
    cleanString(body.name).length > 255
  ) {
    errors.name =
      "Product name cannot exceed 255 characters";
  }

  if (
    body.brand &&
    cleanString(body.brand).length > 150
  ) {
    errors.brand =
      "Brand cannot exceed 150 characters";
  }

  if (
    body.description &&
    cleanString(body.description).length > 5000
  ) {
    errors.description =
      "Description cannot exceed 5000 characters";
  }

  const numericFields = [
    "mrp",
    "price",
    "costPrice",
  ];

  for (const field of numericFields) {
    if (
      body[field] !== undefined &&
      parseNonNegativeNumber(
        body[field]
      ) === undefined
    ) {
      errors[field] =
        `${field} must be a valid non-negative number`;
    }
  }

  if (body.stock !== undefined) {
    const stock =
      parseNonNegativeInteger(
        body.stock
      );

    if (stock === undefined) {
      errors.stock =
        "stock must be a non-negative integer";
    }
  }

  if (body.sortOrder !== undefined) {
    const sortOrder =
      parseNonNegativeInteger(
        body.sortOrder
      );

    if (sortOrder === undefined) {
      errors.sortOrder =
        "sortOrder must be a non-negative integer";
    }
  }

  const booleanFields = [
    "isActive",
    "isAvailable",
    "isFeatured",
    "isBestSeller",
  ];

  for (const field of booleanFields) {
    if (
      body[field] !== undefined &&
      strictBoolean(
        body[field]
      ) === undefined
    ) {
      errors[field] =
        `${field} must be true or false`;
    }
  }

  return errors;
};

/* ============================================================
   PRICE VALIDATION

   MRP >= Selling Price
   Selling Price normally >= Cost Price

   We prevent accidental negative-margin products.
============================================================ */

const validatePrices = ({
  mrp,
  price,
  costPrice,
}) => {
  if (
    mrp !== undefined &&
    price !== undefined &&
    price > mrp
  ) {
    return {
      valid: false,
      message:
        "Selling price cannot be greater than MRP",
    };
  }

  if (
    costPrice !== undefined &&
    price !== undefined &&
    costPrice > price
  ) {
    return {
      valid: false,
      message:
        "Cost price cannot be greater than selling price",
    };
  }

  return {
    valid: true,
  };
};

/* ============================================================
   STORE + CATEGORY VALIDATION
============================================================ */

const validateStoreAndCategory = async (
  storeId,
  categoryId
) => {
  const store =
    await prisma.martStore.findFirst({
      where: {
        id: storeId,
        deletedAt: null,
      },

      select: {
        id: true,
        name: true,
      },
    });

  if (!store) {
    return {
      valid: false,
      status: 404,
      message:
        "KartoMart store not found",
    };
  }

  const category =
    await prisma.martCategory.findFirst({
      where: {
        id: categoryId,
        storeId,
        deletedAt: null,
      },

      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

  if (!category) {
    return {
      valid: false,
      status: 400,
      message:
        "Category does not belong to the selected KartoMart store",
    };
  }

  return {
    valid: true,
    store,
    category,
  };
};

/* ============================================================
   CREATE PRODUCT
============================================================ */

export const createMartProduct = async (
  req,
  res
) => {
  try {
    const errors =
      validateProductPayload(
        req.body,
        false
      );

    if (Object.keys(errors).length) {
      return sendError(
        res,
        400,
        "Validation failed",
        errors
      );
    }

    const {
      storeId,
      categoryId,

      name,
      description,
      brand,

      imageUrl,

      unit,
      weight,

      mrp,
      price,
      costPrice = 0,

      stock = 0,

      sortOrder = 0,

      isActive = true,
      isAvailable = true,
      isFeatured = false,
      isBestSeller = false,
    } = req.body;

    const cleanStoreId =
      cleanString(storeId);

    const cleanCategoryId =
      cleanString(categoryId);

    /* ---------------- Relation validation ---------------- */

    const relation =
      await validateStoreAndCategory(
        cleanStoreId,
        cleanCategoryId
      );

    if (!relation.valid) {
      return sendError(
        res,
        relation.status,
        relation.message
      );
    }

    /* ---------------- Price validation ---------------- */

    const finalPrice =
      Number(price);

    const finalMrp =
      mrp !== undefined &&
      mrp !== ""
        ? Number(mrp)
        : finalPrice;

    const finalCostPrice =
      Number(costPrice || 0);

    const priceValidation =
      validatePrices({
        mrp: finalMrp,
        price: finalPrice,
        costPrice:
          finalCostPrice,
      });

    if (!priceValidation.valid) {
      return sendError(
        res,
        400,
        priceValidation.message
      );
    }

    /* ---------------- Duplicate ---------------- */

    const duplicate =
      await prisma.martProduct.findFirst({
        where: {
          storeId:
            cleanStoreId,

          categoryId:
            cleanCategoryId,

          name: {
            equals:
              cleanString(name),

            mode:
              "insensitive",
          },

          deletedAt:
            null,
        },

        select: {
          id: true,
        },
      });

    if (duplicate) {
      return sendError(
        res,
        409,
        "This product already exists in the selected category"
      );
    }

    /* ---------------- Image ---------------- */

    let finalImageUrl =
      cleanString(imageUrl) || null;

    if (req.file) {
      try {
        const uploadedUrl =
          await uploadImage(
            req,
            "karto-mart/products"
          );

        if (uploadedUrl) {
          finalImageUrl =
            uploadedUrl;
        }
      } catch (uploadError) {
        console.error(
          "MartProduct Cloudinary Upload Error:",
          uploadError
        );

        return sendError(
          res,
          500,
          "Product image upload failed"
        );
      }
    }

    const finalStock =
      parseNonNegativeInteger(
        stock,
        0
      );

    let finalAvailable =
      boolValue(
        isAvailable,
        true
      );

    /*
       No stock = unavailable.

       If later you allow products without stock tracking,
       this rule can be changed using trackInventory.
    */
    if (finalStock <= 0) {
      finalAvailable = false;
    }

    const product =
      await prisma.martProduct.create({
        data: {
          storeId:
            cleanStoreId,

          categoryId:
            cleanCategoryId,

          name:
            cleanString(name),

          description:
            cleanString(
              description
            ) || null,

          brand:
            cleanString(brand) ||
            null,

          imageUrl:
            finalImageUrl,

          unit:
            cleanString(unit) ||
            null,

          weight:
            cleanString(weight) ||
            null,

          mrp:
            finalMrp,

          price:
            finalPrice,

          costPrice:
            finalCostPrice,

          stock:
            finalStock,

          sortOrder:
            parseNonNegativeInteger(
              sortOrder,
              0
            ),

          isActive:
            boolValue(
              isActive,
              true
            ),

          isAvailable:
            finalAvailable,

          isFeatured:
            boolValue(
              isFeatured,
              false
            ),

          isBestSeller:
            boolValue(
              isBestSeller,
              false
            ),
        },

        include:
          productInclude,
      });

    return res.status(201).json({
      success: true,
      message:
        "KartoMart product created successfully",
      product,
      data: product,
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "create"
    );
  }
};

/* ============================================================
   GET PRODUCTS - ADMIN

   Filters:
   storeId
   categoryId
   search
   brand
   isActive
   isAvailable
   isFeatured
   isBestSeller
   inStock
   minPrice
   maxPrice
   minStock
   maxStock
   includeDeleted
   onlyDeleted

   Pagination:
   page
   limit

   Sorting:
   sortBy
   sortOrder
============================================================ */

export const getMartProducts = async (
  req,
  res
) => {
  try {
    const {
      storeId,
      categoryId,
      search,
      brand,

      isActive,
      isAvailable,
      isFeatured,
      isBestSeller,
      inStock,

      minPrice,
      maxPrice,

      minStock,
      maxStock,

      includeDeleted,
      onlyDeleted,

      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const page =
      parsePositiveInteger(
        req.query.page,
        DEFAULT_PAGE
      );

    const requestedLimit =
      parsePositiveInteger(
        req.query.limit,
        DEFAULT_LIMIT
      );

    const limit =
      Math.min(
        requestedLimit,
        MAX_LIMIT
      );

    const skip =
      (page - 1) * limit;

    const where = {};

    if (
      storeId &&
      storeId !== "ALL"
    ) {
      where.storeId =
        cleanString(storeId);
    }

    if (
      categoryId &&
      categoryId !== "ALL"
    ) {
      where.categoryId =
        cleanString(categoryId);
    }

    /* ---------------- Search ---------------- */

    if (cleanString(search)) {
      const q =
        cleanString(search);

      where.OR = [
        {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },

        {
          description: {
            contains: q,
            mode: "insensitive",
          },
        },

        {
          brand: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    if (cleanString(brand)) {
      where.brand = {
        contains:
          cleanString(brand),

        mode:
          "insensitive",
      };
    }

    /* ---------------- Boolean filters ---------------- */

    const booleanFilters = {
      isActive,
      isAvailable,
      isFeatured,
      isBestSeller,
    };

    for (const [
      field,
      value,
    ] of Object.entries(
      booleanFilters
    )) {
      if (value !== undefined) {
        const parsed =
          strictBoolean(value);

        if (parsed === undefined) {
          return sendError(
            res,
            400,
            `${field} must be true or false`
          );
        }

        where[field] =
          parsed;
      }
    }

    /* ---------------- Stock ---------------- */

    if (inStock !== undefined) {
      const parsed =
        strictBoolean(inStock);

      if (parsed === undefined) {
        return sendError(
          res,
          400,
          "inStock must be true or false"
        );
      }

      where.stock = parsed
        ? {
            gt: 0,
          }
        : {
            lte: 0,
          };
    }

    const minStockValue =
      parseNumber(minStock);

    const maxStockValue =
      parseNumber(maxStock);

    if (
      minStockValue !== undefined ||
      maxStockValue !== undefined
    ) {
      where.stock = {
        ...(where.stock || {}),

        ...(minStockValue !== undefined && {
          gte:
            minStockValue,
        }),

        ...(maxStockValue !== undefined && {
          lte:
            maxStockValue,
        }),
      };
    }

    /* ---------------- Price ---------------- */

    const minPriceValue =
      parseNumber(minPrice);

    const maxPriceValue =
      parseNumber(maxPrice);

    if (
      minPriceValue !== undefined ||
      maxPriceValue !== undefined
    ) {
      where.price = {};

      if (
        minPriceValue !== undefined
      ) {
        where.price.gte =
          minPriceValue;
      }

      if (
        maxPriceValue !== undefined
      ) {
        where.price.lte =
          maxPriceValue;
      }
    }

    /* ---------------- Deleted ---------------- */

    const includeDeletedValue =
      strictBoolean(
        includeDeleted
      ) ?? false;

    const onlyDeletedValue =
      strictBoolean(
        onlyDeleted
      ) ?? false;

    if (onlyDeletedValue) {
      where.deletedAt = {
        not: null,
      };
    } else if (!includeDeletedValue) {
      where.deletedAt =
        null;
    }

    /* ---------------- Sorting ---------------- */

    const safeSortBy =
      ALLOWED_SORT_FIELDS.has(
        String(sortBy)
      )
        ? String(sortBy)
        : "createdAt";

    const safeSortOrder =
      String(sortOrder)
        .toLowerCase() === "asc"
        ? "asc"
        : "desc";

    const [
      products,
      total,
    ] =
      await prisma.$transaction([
        prisma.martProduct.findMany({
          where,

          include:
            productInclude,

          skip,
          take: limit,

          orderBy: [
            {
              [safeSortBy]:
                safeSortOrder,
            },
            {
              name: "asc",
            },
          ],
        }),

        prisma.martProduct.count({
          where,
        }),
      ]);

    const totalPages =
      Math.ceil(
        total / limit
      );

    return res.json({
      success: true,

      products,
      data: products,

      pagination: {
        page,
        limit,
        total,
        totalPages,

        hasNextPage:
          page < totalPages,

        hasPreviousPage:
          page > 1,
      },

      sorting: {
        sortBy:
          safeSortBy,

        sortOrder:
          safeSortOrder,
      },
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   GET PRODUCT BY ID
============================================================ */

export const getMartProductById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const product =
      await prisma.martProduct.findFirst({
        where: {
          id:
            cleanString(id),

          deletedAt:
            null,
        },

        include:
          productInclude,
      });

    if (!product) {
      return sendError(
        res,
        404,
        "KartoMart product not found"
      );
    }

    return res.json({
      success: true,
      product,
      data: product,
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   UPDATE PRODUCT
============================================================ */

export const updateMartProduct = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id:
            cleanString(id),
        },
      });

    if (!existing) {
      return sendError(
        res,
        404,
        "KartoMart product not found"
      );
    }

    if (existing.deletedAt) {
      return sendError(
        res,
        409,
        "Deleted product cannot be updated. Restore it first."
      );
    }

    const errors =
      validateProductPayload(
        req.body,
        true
      );

    if (Object.keys(errors).length) {
      return sendError(
        res,
        400,
        "Validation failed",
        errors
      );
    }

    const {
      storeId,
      categoryId,

      name,
      description,
      brand,

      imageUrl,

      unit,
      weight,

      mrp,
      price,
      costPrice,

      stock,
      sortOrder,

      isActive,
      isAvailable,
      isFeatured,
      isBestSeller,
    } = req.body;

    const finalStoreId =
      storeId !== undefined
        ? cleanString(storeId)
        : existing.storeId;

    const finalCategoryId =
      categoryId !== undefined
        ? cleanString(categoryId)
        : existing.categoryId;

    /* ---------------- Relation validation ---------------- */

    if (
      storeId !== undefined ||
      categoryId !== undefined
    ) {
      const relation =
        await validateStoreAndCategory(
          finalStoreId,
          finalCategoryId
        );

      if (!relation.valid) {
        return sendError(
          res,
          relation.status,
          relation.message
        );
      }
    }

    /* ---------------- Duplicate ---------------- */

    if (
      name !== undefined ||
      storeId !== undefined ||
      categoryId !== undefined
    ) {
      const finalName =
        name !== undefined
          ? cleanString(name)
          : existing.name;

      const duplicate =
        await prisma.martProduct.findFirst({
          where: {
            storeId:
              finalStoreId,

            categoryId:
              finalCategoryId,

            name: {
              equals:
                finalName,

              mode:
                "insensitive",
            },

            deletedAt:
              null,

            NOT: {
              id:
                existing.id,
            },
          },

          select: {
            id: true,
          },
        });

      if (duplicate) {
        return sendError(
          res,
          409,
          "This product already exists in the selected category"
        );
      }
    }

    /* ---------------- Price validation ---------------- */

    const finalPrice =
      price !== undefined
        ? Number(price)
        : Number(existing.price);

    const finalMrp =
      mrp !== undefined
        ? Number(mrp)
        : Number(existing.mrp);

    const finalCostPrice =
      costPrice !== undefined
        ? Number(costPrice)
        : Number(existing.costPrice);

    const priceValidation =
      validatePrices({
        mrp:
          finalMrp,
        price:
          finalPrice,
        costPrice:
          finalCostPrice,
      });

    if (!priceValidation.valid) {
      return sendError(
        res,
        400,
        priceValidation.message
      );
    }

    /* ---------------- Image ---------------- */

    let finalImageUrl;

    if (req.file) {
      try {
        finalImageUrl =
          await uploadImage(
            req,
            "karto-mart/products"
          );
      } catch (uploadError) {
        console.error(
          "MartProduct Cloudinary Update Error:",
          uploadError
        );

        return sendError(
          res,
          500,
          "Product image upload failed"
        );
      }
    } else if (imageUrl !== undefined) {
      finalImageUrl =
        cleanString(imageUrl) || null;
    }

    const updateData = {
      ...(storeId !== undefined && {
        storeId:
          finalStoreId,
      }),

      ...(categoryId !== undefined && {
        categoryId:
          finalCategoryId,
      }),

      ...(name !== undefined && {
        name:
          cleanString(name),
      }),

      ...(description !== undefined && {
        description:
          cleanString(
            description
          ) || null,
      }),

      ...(brand !== undefined && {
        brand:
          cleanString(brand) ||
          null,
      }),

      ...(finalImageUrl !== undefined && {
        imageUrl:
          finalImageUrl,
      }),

      ...(unit !== undefined && {
        unit:
          cleanString(unit) ||
          null,
      }),

      ...(weight !== undefined && {
        weight:
          cleanString(weight) ||
          null,
      }),

      ...(mrp !== undefined && {
        mrp:
          Number(mrp),
      }),

      ...(price !== undefined && {
        price:
          Number(price),
      }),

      ...(costPrice !== undefined && {
        costPrice:
          Number(costPrice),
      }),

      ...(stock !== undefined && {
        stock:
          parseNonNegativeInteger(
            stock
          ),
      }),

      ...(sortOrder !== undefined && {
        sortOrder:
          parseNonNegativeInteger(
            sortOrder
          ),
      }),

      ...(isActive !== undefined && {
        isActive:
          strictBoolean(
            isActive
          ),
      }),

      ...(isAvailable !== undefined && {
        isAvailable:
          strictBoolean(
            isAvailable
          ),
      }),

      ...(isFeatured !== undefined && {
        isFeatured:
          strictBoolean(
            isFeatured
          ),
      }),

      ...(isBestSeller !== undefined && {
        isBestSeller:
          strictBoolean(
            isBestSeller
          ),
      }),
    };

    if (!Object.keys(updateData).length) {
      return sendError(
        res,
        400,
        "No valid fields provided for update"
      );
    }

    /*
       Stock consistency
    */

    const resultingStock =
      updateData.stock !== undefined
        ? updateData.stock
        : existing.stock;

    if (resultingStock <= 0) {
      updateData.isAvailable =
        false;
    }

    const product =
      await prisma.martProduct.update({
        where: {
          id:
            existing.id,
        },

        data:
          updateData,

        include:
          productInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart product updated successfully",
      product,
      data: product,
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "update"
    );
  }
};

/* ============================================================
   PUBLIC PRODUCTS

   Customer app.

   Only returns:
   - Active product
   - Available product
   - Stock > 0
   - Active category
   - Available store
============================================================ */

export const getPublicMartProducts = async (
  req,
  res
) => {
  try {
    const {
      storeId,
      categoryId,
      search,
      brand,
      featured,
      bestSeller,
      minPrice,
      maxPrice,
      sortBy = "sortOrder",
      sortOrder = "asc",
    } = req.query;

    if (!cleanString(storeId)) {
      return sendError(
        res,
        400,
        "storeId is required"
      );
    }

    const page =
      parsePositiveInteger(
        req.query.page,
        DEFAULT_PAGE
      );

    const requestedLimit =
      parsePositiveInteger(
        req.query.limit,
        DEFAULT_LIMIT
      );

    const limit =
      Math.min(
        requestedLimit,
        MAX_LIMIT
      );

    const skip =
      (page - 1) * limit;

    /* ---------------- Store ---------------- */

    const store =
      await prisma.martStore.findFirst({
        where: {
          id:
            cleanString(storeId),

          deletedAt:
            null,

          isOpen:
            true,

          isVerified:
            true,

          isAcceptingOrders:
            true,
        },

        select: {
          id: true,
          name: true,
          deliveryFee: true,
          minimumOrder: true,
          deliveryTime: true,
        },
      });

    if (!store) {
      return sendError(
        res,
        404,
        "KartoMart store is currently unavailable"
      );
    }

    const where = {
      storeId:
        store.id,

      deletedAt:
        null,

      isActive:
        true,

      isAvailable:
        true,

      stock: {
        gt: 0,
      },

      category: {
        deletedAt:
          null,

        isActive:
          true,
      },
    };

    if (
      categoryId &&
      categoryId !== "ALL"
    ) {
      where.categoryId =
        cleanString(categoryId);
    }

    if (cleanString(search)) {
      const q =
        cleanString(search);

      where.OR = [
        {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },

        {
          description: {
            contains: q,
            mode: "insensitive",
          },
        },

        {
          brand: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    if (cleanString(brand)) {
      where.brand = {
        contains:
          cleanString(brand),

        mode:
          "insensitive",
      };
    }

    if (featured !== undefined) {
      const parsed =
        strictBoolean(
          featured
        );

      if (parsed === undefined) {
        return sendError(
          res,
          400,
          "featured must be true or false"
        );
      }

      where.isFeatured =
        parsed;
    }

    if (bestSeller !== undefined) {
      const parsed =
        strictBoolean(
          bestSeller
        );

      if (parsed === undefined) {
        return sendError(
          res,
          400,
          "bestSeller must be true or false"
        );
      }

      where.isBestSeller =
        parsed;
    }

    const min =
      parseNumber(minPrice);

    const max =
      parseNumber(maxPrice);

    if (
      min !== undefined ||
      max !== undefined
    ) {
      where.price = {
        ...(min !== undefined && {
          gte: min,
        }),

        ...(max !== undefined && {
          lte: max,
        }),
      };
    }

    const PUBLIC_SORT_FIELDS =
      new Set([
        "name",
        "price",
        "sortOrder",
        "createdAt",
      ]);

    const safeSortBy =
      PUBLIC_SORT_FIELDS.has(
        String(sortBy)
      )
        ? String(sortBy)
        : "sortOrder";

    const safeSortOrder =
      String(sortOrder)
        .toLowerCase() === "desc"
        ? "desc"
        : "asc";

    const [
      products,
      total,
    ] =
      await prisma.$transaction([
        prisma.martProduct.findMany({
          where,

          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },

            variants: {
              where: {
                deletedAt: null,
                isActive: true,
                isAvailable: true,
                stock: {
                  gt: 0,
                },
              },

              orderBy: {
                sortOrder: "asc",
              },
            },
          },

          skip,
          take: limit,

          orderBy: [
            {
              isFeatured:
                "desc",
            },

            {
              isBestSeller:
                "desc",
            },

            {
              [safeSortBy]:
                safeSortOrder,
            },

            {
              name:
                "asc",
            },
          ],
        }),

        prisma.martProduct.count({
          where,
        }),
      ]);

    const totalPages =
      Math.ceil(
        total / limit
      );

    return res.json({
      success: true,

      store,

      products,
      data: products,

      pagination: {
        page,
        limit,
        total,
        totalPages,

        hasNextPage:
          page < totalPages,

        hasPreviousPage:
          page > 1,
      },
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "fetch public products"
    );
  }
};

/* ============================================================
   UPDATE PRODUCT ACTIVE STATUS
============================================================ */

export const updateMartProductStatus =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isActive =
        strictBoolean(
          req.body.isActive
        );

      if (isActive === undefined) {
        return sendError(
          res,
          400,
          "isActive must be true or false"
        );
      }

      const existing =
        await prisma.martProduct.findFirst({
          where: {
            id:
              cleanString(id),

            deletedAt:
              null,
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      const product =
        await prisma.martProduct.update({
          where: {
            id:
              existing.id,
          },

          data: {
            isActive,

            ...(!isActive && {
              isAvailable:
                false,
            }),
          },

          include:
            productInclude,
        });

      return res.json({
        success: true,

        message:
          isActive
            ? "KartoMart product activated successfully"
            : "KartoMart product deactivated successfully",

        product,
        data: product,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "update status"
      );
    }
  };

/* ============================================================
   UPDATE AVAILABILITY
============================================================ */

export const updateMartProductAvailability =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isAvailable =
        strictBoolean(
          req.body.isAvailable
        );

      if (
        isAvailable === undefined
      ) {
        return sendError(
          res,
          400,
          "isAvailable must be true or false"
        );
      }

      const existing =
        await prisma.martProduct.findFirst({
          where: {
            id:
              cleanString(id),

            deletedAt:
              null,
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      if (
        isAvailable &&
        !existing.isActive
      ) {
        return sendError(
          res,
          409,
          "Activate the product before making it available"
        );
      }

      if (
        isAvailable &&
        existing.stock <= 0
      ) {
        return sendError(
          res,
          409,
          "Product cannot be available because it is out of stock"
        );
      }

      const product =
        await prisma.martProduct.update({
          where: {
            id:
              existing.id,
          },

          data: {
            isAvailable,
          },

          include:
            productInclude,
        });

      return res.json({
        success: true,

        message:
          isAvailable
            ? "Product is now available"
            : "Product marked unavailable",

        product,
        data: product,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "update availability"
      );
    }
  };

/* ============================================================
   FEATURE PRODUCT
============================================================ */

export const updateMartProductFeatured =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isFeatured =
        strictBoolean(
          req.body.isFeatured
        );

      if (
        isFeatured === undefined
      ) {
        return sendError(
          res,
          400,
          "isFeatured must be true or false"
        );
      }

      const existing =
        await prisma.martProduct.findFirst({
          where: {
            id:
              cleanString(id),

            deletedAt:
              null,
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      const product =
        await prisma.martProduct.update({
          where: {
            id:
              existing.id,
          },

          data: {
            isFeatured,
          },

          include:
            productInclude,
        });

      return res.json({
        success: true,

        message:
          isFeatured
            ? "Product marked as featured"
            : "Product removed from featured",

        product,
        data: product,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "update featured status"
      );
    }
  };

/* ============================================================
   BEST SELLER
============================================================ */

export const updateMartProductBestSeller =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isBestSeller =
        strictBoolean(
          req.body.isBestSeller
        );

      if (
        isBestSeller === undefined
      ) {
        return sendError(
          res,
          400,
          "isBestSeller must be true or false"
        );
      }

      const existing =
        await prisma.martProduct.findFirst({
          where: {
            id:
              cleanString(id),

            deletedAt:
              null,
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      const product =
        await prisma.martProduct.update({
          where: {
            id:
              existing.id,
          },

          data: {
            isBestSeller,
          },

          include:
            productInclude,
        });

      return res.json({
        success: true,

        message:
          isBestSeller
            ? "Product marked as best seller"
            : "Product removed from best sellers",

        product,
        data: product,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "update best seller"
      );
    }
  };

/* ============================================================
   ADJUST INVENTORY

   Body examples:

   Add stock:
   {
      "type": "ADD",
      "quantity": 20
   }

   Remove stock:
   {
      "type": "REMOVE",
      "quantity": 5
   }

   Set exact stock:
   {
      "type": "SET",
      "quantity": 100
   }
============================================================ */

export const adjustMartProductStock =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const type =
        cleanString(
          req.body.type
        )?.toUpperCase();

      const quantity =
        Number(
          req.body.quantity
        );

      if (
        ![
          "ADD",
          "REMOVE",
          "SET",
        ].includes(type)
      ) {
        return sendError(
          res,
          400,
          "type must be ADD, REMOVE or SET"
        );
      }

      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity < 0
      ) {
        return sendError(
          res,
          400,
          "quantity must be a non-negative integer"
        );
      }

      const product =
        await prisma.$transaction(
          async (tx) => {
            const existing =
              await tx.martProduct.findFirst({
                where: {
                  id:
                    cleanString(id),

                  deletedAt:
                    null,
                },
              });

            if (!existing) {
              const error =
                new Error(
                  "PRODUCT_NOT_FOUND"
                );

              throw error;
            }

            let newStock;

            switch (type) {
              case "ADD":
                newStock =
                  existing.stock +
                  quantity;
                break;

              case "REMOVE":
                if (
                  quantity >
                  existing.stock
                ) {
                  const error =
                    new Error(
                      "INSUFFICIENT_STOCK"
                    );

                  throw error;
                }

                newStock =
                  existing.stock -
                  quantity;
                break;

              case "SET":
                newStock =
                  quantity;
                break;

              default:
                newStock =
                  existing.stock;
            }

            return tx.martProduct.update({
              where: {
                id:
                  existing.id,
              },

              data: {
                stock:
                  newStock,

                ...(newStock <= 0 && {
                  isAvailable:
                    false,
                }),
              },

              include:
                productInclude,
            });
          }
        );

      return res.json({
        success: true,
        message:
          "Product stock updated successfully",
        product,
        data: product,
      });
    } catch (error) {
      if (
        error?.message ===
        "PRODUCT_NOT_FOUND"
      ) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      if (
        error?.message ===
        "INSUFFICIENT_STOCK"
      ) {
        return sendError(
          res,
          409,
          "Insufficient product stock"
        );
      }

      return handleMartProductError(
        res,
        error,
        "adjust stock"
      );
    }
  };

/* ============================================================
   SOFT DELETE PRODUCT
============================================================ */

export const deleteMartProduct = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id:
            cleanString(id),
        },
      });

    if (!existing) {
      return sendError(
        res,
        404,
        "KartoMart product not found"
      );
    }

    if (existing.deletedAt) {
      return sendError(
        res,
        409,
        "KartoMart product is already deleted"
      );
    }

    const product =
      await prisma.martProduct.update({
        where: {
          id:
            existing.id,
        },

        data: {
          deletedAt:
            new Date(),

          isActive:
            false,

          isAvailable:
            false,

          isFeatured:
            false,

          isBestSeller:
            false,
        },

        include:
          productInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart product deleted successfully",
      product,
      data: product,
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "delete"
    );
  }
};

/* ============================================================
   RESTORE PRODUCT
============================================================ */

export const restoreMartProduct = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id:
            cleanString(id),
        },
      });

    if (!existing) {
      return sendError(
        res,
        404,
        "KartoMart product not found"
      );
    }

    if (!existing.deletedAt) {
      return sendError(
        res,
        409,
        "KartoMart product is not deleted"
      );
    }

    const relation =
      await validateStoreAndCategory(
        existing.storeId,
        existing.categoryId
      );

    if (!relation.valid) {
      return sendError(
        res,
        409,
        "Parent KartoMart store or category is unavailable"
      );
    }

    /*
       Restore safely.

       Admin must activate it explicitly.
    */

    const product =
      await prisma.martProduct.update({
        where: {
          id:
            existing.id,
        },

        data: {
          deletedAt:
            null,

          isActive:
            false,

          isAvailable:
            false,

          isFeatured:
            false,

          isBestSeller:
            false,
        },

        include:
          productInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart product restored successfully",
      product,
      data: product,
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "restore"
    );
  }
};

/* ============================================================
   HARD DELETE PRODUCT

   Prevent if referenced by:
   - Cart
   - Orders
   - Other transactional data

   P2003 provides final DB protection.
============================================================ */

export const hardDeleteMartProduct = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id:
            cleanString(id),
        },

        include: {
          _count: {
            select: {
              variants: true,
              cartItems: true,
              orderItems: true,
            },
          },
        },
      });

    if (!existing) {
      return sendError(
        res,
        404,
        "KartoMart product not found"
      );
    }

    if (
      existing._count.cartItems > 0 ||
      existing._count.orderItems > 0
    ) {
      return sendError(
        res,
        409,
        "Product has cart/order history and cannot be permanently deleted. Use soft delete instead."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        /*
           Variants can be removed because there is
           no transactional product history.
        */

        if (
          existing._count.variants > 0
        ) {
          await tx.martProductVariant.deleteMany({
            where: {
              productId:
                existing.id,
            },
          });
        }

        await tx.martProduct.delete({
          where: {
            id:
              existing.id,
          },
        });
      }
    );

    return res.json({
      success: true,
      message:
        "KartoMart product permanently deleted successfully",
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "hard delete"
    );
  }
};

/* ============================================================
   BULK STATUS UPDATE

   Body:

   {
      "ids": ["id1", "id2"],
      "isActive": true,
      "isAvailable": true,
      "isFeatured": false
   }
============================================================ */

export const bulkUpdateMartProductStatus =
  async (req, res) => {
    try {
      const {
        ids,
        isActive,
        isAvailable,
        isFeatured,
        isBestSeller,
      } = req.body;

      if (
        !Array.isArray(ids) ||
        ids.length === 0
      ) {
        return sendError(
          res,
          400,
          "ids must be a non-empty array"
        );
      }

      const uniqueIds = [
        ...new Set(
          ids
            .map((id) =>
              cleanString(id)
            )
            .filter(Boolean)
        ),
      ];

      if (
        uniqueIds.length === 0
      ) {
        return sendError(
          res,
          400,
          "No valid product IDs provided"
        );
      }

      if (
        uniqueIds.length > 100
      ) {
        return sendError(
          res,
          400,
          "Maximum 100 products can be updated at once"
        );
      }

      const updateData = {};

      const fields = {
        isActive,
        isAvailable,
        isFeatured,
        isBestSeller,
      };

      for (const [
        field,
        value,
      ] of Object.entries(
        fields
      )) {
        if (value !== undefined) {
          const parsed =
            strictBoolean(value);

          if (parsed === undefined) {
            return sendError(
              res,
              400,
              `${field} must be true or false`
            );
          }

          updateData[field] =
            parsed;
        }
      }

      if (!Object.keys(updateData).length) {
        return sendError(
          res,
          400,
          "Provide at least one status field"
        );
      }

      if (
        updateData.isActive === false
      ) {
        updateData.isAvailable =
          false;
      }

      /*
         Don't bulk enable unavailable zero-stock items.
      */

      const where = {
        id: {
          in:
            uniqueIds,
        },

        deletedAt:
          null,

        ...(updateData.isAvailable === true && {
          stock: {
            gt: 0,
          },

          isActive:
            true,
        }),
      };

      const result =
        await prisma.martProduct.updateMany({
          where,
          data:
            updateData,
        });

      return res.json({
        success: true,

        message:
          "KartoMart products updated successfully",

        data: {
          requested:
            uniqueIds.length,

          updated:
            result.count,
        },
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "bulk status update"
      );
    }
  };

/* ============================================================
   PRODUCT STATS
============================================================ */

export const getMartProductStats = async (
  req,
  res
) => {
  try {
    const {
      storeId,
      categoryId,
    } = req.query;

    const baseWhere = {
      deletedAt:
        null,

      ...(storeId &&
        storeId !== "ALL" && {
          storeId:
            cleanString(storeId),
        }),

      ...(categoryId &&
        categoryId !== "ALL" && {
          categoryId:
            cleanString(
              categoryId
            ),
        }),
    };

    const [
      totalProducts,
      activeProducts,
      availableProducts,
      outOfStockProducts,
      featuredProducts,
      bestSellerProducts,
      deletedProducts,
      stockAggregate,
    ] =
      await prisma.$transaction([
        prisma.martProduct.count({
          where:
            baseWhere,
        }),

        prisma.martProduct.count({
          where: {
            ...baseWhere,
            isActive:
              true,
          },
        }),

        prisma.martProduct.count({
          where: {
            ...baseWhere,
            isActive:
              true,
            isAvailable:
              true,
            stock: {
              gt: 0,
            },
          },
        }),

        prisma.martProduct.count({
          where: {
            ...baseWhere,
            stock: {
              lte: 0,
            },
          },
        }),

        prisma.martProduct.count({
          where: {
            ...baseWhere,
            isFeatured:
              true,
          },
        }),

        prisma.martProduct.count({
          where: {
            ...baseWhere,
            isBestSeller:
              true,
          },
        }),

        prisma.martProduct.count({
          where: {
            deletedAt: {
              not: null,
            },

            ...(storeId &&
              storeId !== "ALL" && {
                storeId:
                  cleanString(
                    storeId
                  ),
              }),

            ...(categoryId &&
              categoryId !== "ALL" && {
                categoryId:
                  cleanString(
                    categoryId
                  ),
              }),
          },
        }),

        prisma.martProduct.aggregate({
          where:
            baseWhere,

          _sum: {
            stock: true,
          },

          _avg: {
            price: true,
            costPrice: true,
          },
        }),
      ]);

    const stats = {
      totalProducts,
      activeProducts,
      availableProducts,
      outOfStockProducts,
      featuredProducts,
      bestSellerProducts,
      deletedProducts,

      totalStock:
        stockAggregate._sum.stock ??
        0,

      averageSellingPrice:
        stockAggregate._avg.price ??
        0,

      averageCostPrice:
        stockAggregate._avg.costPrice ??
        0,
    };

    return res.json({
      success: true,
      stats,
      data: stats,
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "fetch statistics"
    );
  }
};