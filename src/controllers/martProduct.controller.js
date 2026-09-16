import prisma from "../prisma.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";

/* ============================================================
   KARTOMART PRODUCT CONTROLLER

   IMPORTANT:
   - MartProduct = product master only.
   - Price / MRP / costPrice / stock / quantity / unit / SKU /
     barcode are stored in MartProductVariant.
   - Existing product endpoints are preserved.
   - Variant endpoints are included as well.
============================================================ */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const PRODUCT_SORT_FIELDS = new Set([
  "name",
  "brand",
  "sortOrder",
  "isActive",
  "isAvailable",
  "isFeatured",
  "isPopular",
  "isBestSeller",
  "rating",
  "totalReviews",
  "createdAt",
  "updatedAt",
]);

const VARIANT_SORT_FIELDS = new Set([
  "label",
  "quantity",
  "unit",
  "mrp",
  "price",
  "costPrice",
  "stock",
  "sortOrder",
  "isDefault",
  "isActive",
  "isAvailable",
  "createdAt",
  "updatedAt",
]);

const MART_UNITS = new Set([
  "G",
  "KG",
  "ML",
  "L",
  "PCS",
  "PACK",
  "DOZEN",
]);

const STOCK_TYPES = new Set([
  "ADD",
  "REMOVE",
  "SET",
  "ADJUSTMENT",
]);

/* ============================================================
   BASIC HELPERS
============================================================ */

const cleanString = (value) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
};

const nullableString = (value) => {
  const cleaned = cleanString(value);
  return cleaned ? cleaned : null;
};

const strictBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "yes", "y", "active", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "n", "inactive", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
};

const boolValue = (value, fallback = false) => {
  const parsed = strictBoolean(value);
  return parsed === undefined ? fallback : parsed;
};

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const parseNonNegativeNumber = (value, fallback) => {
  const number = parseNumber(value);

  if (number === undefined) return fallback;
  if (number < 0) return undefined;

  return number;
};

const parsePositiveNumber = (value, fallback) => {
  const number = parseNumber(value);

  if (number === undefined) return fallback;
  if (number <= 0) return undefined;

  return number;
};

const parseInteger = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
};

const parseNonNegativeInteger = (value, fallback) => {
  const number = parseInteger(value, fallback);

  if (number === undefined) return undefined;
  if (number < 0) return undefined;

  return number;
};

const getPagination = (query) => {
  const page = Math.max(
    1,
    parseInteger(query.page, DEFAULT_PAGE) || DEFAULT_PAGE
  );

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInteger(query.limit, DEFAULT_LIMIT) || DEFAULT_LIMIT
    )
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const getSortOrder = (value) => {
  return String(value || "desc").toLowerCase() === "asc"
    ? "asc"
    : "desc";
};

const sendError = (res, status, message, errors) => {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
};

const uploadImage = async (req, folder) => {
  if (!req.file) return undefined;
  return uploadToCloudinary(req.file, folder);
};

/* ============================================================
   COMMON INCLUDES
============================================================ */

const variantOrderBy = [
  { isDefault: "desc" },
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

const productInclude = {
  store: {
    select: {
      id: true,
      name: true,
      cityId: true,
      isActive: true,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,
    },
  },

  category: {
    select: {
      id: true,
      storeId: true,
      name: true,
      imageUrl: true,
      isActive: true,
      deletedAt: true,
    },
  },

  variants: {
    where: {
      deletedAt: null,
    },
    orderBy: variantOrderBy,
  },
};

const publicProductInclude = {
  store: {
    select: {
      id: true,
      name: true,
      cityId: true,
      imageUrl: true,
      bannerUrl: true,
      minimumOrderAmount: true,
      deliveryFee: true,
      freeDeliveryAbove: true,
      platformFee: true,
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
    orderBy: variantOrderBy,
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
    const target = Array.isArray(error?.meta?.target)
      ? error.meta.target.join(", ")
      : error?.meta?.target;

    return sendError(
      res,
      409,
      target
        ? `Duplicate value for ${target}`
        : "A product or variant with the same unique data already exists"
    );
  }

  if (error?.code === "P2003") {
    return sendError(
      res,
      400,
      "Invalid KartoMart store, category, product or variant relation"
    );
  }

  if (error?.code === "P2025") {
    return sendError(
      res,
      404,
      "KartoMart product or variant not found"
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
   VALIDATION
============================================================ */

const validateProductPayload = (
  body,
  isUpdate = false
) => {
  const errors = {};

  if (!isUpdate) {
    if (!cleanString(body.storeId)) {
      errors.storeId = "KartoMart store ID is required";
    }

    if (!cleanString(body.categoryId)) {
      errors.categoryId = "Category ID is required";
    }

    if (!cleanString(body.name)) {
      errors.name = "Product name is required";
    }
  }

  if (
    body.name !== undefined &&
    !cleanString(body.name)
  ) {
    errors.name = "Product name cannot be empty";
  }

  if (
    body.name !== undefined &&
    cleanString(body.name)?.length > 255
  ) {
    errors.name =
      "Product name cannot exceed 255 characters";
  }

  if (
    body.brand !== undefined &&
    cleanString(body.brand)?.length > 150
  ) {
    errors.brand =
      "Brand cannot exceed 150 characters";
  }

  if (
    body.description !== undefined &&
    cleanString(body.description)?.length > 5000
  ) {
    errors.description =
      "Description cannot exceed 5000 characters";
  }

  if (body.sortOrder !== undefined) {
    if (
      parseNonNegativeInteger(body.sortOrder) === undefined
    ) {
      errors.sortOrder =
        "sortOrder must be a non-negative integer";
    }
  }

  const booleanFields = [
    "isActive",
    "isAvailable",
    "isFeatured",
    "isPopular",
    "isBestSeller",
  ];

  for (const field of booleanFields) {
    if (
      body[field] !== undefined &&
      strictBoolean(body[field]) === undefined
    ) {
      errors[field] =
        `${field} must be true or false`;
    }
  }

  return errors;
};

const validateVariantPayload = (
  body,
  isUpdate = false
) => {
  const errors = {};

  if (!isUpdate) {
    if (!cleanString(body.label)) {
      errors.label = "Variant label is required";
    }

    if (
      body.quantity === undefined ||
      body.quantity === null ||
      body.quantity === ""
    ) {
      errors.quantity = "Variant quantity is required";
    }

    if (!cleanString(body.unit)) {
      errors.unit = "Variant unit is required";
    }

    if (
      body.mrp === undefined ||
      body.mrp === null ||
      body.mrp === ""
    ) {
      errors.mrp = "MRP is required";
    }

    if (
      body.price === undefined ||
      body.price === null ||
      body.price === ""
    ) {
      errors.price = "Selling price is required";
    }
  }

  if (
    body.label !== undefined &&
    !cleanString(body.label)
  ) {
    errors.label = "Variant label cannot be empty";
  }

  if (
    body.label !== undefined &&
    cleanString(body.label)?.length > 100
  ) {
    errors.label =
      "Variant label cannot exceed 100 characters";
  }

  if (body.quantity !== undefined) {
    if (
      parsePositiveNumber(body.quantity) === undefined
    ) {
      errors.quantity =
        "quantity must be greater than 0";
    }
  }

  if (body.unit !== undefined) {
    const unit = cleanString(body.unit)?.toUpperCase();

    if (!MART_UNITS.has(unit)) {
      errors.unit =
        "unit must be G, KG, ML, L, PCS, PACK or DOZEN";
    }
  }

  for (const field of ["mrp", "price", "costPrice"]) {
    if (
      body[field] !== undefined &&
      parseNonNegativeNumber(body[field]) === undefined
    ) {
      errors[field] =
        `${field} must be a valid non-negative number`;
    }
  }

  if (body.stock !== undefined) {
    if (
      parseNonNegativeInteger(body.stock) === undefined
    ) {
      errors.stock =
        "stock must be a non-negative integer";
    }
  }

  if (body.sortOrder !== undefined) {
    if (
      parseNonNegativeInteger(body.sortOrder) === undefined
    ) {
      errors.sortOrder =
        "sortOrder must be a non-negative integer";
    }
  }

  for (const field of [
    "isDefault",
    "isAvailable",
    "isActive",
  ]) {
    if (
      body[field] !== undefined &&
      strictBoolean(body[field]) === undefined
    ) {
      errors[field] =
        `${field} must be true or false`;
    }
  }

  if (
    body.sku !== undefined &&
    cleanString(body.sku)?.length > 120
  ) {
    errors.sku =
      "SKU cannot exceed 120 characters";
  }

  if (
    body.barcode !== undefined &&
    cleanString(body.barcode)?.length > 150
  ) {
    errors.barcode =
      "Barcode cannot exceed 150 characters";
  }

  return errors;
};

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
   STORE / CATEGORY VALIDATION
============================================================ */

const validateStoreAndCategory = async (
  storeId,
  categoryId,
  tx = prisma
) => {
  const store = await tx.martStore.findFirst({
    where: {
      id: cleanString(storeId),
      deletedAt: null,
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

  if (!categoryId) {
    return {
      valid: true,
      store,
      category: null,
    };
  }

  const category = await tx.martCategory.findFirst({
    where: {
      id: cleanString(categoryId),
      storeId: store.id,
      deletedAt: null,
    },
  });

  if (!category) {
    return {
      valid: false,
      status: 404,
      message:
        "KartoMart category not found in this store",
    };
  }

  if (!category.isActive) {
    return {
      valid: false,
      status: 409,
      message: "KartoMart category is inactive",
    };
  }

  return {
    valid: true,
    store,
    category,
  };
};

/* ============================================================
   VARIANT HELPERS
============================================================ */

const buildVariantCreateData = (
  body,
  productId,
  defaults = {}
) => {
  const stock =
    parseNonNegativeInteger(
      body.stock,
      defaults.stock ?? 0
    ) ?? 0;

  const isActive = boolValue(
    body.isActive,
    defaults.isActive ?? true
  );

  let isAvailable = boolValue(
    body.isAvailable,
    defaults.isAvailable ?? true
  );

  if (!isActive || stock <= 0) {
    isAvailable = false;
  }

  return {
    productId,
    label:
      cleanString(body.label) ||
      defaults.label,

    quantity:
      parsePositiveNumber(
        body.quantity,
        defaults.quantity
      ),

    unit:
      cleanString(
        body.unit || defaults.unit
      )?.toUpperCase(),

    mrp:
      parseNonNegativeNumber(
        body.mrp,
        defaults.mrp
      ),

    price:
      parseNonNegativeNumber(
        body.price,
        defaults.price
      ),

    costPrice:
      parseNonNegativeNumber(
        body.costPrice,
        defaults.costPrice ?? 0
      ) ?? 0,

    stock,

    sku:
      nullableString(
        body.sku ?? defaults.sku
      ),

    barcode:
      nullableString(
        body.barcode ?? defaults.barcode
      ),

    isDefault: boolValue(
      body.isDefault,
      defaults.isDefault ?? false
    ),

    isAvailable,
    isActive,

    sortOrder:
      parseNonNegativeInteger(
        body.sortOrder,
        defaults.sortOrder ?? 0
      ) ?? 0,
  };
};

const syncProductAvailability = async (
  tx,
  productId
) => {
  const product =
    await tx.martProduct.findUnique({
      where: {
        id: productId,
      },
      select: {
        id: true,
        isActive: true,
        deletedAt: true,
      },
    });

  if (!product) return;

  const availableVariantCount =
    await tx.martProductVariant.count({
      where: {
        productId,
        deletedAt: null,
        isActive: true,
        isAvailable: true,
        stock: {
          gt: 0,
        },
      },
    });

  const shouldBeAvailable =
    product.deletedAt === null &&
    product.isActive &&
    availableVariantCount > 0;

  await tx.martProduct.update({
    where: {
      id: productId,
    },
    data: {
      isAvailable:
        shouldBeAvailable,
    },
  });
};

const ensureDefaultVariant = async (
  tx,
  productId
) => {
  const currentDefault =
    await tx.martProductVariant.findFirst({
      where: {
        productId,
        deletedAt: null,
        isDefault: true,
      },
    });

  if (currentDefault) return;

  const firstVariant =
    await tx.martProductVariant.findFirst({
      where: {
        productId,
        deletedAt: null,
      },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

  if (firstVariant) {
    await tx.martProductVariant.update({
      where: {
        id: firstVariant.id,
      },
      data: {
        isDefault: true,
      },
    });
  }
};

const getDefaultVariant = async (
  productId,
  tx = prisma
) => {
  let variant =
    await tx.martProductVariant.findFirst({
      where: {
        productId,
        deletedAt: null,
        isDefault: true,
      },
      orderBy: variantOrderBy,
    });

  if (!variant) {
    variant =
      await tx.martProductVariant.findFirst({
        where: {
          productId,
          deletedAt: null,
        },
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      });
  }

  return variant;
};

const buildLegacyVariantFromProductBody = (
  body
) => {
  const hasVariantData = [
    "unit",
    "weight",
    "quantity",
    "mrp",
    "price",
    "costPrice",
    "stock",
    "sku",
    "barcode",
    "variantLabel",
  ].some(
    (key) =>
      body[key] !== undefined &&
      body[key] !== null &&
      body[key] !== ""
  );

  if (!hasVariantData) return null;

  let quantity =
    parsePositiveNumber(body.quantity);

  let unit =
    cleanString(body.unit)?.toUpperCase();

  const weight =
    cleanString(body.weight);

  if (
    (!quantity || !unit) &&
    weight
  ) {
    const match =
      weight.match(
        /^(\d+(?:\.\d+)?)\s*(G|KG|ML|L|PCS|PACK|DOZEN)$/i
      );

    if (match) {
      quantity =
        quantity ||
        Number(match[1]);

      unit =
        unit ||
        match[2].toUpperCase();
    }
  }

  if (!quantity) quantity = 1;
  if (!unit) unit = "PCS";

  const label =
    cleanString(body.variantLabel) ||
    weight ||
    `${quantity} ${unit}`;

  return {
    label,
    quantity,
    unit,
    mrp: body.mrp,
    price: body.price,
    costPrice: body.costPrice,
    stock: body.stock,
    sku: body.sku,
    barcode: body.barcode,
    isDefault: true,
    isActive:
      body.isActive,
    isAvailable:
      body.isAvailable,
    sortOrder: 0,
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
      sortOrder,
      isActive,
      isAvailable,
      isFeatured,
      isPopular,
      isBestSeller,
    } = req.body;

    const cleanStoreId =
      cleanString(storeId);

    const cleanCategoryId =
      cleanString(categoryId);

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

    let finalImageUrl =
      nullableString(imageUrl);

    if (req.file) {
      try {
        finalImageUrl =
          await uploadImage(
            req,
            "karto/mart/products"
          );
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

    const legacyVariant =
      buildLegacyVariantFromProductBody(
        req.body
      );

    let requestedVariants = [];

    if (Array.isArray(req.body.variants)) {
      requestedVariants =
        req.body.variants;
    } else if (
      typeof req.body.variants === "string" &&
      req.body.variants.trim()
    ) {
      try {
        const parsed =
          JSON.parse(req.body.variants);

        if (Array.isArray(parsed)) {
          requestedVariants = parsed;
        }
      } catch {
        return sendError(
          res,
          400,
          "variants must be a valid JSON array"
        );
      }
    }

    if (
      !requestedVariants.length &&
      legacyVariant
    ) {
      requestedVariants = [
        legacyVariant,
      ];
    }

    for (
      let index = 0;
      index < requestedVariants.length;
      index++
    ) {
      const variantErrors =
        validateVariantPayload(
          requestedVariants[index],
          false
        );

      if (
        Object.keys(
          variantErrors
        ).length
      ) {
        return sendError(
          res,
          400,
          `Variant ${index + 1} validation failed`,
          variantErrors
        );
      }

      const priceValidation =
        validatePrices({
          mrp:
            parseNonNegativeNumber(
              requestedVariants[index].mrp
            ),
          price:
            parseNonNegativeNumber(
              requestedVariants[index].price
            ),
          costPrice:
            parseNonNegativeNumber(
              requestedVariants[index].costPrice,
              0
            ),
        });

      if (!priceValidation.valid) {
        return sendError(
          res,
          400,
          `Variant ${index + 1}: ${priceValidation.message}`
        );
      }
    }

    const product =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.martProduct.create({
              data: {
                storeId:
                  cleanStoreId,

                categoryId:
                  cleanCategoryId,

                name:
                  cleanString(name),

                description:
                  nullableString(
                    description
                  ),

                brand:
                  nullableString(
                    brand
                  ),

                imageUrl:
                  finalImageUrl,

                sortOrder:
                  parseNonNegativeInteger(
                    sortOrder,
                    0
                  ) ?? 0,

                isActive:
                  boolValue(
                    isActive,
                    true
                  ),

                isAvailable:
                  false,

                isFeatured:
                  boolValue(
                    isFeatured,
                    false
                  ),

                isPopular:
                  boolValue(
                    isPopular,
                    false
                  ),

                isBestSeller:
                  boolValue(
                    isBestSeller,
                    false
                  ),
              },
            });

          if (
            requestedVariants.length
          ) {
            for (
              let index = 0;
              index <
              requestedVariants.length;
              index++
            ) {
              const variant =
                requestedVariants[index];

              const data =
                buildVariantCreateData(
                  {
                    ...variant,
                    isDefault:
                      variant.isDefault !==
                      undefined
                        ? variant.isDefault
                        : index === 0,
                  },
                  created.id
                );

              if (data.isDefault) {
                await tx.martProductVariant.updateMany({
                  where: {
                    productId:
                      created.id,
                    deletedAt:
                      null,
                    isDefault:
                      true,
                  },
                  data: {
                    isDefault:
                      false,
                  },
                });
              }

              await tx.martProductVariant.create({
                data,
              });
            }

            await ensureDefaultVariant(
              tx,
              created.id
            );
          }

          await syncProductAvailability(
            tx,
            created.id
          );

          if (
            isAvailable !== undefined &&
            strictBoolean(
              isAvailable
            ) === false
          ) {
            await tx.martProduct.update({
              where: {
                id: created.id,
              },
              data: {
                isAvailable:
                  false,
              },
            });
          }

          return tx.martProduct.findUnique({
            where: {
              id: created.id,
            },
            include:
              productInclude,
          });
        }
      );

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
   ADMIN PRODUCT LIST
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
      isPopular,
      isBestSeller,
      minPrice,
      maxPrice,
      minStock,
      maxStock,
      includeDeleted,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const where = {};

    if (
      strictBoolean(
        includeDeleted
      ) !== true
    ) {
      where.deletedAt =
        null;
    }

    if (cleanString(storeId)) {
      where.storeId =
        cleanString(storeId);
    }

    if (cleanString(categoryId)) {
      where.categoryId =
        cleanString(categoryId);
    }

    if (cleanString(search)) {
      const term =
        cleanString(search);

      where.OR = [
        {
          name: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          brand: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          variants: {
            some: {
              deletedAt: null,
              OR: [
                {
                  label: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
                {
                  sku: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
                {
                  barcode: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
        },
      ];
    }

    if (cleanString(brand)) {
      where.brand = {
        contains:
          cleanString(brand),
        mode: "insensitive",
      };
    }

    const productBooleans = {
      isActive,
      isAvailable,
      isFeatured,
      isPopular,
      isBestSeller,
    };

    for (
      const [key, value] of
      Object.entries(
        productBooleans
      )
    ) {
      const parsed =
        strictBoolean(value);

      if (parsed !== undefined) {
        where[key] = parsed;
      }
    }

    const variantFilters = {
      deletedAt: null,
    };

    const parsedMinPrice =
      parseNonNegativeNumber(
        minPrice
      );

    const parsedMaxPrice =
      parseNonNegativeNumber(
        maxPrice
      );

    const parsedMinStock =
      parseNonNegativeInteger(
        minStock
      );

    const parsedMaxStock =
      parseNonNegativeInteger(
        maxStock
      );

    if (
      parsedMinPrice !== undefined ||
      parsedMaxPrice !== undefined
    ) {
      variantFilters.price = {};

      if (
        parsedMinPrice !== undefined
      ) {
        variantFilters.price.gte =
          parsedMinPrice;
      }

      if (
        parsedMaxPrice !== undefined
      ) {
        variantFilters.price.lte =
          parsedMaxPrice;
      }
    }

    if (
      parsedMinStock !== undefined ||
      parsedMaxStock !== undefined
    ) {
      variantFilters.stock = {};

      if (
        parsedMinStock !== undefined
      ) {
        variantFilters.stock.gte =
          parsedMinStock;
      }

      if (
        parsedMaxStock !== undefined
      ) {
        variantFilters.stock.lte =
          parsedMaxStock;
      }
    }

    if (
      Object.keys(
        variantFilters
      ).length > 1
    ) {
      where.variants = {
        some:
          variantFilters,
      };
    }

    let orderBy;

    if (
      ["price", "mrp", "costPrice", "stock"].includes(
        sortBy
      )
    ) {
      orderBy = [
        {
          sortOrder:
            "asc",
        },
        {
          createdAt:
            getSortOrder(
              sortOrder
            ),
        },
      ];
    } else {
      const safeSortBy =
        PRODUCT_SORT_FIELDS.has(
          sortBy
        )
          ? sortBy
          : "createdAt";

      orderBy = {
        [safeSortBy]:
          getSortOrder(
            sortOrder
          ),
      };
    }

    const [
      products,
      total,
    ] =
      await prisma.$transaction([
        prisma.martProduct.findMany({
          where,
          include:
            productInclude,
          orderBy,
          skip,
          take: limit,
        }),

        prisma.martProduct.count({
          where,
        }),
      ]);

    return res.json({
      success: true,
      message:
        "KartoMart products fetched successfully",
      products,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
        hasNextPage:
          page * limit <
          total,
        hasPreviousPage:
          page > 1,
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
    const id =
      cleanString(
        req.params.id
      );

    const includeDeleted =
      strictBoolean(
        req.query.includeDeleted
      ) === true;

    const product =
      await prisma.martProduct.findFirst({
        where: {
          id,
          ...(!includeDeleted && {
            deletedAt: null,
          }),
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
      message:
        "KartoMart product fetched successfully",
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
    const id =
      cleanString(
        req.params.id
      );

    const existing =
      await prisma.martProduct.findFirst({
        where: {
          id,
          deletedAt: null,
        },
        include: {
          variants: {
            where: {
              deletedAt: null,
            },
            orderBy:
              variantOrderBy,
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
      sortOrder,
      isActive,
      isAvailable,
      isFeatured,
      isPopular,
      isBestSeller,
    } = req.body;

    const finalStoreId =
      storeId !== undefined
        ? cleanString(
            storeId
          )
        : existing.storeId;

    const finalCategoryId =
      categoryId !== undefined
        ? cleanString(
            categoryId
          )
        : existing.categoryId;

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

    let finalImageUrl;

    if (req.file) {
      try {
        finalImageUrl =
          await uploadImage(
            req,
            "karto/mart/products"
          );
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
    } else if (
      imageUrl !== undefined
    ) {
      finalImageUrl =
        nullableString(
          imageUrl
        );
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
          nullableString(
            description
          ),
      }),

      ...(brand !== undefined && {
        brand:
          nullableString(
            brand
          ),
      }),

      ...(finalImageUrl !== undefined && {
        imageUrl:
          finalImageUrl,
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

      ...(isFeatured !== undefined && {
        isFeatured:
          strictBoolean(
            isFeatured
          ),
      }),

      ...(isPopular !== undefined && {
        isPopular:
          strictBoolean(
            isPopular
          ),
      }),

      ...(isBestSeller !== undefined && {
        isBestSeller:
          strictBoolean(
            isBestSeller
          ),
      }),
    };

    const legacyVariant =
      buildLegacyVariantFromProductBody(
        req.body
      );

    const product =
      await prisma.$transaction(
        async (tx) => {
          if (
            Object.keys(
              updateData
            ).length
          ) {
            await tx.martProduct.update({
              where: {
                id:
                  existing.id,
              },
              data:
                updateData,
            });
          }

          if (legacyVariant) {
            let variant =
              await getDefaultVariant(
                existing.id,
                tx
              );

            if (!variant) {
              const variantErrors =
                validateVariantPayload(
                  legacyVariant,
                  false
                );

              if (
                Object.keys(
                  variantErrors
                ).length
              ) {
                const error =
                  new Error(
                    Object.values(
                      variantErrors
                    )[0]
                  );

                error.statusCode =
                  400;

                throw error;
              }

              const variantData =
                buildVariantCreateData(
                  legacyVariant,
                  existing.id
                );

              const priceValidation =
                validatePrices(
                  variantData
                );

              if (
                !priceValidation.valid
              ) {
                const error =
                  new Error(
                    priceValidation.message
                  );

                error.statusCode =
                  400;

                throw error;
              }

              await tx.martProductVariant.create({
                data:
                  variantData,
              });
            } else {
              const variantData = {};

              if (
                req.body.variantLabel !== undefined ||
                req.body.weight !== undefined
              ) {
                variantData.label =
                  cleanString(
                    req.body.variantLabel
                  ) ||
                  cleanString(
                    req.body.weight
                  ) ||
                  variant.label;
              }

              if (
                req.body.quantity !== undefined
              ) {
                variantData.quantity =
                  parsePositiveNumber(
                    req.body.quantity
                  );
              }

              if (
                req.body.unit !== undefined
              ) {
                variantData.unit =
                  cleanString(
                    req.body.unit
                  )?.toUpperCase();
              }

              if (
                req.body.mrp !== undefined
              ) {
                variantData.mrp =
                  parseNonNegativeNumber(
                    req.body.mrp
                  );
              }

              if (
                req.body.price !== undefined
              ) {
                variantData.price =
                  parseNonNegativeNumber(
                    req.body.price
                  );
              }

              if (
                req.body.costPrice !== undefined
              ) {
                variantData.costPrice =
                  parseNonNegativeNumber(
                    req.body.costPrice
                  );
              }

              if (
                req.body.stock !== undefined
              ) {
                variantData.stock =
                  parseNonNegativeInteger(
                    req.body.stock
                  );
              }

              if (
                req.body.sku !== undefined
              ) {
                variantData.sku =
                  nullableString(
                    req.body.sku
                  );
              }

              if (
                req.body.barcode !== undefined
              ) {
                variantData.barcode =
                  nullableString(
                    req.body.barcode
                  );
              }

              if (
                req.body.isAvailable !== undefined
              ) {
                variantData.isAvailable =
                  strictBoolean(
                    req.body.isAvailable
                  );
              }

              if (
                req.body.isActive !== undefined
              ) {
                variantData.isActive =
                  strictBoolean(
                    req.body.isActive
                  );
              }

              const resulting = {
                mrp:
                  variantData.mrp ??
                  Number(
                    variant.mrp
                  ),
                price:
                  variantData.price ??
                  Number(
                    variant.price
                  ),
                costPrice:
                  variantData.costPrice ??
                  Number(
                    variant.costPrice
                  ),
              };

              const priceValidation =
                validatePrices(
                  resulting
                );

              if (
                !priceValidation.valid
              ) {
                const error =
                  new Error(
                    priceValidation.message
                  );

                error.statusCode =
                  400;

                throw error;
              }

              const resultingStock =
                variantData.stock ??
                variant.stock;

              const resultingActive =
                variantData.isActive ??
                variant.isActive;

              if (
                resultingStock <= 0 ||
                !resultingActive
              ) {
                variantData.isAvailable =
                  false;
              }

              if (
                Object.keys(
                  variantData
                ).length
              ) {
                await tx.martProductVariant.update({
                  where: {
                    id:
                      variant.id,
                  },
                  data:
                    variantData,
                });
              }
            }
          }

          await syncProductAvailability(
            tx,
            existing.id
          );

          if (
            isAvailable !== undefined &&
            strictBoolean(
              isAvailable
            ) === false
          ) {
            await tx.martProduct.update({
              where: {
                id:
                  existing.id,
              },
              data: {
                isAvailable:
                  false,
              },
            });
          }

          return tx.martProduct.findUnique({
            where: {
              id:
                existing.id,
            },
            include:
              productInclude,
          });
        }
      );

    return res.json({
      success: true,
      message:
        "KartoMart product updated successfully",
      product,
      data: product,
    });
  } catch (error) {
    if (error?.statusCode) {
      return sendError(
        res,
        error.statusCode,
        error.message
      );
    }

    return handleMartProductError(
      res,
      error,
      "update"
    );
  }
};

/* ============================================================
   PUBLIC PRODUCTS
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
      popular,
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
        "KartoMart store ID is required"
      );
    }

    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const where = {
      storeId:
        cleanString(storeId),

      deletedAt:
        null,

      isActive:
        true,

      isAvailable:
        true,

      store: {
        deletedAt:
          null,

        isActive:
          true,

        isOpen:
          true,

        isVerified:
          true,

        isAcceptingOrders:
          true,
      },

      variants: {
        some: {
          deletedAt:
            null,

          isActive:
            true,

          isAvailable:
            true,

          stock: {
            gt: 0,
          },
        },
      },
    };

    if (cleanString(categoryId)) {
      where.categoryId =
        cleanString(categoryId);

      where.category = {
        deletedAt:
          null,
        isActive:
          true,
      };
    } else {
      where.OR = [
        {
          categoryId:
            null,
        },
        {
          category: {
            deletedAt:
              null,
            isActive:
              true,
          },
        },
      ];
    }

    if (cleanString(search)) {
      const term =
        cleanString(search);

      const searchFilter = [
        {
          name: {
            contains:
              term,
            mode:
              "insensitive",
          },
        },
        {
          brand: {
            contains:
              term,
            mode:
              "insensitive",
          },
        },
        {
          description: {
            contains:
              term,
            mode:
              "insensitive",
          },
        },
        {
          variants: {
            some: {
              deletedAt:
                null,
              isActive:
                true,
              OR: [
                {
                  label: {
                    contains:
                      term,
                    mode:
                      "insensitive",
                  },
                },
                {
                  sku: {
                    contains:
                      term,
                    mode:
                      "insensitive",
                  },
                },
              ],
            },
          },
        },
      ];

      if (where.OR) {
        where.AND = [
          {
            OR:
              where.OR,
          },
          {
            OR:
              searchFilter,
          },
        ];

        delete where.OR;
      } else {
        where.OR =
          searchFilter;
      }
    }

    if (cleanString(brand)) {
      where.brand = {
        contains:
          cleanString(brand),
        mode:
          "insensitive",
      };
    }

    if (
      strictBoolean(featured) !==
      undefined
    ) {
      where.isFeatured =
        strictBoolean(featured);
    }

    if (
      strictBoolean(popular) !==
      undefined
    ) {
      where.isPopular =
        strictBoolean(popular);
    }

    if (
      strictBoolean(bestSeller) !==
      undefined
    ) {
      where.isBestSeller =
        strictBoolean(bestSeller);
    }

    const parsedMinPrice =
      parseNonNegativeNumber(
        minPrice
      );

    const parsedMaxPrice =
      parseNonNegativeNumber(
        maxPrice
      );

    if (
      parsedMinPrice !== undefined ||
      parsedMaxPrice !== undefined
    ) {
      const price = {};

      if (
        parsedMinPrice !== undefined
      ) {
        price.gte =
          parsedMinPrice;
      }

      if (
        parsedMaxPrice !== undefined
      ) {
        price.lte =
          parsedMaxPrice;
      }

      where.variants = {
        some: {
          deletedAt:
            null,
          isActive:
            true,
          isAvailable:
            true,
          stock: {
            gt: 0,
          },
          price,
        },
      };
    }

    const safeSortBy =
      PRODUCT_SORT_FIELDS.has(
        sortBy
      )
        ? sortBy
        : "sortOrder";

    const [
      products,
      total,
    ] =
      await prisma.$transaction([
        prisma.martProduct.findMany({
          where,
          include:
            publicProductInclude,
          orderBy: [
            {
              [safeSortBy]:
                getSortOrder(
                  sortOrder
                ),
            },
            {
              createdAt:
                "desc",
            },
          ],
          skip,
          take:
            limit,
        }),

        prisma.martProduct.count({
          where,
        }),
      ]);

    return res.json({
      success: true,
      message:
        "KartoMart products fetched successfully",
      products,
      data:
        products,
      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
        hasNextPage:
          page * limit <
          total,
        hasPreviousPage:
          page > 1,
      },
    });
  } catch (error) {
    return handleMartProductError(
      res,
      error,
      "fetch public"
    );
  }
};

/* ============================================================
   UPDATE PRODUCT STATUS
============================================================ */

export const updateMartProductStatus =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      const isActive =
        strictBoolean(
          req.body.isActive
        );

      if (
        isActive === undefined
      ) {
        return sendError(
          res,
          400,
          "isActive must be true or false"
        );
      }

      const existing =
        await prisma.martProduct.findFirst({
          where: {
            id,
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
        await prisma.$transaction(
          async (tx) => {
            await tx.martProduct.update({
              where: {
                id,
              },
              data: {
                isActive,
                ...(!isActive && {
                  isAvailable:
                    false,
                }),
              },
            });

            if (!isActive) {
              await tx.martProductVariant.updateMany({
                where: {
                  productId:
                    id,
                  deletedAt:
                    null,
                },
                data: {
                  isAvailable:
                    false,
                },
              });
            }

            await syncProductAvailability(
              tx,
              id
            );

            return tx.martProduct.findUnique({
              where: {
                id,
              },
              include:
                productInclude,
            });
          }
        );

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
   UPDATE PRODUCT AVAILABILITY
============================================================ */

export const updateMartProductAvailability =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

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
            id,
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

      if (isAvailable) {
        const availableVariant =
          await prisma.martProductVariant.findFirst({
            where: {
              productId:
                id,
              deletedAt:
                null,
              isActive:
                true,
              isAvailable:
                true,
              stock: {
                gt: 0,
              },
            },
          });

        if (!availableVariant) {
          return sendError(
            res,
            409,
            "Product cannot be available because no active in-stock variant is available"
          );
        }
      }

      const product =
        await prisma.martProduct.update({
          where: {
            id,
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
      const id =
        cleanString(
          req.params.id
        );

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
            id,
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
            id,
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
   POPULAR PRODUCT
============================================================ */

export const updateMartProductPopular =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

      const isPopular =
        strictBoolean(
          req.body.isPopular
        );

      if (
        isPopular === undefined
      ) {
        return sendError(
          res,
          400,
          "isPopular must be true or false"
        );
      }

      const existing =
        await prisma.martProduct.findFirst({
          where: {
            id,
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
            id,
          },
          data: {
            isPopular,
          },
          include:
            productInclude,
        });

      return res.json({
        success: true,
        message:
          isPopular
            ? "Product marked as popular"
            : "Product removed from popular",
        product,
        data: product,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "update popular status"
      );
    }
  };

/* ============================================================
   BEST SELLER
============================================================ */

export const updateMartProductBestSeller =
  async (req, res) => {
    try {
      const id =
        cleanString(
          req.params.id
        );

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
            id,
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
            id,
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
        "update best seller status"
      );
    }
  };

/* ============================================================
   CREATE VARIANT
============================================================ */

export const createMartProductVariant =
  async (req, res) => {
    try {
      const productId =
        cleanString(
          req.params.id ||
          req.body.productId
        );

      if (!productId) {
        return sendError(
          res,
          400,
          "Product ID is required"
        );
      }

      const product =
        await prisma.martProduct.findFirst({
          where: {
            id:
              productId,
            deletedAt:
              null,
          },
        });

      if (!product) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      const errors =
        validateVariantPayload(
          req.body,
          false
        );

      if (
        Object.keys(
          errors
        ).length
      ) {
        return sendError(
          res,
          400,
          "Validation failed",
          errors
        );
      }

      const data =
        buildVariantCreateData(
          req.body,
          productId
        );

      const priceValidation =
        validatePrices(data);

      if (
        !priceValidation.valid
      ) {
        return sendError(
          res,
          400,
          priceValidation.message
        );
      }

      const variant =
        await prisma.$transaction(
          async (tx) => {
            const existingCount =
              await tx.martProductVariant.count({
                where: {
                  productId,
                  deletedAt:
                    null,
                },
              });

            if (
              data.isDefault ||
              existingCount === 0
            ) {
              await tx.martProductVariant.updateMany({
                where: {
                  productId,
                  deletedAt:
                    null,
                  isDefault:
                    true,
                },
                data: {
                  isDefault:
                    false,
                },
              });

              data.isDefault =
                true;
            }

            const created =
              await tx.martProductVariant.create({
                data,
              });

            await ensureDefaultVariant(
              tx,
              productId
            );

            await syncProductAvailability(
              tx,
              productId
            );

            return created;
          }
        );

      return res.status(201).json({
        success: true,
        message:
          "KartoMart product variant created successfully",
        variant,
        data: variant,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "create variant"
      );
    }
  };

/* ============================================================
   GET VARIANTS
============================================================ */

export const getMartProductVariants =
  async (req, res) => {
    try {
      const productId =
        cleanString(
          req.params.id ||
          req.params.productId ||
          req.query.productId
        );

      if (!productId) {
        return sendError(
          res,
          400,
          "Product ID is required"
        );
      }

      const includeDeleted =
        strictBoolean(
          req.query.includeDeleted
        ) === true;

      const {
        page,
        limit,
        skip,
      } = getPagination(
        req.query
      );

      const where = {
        productId,
        ...(!includeDeleted && {
          deletedAt:
            null,
        }),
      };

      if (
        req.query.isActive !==
        undefined
      ) {
        const parsed =
          strictBoolean(
            req.query.isActive
          );

        if (
          parsed !== undefined
        ) {
          where.isActive =
            parsed;
        }
      }

      if (
        req.query.isAvailable !==
        undefined
      ) {
        const parsed =
          strictBoolean(
            req.query.isAvailable
          );

        if (
          parsed !== undefined
        ) {
          where.isAvailable =
            parsed;
        }
      }

      if (
        req.query.unit
      ) {
        const unit =
          cleanString(
            req.query.unit
          )?.toUpperCase();

        if (
          MART_UNITS.has(
            unit
          )
        ) {
          where.unit =
            unit;
        }
      }

      const sortBy =
        VARIANT_SORT_FIELDS.has(
          req.query.sortBy
        )
          ? req.query.sortBy
          : "sortOrder";

      const [
        variants,
        total,
      ] =
        await prisma.$transaction([
          prisma.martProductVariant.findMany({
            where,
            orderBy: [
              {
                [sortBy]:
                  getSortOrder(
                    req.query.sortOrder ||
                    "asc"
                  ),
              },
              {
                createdAt:
                  "asc",
              },
            ],
            skip,
            take:
              limit,
          }),

          prisma.martProductVariant.count({
            where,
          }),
        ]);

      return res.json({
        success: true,
        message:
          "KartoMart product variants fetched successfully",
        variants,
        data:
          variants,
        pagination: {
          page,
          limit,
          total,
          totalPages:
            Math.ceil(
              total / limit
            ),
          hasNextPage:
            page * limit <
            total,
          hasPreviousPage:
            page > 1,
        },
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "fetch variants"
      );
    }
  };

/* ============================================================
   UPDATE VARIANT
============================================================ */

export const updateMartProductVariant =
  async (req, res) => {
    try {
      const variantId =
        cleanString(
          req.params.variantId ||
          req.params.id
        );

      const existing =
        await prisma.martProductVariant.findFirst({
          where: {
            id:
              variantId,
            deletedAt:
              null,
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product variant not found"
        );
      }

      const errors =
        validateVariantPayload(
          req.body,
          true
        );

      if (
        Object.keys(
          errors
        ).length
      ) {
        return sendError(
          res,
          400,
          "Validation failed",
          errors
        );
      }

      const updateData = {};

      if (
        req.body.label !== undefined
      ) {
        updateData.label =
          cleanString(
            req.body.label
          );
      }

      if (
        req.body.quantity !== undefined
      ) {
        updateData.quantity =
          parsePositiveNumber(
            req.body.quantity
          );
      }

      if (
        req.body.unit !== undefined
      ) {
        updateData.unit =
          cleanString(
            req.body.unit
          )?.toUpperCase();
      }

      if (
        req.body.mrp !== undefined
      ) {
        updateData.mrp =
          parseNonNegativeNumber(
            req.body.mrp
          );
      }

      if (
        req.body.price !== undefined
      ) {
        updateData.price =
          parseNonNegativeNumber(
            req.body.price
          );
      }

      if (
        req.body.costPrice !== undefined
      ) {
        updateData.costPrice =
          parseNonNegativeNumber(
            req.body.costPrice
          );
      }

      if (
        req.body.stock !== undefined
      ) {
        updateData.stock =
          parseNonNegativeInteger(
            req.body.stock
          );
      }

      if (
        req.body.sku !== undefined
      ) {
        updateData.sku =
          nullableString(
            req.body.sku
          );
      }

      if (
        req.body.barcode !== undefined
      ) {
        updateData.barcode =
          nullableString(
            req.body.barcode
          );
      }

      if (
        req.body.isDefault !== undefined
      ) {
        updateData.isDefault =
          strictBoolean(
            req.body.isDefault
          );
      }

      if (
        req.body.isActive !== undefined
      ) {
        updateData.isActive =
          strictBoolean(
            req.body.isActive
          );
      }

      if (
        req.body.isAvailable !== undefined
      ) {
        updateData.isAvailable =
          strictBoolean(
            req.body.isAvailable
          );
      }

      if (
        req.body.sortOrder !== undefined
      ) {
        updateData.sortOrder =
          parseNonNegativeInteger(
            req.body.sortOrder
          );
      }

      if (
        !Object.keys(
          updateData
        ).length
      ) {
        return sendError(
          res,
          400,
          "No valid variant fields provided for update"
        );
      }

      const priceValidation =
        validatePrices({
          mrp:
            updateData.mrp ??
            Number(
              existing.mrp
            ),

          price:
            updateData.price ??
            Number(
              existing.price
            ),

          costPrice:
            updateData.costPrice ??
            Number(
              existing.costPrice
            ),
        });

      if (
        !priceValidation.valid
      ) {
        return sendError(
          res,
          400,
          priceValidation.message
        );
      }

      const resultingStock =
        updateData.stock ??
        existing.stock;

      const resultingActive =
        updateData.isActive ??
        existing.isActive;

      if (
        resultingStock <= 0 ||
        !resultingActive
      ) {
        updateData.isAvailable =
          false;
      }

      const variant =
        await prisma.$transaction(
          async (tx) => {
            if (
              updateData.isDefault ===
              true
            ) {
              await tx.martProductVariant.updateMany({
                where: {
                  productId:
                    existing.productId,
                  id: {
                    not:
                      existing.id,
                  },
                  deletedAt:
                    null,
                },
                data: {
                  isDefault:
                    false,
                },
              });
            }

            const updated =
              await tx.martProductVariant.update({
                where: {
                  id:
                    existing.id,
                },
                data:
                  updateData,
              });

            if (
              updateData.isDefault ===
              false &&
              existing.isDefault
            ) {
              await ensureDefaultVariant(
                tx,
                existing.productId
              );
            }

            await syncProductAvailability(
              tx,
              existing.productId
            );

            return updated;
          }
        );

      return res.json({
        success: true,
        message:
          "KartoMart product variant updated successfully",
        variant,
        data: variant,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "update variant"
      );
    }
  };

/* ============================================================
   DELETE VARIANT
============================================================ */

export const deleteMartProductVariant =
  async (req, res) => {
    try {
      const variantId =
        cleanString(
          req.params.variantId ||
          req.params.id
        );

      const existing =
        await prisma.martProductVariant.findUnique({
          where: {
            id:
              variantId,
          },
        });

      if (
        !existing ||
        existing.deletedAt
      ) {
        return sendError(
          res,
          404,
          "KartoMart product variant not found"
        );
      }

      const variant =
        await prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.martProductVariant.update({
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
                  isDefault:
                    false,
                },
              });

            await ensureDefaultVariant(
              tx,
              existing.productId
            );

            await syncProductAvailability(
              tx,
              existing.productId
            );

            return updated;
          }
        );

      return res.json({
        success: true,
        message:
          "KartoMart product variant deleted successfully",
        variant,
        data: variant,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "delete variant"
      );
    }
  };

/* ============================================================
   RESTORE VARIANT
============================================================ */

export const restoreMartProductVariant =
  async (req, res) => {
    try {
      const variantId =
        cleanString(
          req.params.variantId ||
          req.params.id
        );

      const existing =
        await prisma.martProductVariant.findUnique({
          where: {
            id:
              variantId,
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product variant not found"
        );
      }

      if (!existing.deletedAt) {
        return sendError(
          res,
          409,
          "KartoMart product variant is not deleted"
        );
      }

      const product =
        await prisma.martProduct.findFirst({
          where: {
            id:
              existing.productId,
            deletedAt:
              null,
          },
        });

      if (!product) {
        return sendError(
          res,
          409,
          "Restore the parent product first"
        );
      }

      const variant =
        await prisma.$transaction(
          async (tx) => {
            const activeCount =
              await tx.martProductVariant.count({
                where: {
                  productId:
                    existing.productId,
                  deletedAt:
                    null,
                },
              });

            const updated =
              await tx.martProductVariant.update({
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
                  isDefault:
                    activeCount ===
                    0,
                },
              });

            await ensureDefaultVariant(
              tx,
              existing.productId
            );

            await syncProductAvailability(
              tx,
              existing.productId
            );

            return updated;
          }
        );

      return res.json({
        success: true,
        message:
          "KartoMart product variant restored successfully",
        variant,
        data: variant,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "restore variant"
      );
    }
  };

/* ============================================================
   HARD DELETE VARIANT
============================================================ */

export const hardDeleteMartProductVariant =
  async (req, res) => {
    try {
      const variantId =
        cleanString(
          req.params.variantId ||
          req.params.id
        );

      const existing =
        await prisma.martProductVariant.findUnique({
          where: {
            id:
              variantId,
          },
          include: {
            _count: {
              select: {
                cartItems:
                  true,
                orderItems:
                  true,
                stockMovements:
                  true,
              },
            },
          },
        });

      if (!existing) {
        return sendError(
          res,
          404,
          "KartoMart product variant not found"
        );
      }

      if (
        existing._count.orderItems >
        0
      ) {
        return sendError(
          res,
          409,
          "Variant cannot be permanently deleted because it has order history"
        );
      }

      await prisma.$transaction(
        async (tx) => {
          await tx.martCartItem.deleteMany({
            where: {
              variantId:
                existing.id,
            },
          });

          await tx.martStockMovement.deleteMany({
            where: {
              variantId:
                existing.id,
            },
          });

          await tx.martProductVariant.delete({
            where: {
              id:
                existing.id,
            },
          });

          await ensureDefaultVariant(
            tx,
            existing.productId
          );

          await syncProductAvailability(
            tx,
            existing.productId
          );
        }
      );

      return res.json({
        success: true,
        message:
          "KartoMart product variant permanently deleted successfully",
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "hard delete variant"
      );
    }
  };

/* ============================================================
   STOCK ADJUSTMENT

   req.params.id = productId
   req.body.variantId optional.
   If omitted, default variant is used.
============================================================ */

export const adjustMartProductStock =
  async (req, res) => {
    try {
      const productId =
        cleanString(
          req.params.id
        );

      const variantId =
        cleanString(
          req.body.variantId
        );

      const type =
        cleanString(
          req.body.type ||
          "SET"
        )?.toUpperCase();

      const quantity =
        parseNonNegativeInteger(
          req.body.quantity
        );

      const reason =
        nullableString(
          req.body.reason
        );

      if (
        !STOCK_TYPES.has(
          type
        )
      ) {
        return sendError(
          res,
          400,
          "type must be ADD, REMOVE, SET or ADJUSTMENT"
        );
      }

      if (
        quantity === undefined
      ) {
        return sendError(
          res,
          400,
          "quantity must be a non-negative integer"
        );
      }

      const product =
        await prisma.martProduct.findFirst({
          where: {
            id:
              productId,
            deletedAt:
              null,
          },
        });

      if (!product) {
        return sendError(
          res,
          404,
          "KartoMart product not found"
        );
      }

      let variant;

      if (variantId) {
        variant =
          await prisma.martProductVariant.findFirst({
            where: {
              id:
                variantId,
              productId,
              deletedAt:
                null,
            },
          });
      } else {
        variant =
          await getDefaultVariant(
            productId
          );
      }

      if (!variant) {
        return sendError(
          res,
          404,
          variantId
            ? "Product variant not found"
            : "Default product variant not found"
        );
      }

      const previousStock =
        variant.stock;

      let newStock;

      if (type === "ADD") {
        newStock =
          previousStock +
          quantity;
      } else if (
        type === "REMOVE"
      ) {
        newStock =
          previousStock -
          quantity;
      } else {
        newStock =
          quantity;
      }

      if (newStock < 0) {
        return sendError(
          res,
          409,
          `Insufficient stock. Current stock is ${previousStock}`
        );
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            const updatedVariant =
              await tx.martProductVariant.update({
                where: {
                  id:
                    variant.id,
                },
                data: {
                  stock:
                    newStock,

                  isAvailable:
                    newStock >
                      0 &&
                    variant.isActive,
                },
              });

            await tx.martStockMovement.create({
              data: {
                productId,
                variantId:
                  variant.id,
                type,
                quantity,
                previousStock,
                newStock,
                reason,
              },
            });

            await syncProductAvailability(
              tx,
              productId
            );

            const updatedProduct =
              await tx.martProduct.findUnique({
                where: {
                  id:
                    productId,
                },
                include:
                  productInclude,
              });

            return {
              updatedVariant,
              updatedProduct,
            };
          }
        );

      return res.json({
        success: true,
        message:
          "Product stock updated successfully",
        previousStock,
        newStock,
        variant:
          result.updatedVariant,
        product:
          result.updatedProduct,
        data:
          result.updatedProduct,
      });
    } catch (error) {
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
    const id =
      cleanString(
        req.params.id
      );

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id,
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
      await prisma.$transaction(
        async (tx) => {
          await tx.martProductVariant.updateMany({
            where: {
              productId:
                id,
              deletedAt:
                null,
            },
            data: {
              isActive:
                false,
              isAvailable:
                false,
            },
          });

          return tx.martProduct.update({
            where: {
              id,
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
              isPopular:
                false,
              isBestSeller:
                false,
            },
            include:
              productInclude,
          });
        }
      );

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
    const id =
      cleanString(
        req.params.id
      );

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id,
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

    const product =
      await prisma.$transaction(
        async (tx) => {
          await tx.martProduct.update({
            where: {
              id,
            },
            data: {
              deletedAt:
                null,

              // Safe restore:
              // admin activates it explicitly.
              isActive:
                false,

              isAvailable:
                false,
            },
          });

          return tx.martProduct.findUnique({
            where: {
              id,
            },
            include:
              productInclude,
          });
        }
      );

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
============================================================ */

export const hardDeleteMartProduct = async (
  req,
  res
) => {
  try {
    const id =
      cleanString(
        req.params.id
      );

    const existing =
      await prisma.martProduct.findUnique({
        where: {
          id,
        },
        include: {
          _count: {
            select: {
              variants:
                true,
              cartItems:
                true,
              orderItems:
                true,
              stockMovements:
                true,
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
      existing._count.orderItems >
      0
    ) {
      return sendError(
        res,
        409,
        "Product cannot be permanently deleted because it has order history"
      );
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.martCartItem.deleteMany({
          where: {
            productId:
              id,
          },
        });

        await tx.martStockMovement.deleteMany({
          where: {
            productId:
              id,
          },
        });

        await tx.martProductVariant.deleteMany({
          where: {
            productId:
              id,
          },
        });

        await tx.martProduct.delete({
          where: {
            id,
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
   BULK UPDATE PRODUCT STATUS
============================================================ */

export const bulkUpdateMartProductStatus =
  async (req, res) => {
    try {
      const {
        ids,
        isActive,
      } = req.body;

      if (
        !Array.isArray(ids) ||
        !ids.length
      ) {
        return sendError(
          res,
          400,
          "ids must be a non-empty array"
        );
      }

      const cleanIds = [
        ...new Set(
          ids
            .map(
              cleanString
            )
            .filter(
              Boolean
            )
        ),
      ];

      if (!cleanIds.length) {
        return sendError(
          res,
          400,
          "No valid product IDs provided"
        );
      }

      const finalStatus =
        strictBoolean(
          isActive
        );

      if (
        finalStatus === undefined
      ) {
        return sendError(
          res,
          400,
          "isActive must be true or false"
        );
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            const updateResult =
              await tx.martProduct.updateMany({
                where: {
                  id: {
                    in:
                      cleanIds,
                  },
                  deletedAt:
                    null,
                },
                data: {
                  isActive:
                    finalStatus,

                  ...(!finalStatus && {
                    isAvailable:
                      false,
                  }),
                },
              });

            if (!finalStatus) {
              await tx.martProductVariant.updateMany({
                where: {
                  productId: {
                    in:
                      cleanIds,
                  },
                  deletedAt:
                    null,
                },
                data: {
                  isAvailable:
                    false,
                },
              });
            }

            for (
              const productId of
              cleanIds
            ) {
              await syncProductAvailability(
                tx,
                productId
              );
            }

            return updateResult;
          }
        );

      return res.json({
        success: true,
        message:
          finalStatus
            ? "KartoMart products activated successfully"
            : "KartoMart products deactivated successfully",
        updatedCount:
          result.count,
        data: {
          updatedCount:
            result.count,
        },
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "bulk update status"
      );
    }
  };

/* ============================================================
   PRODUCT STATS
============================================================ */

export const getMartProductStats =
  async (req, res) => {
    try {
      const storeId =
        cleanString(
          req.query.storeId
        );

      const productWhere = {
        deletedAt:
          null,
        ...(storeId && {
          storeId,
        }),
      };

      const variantWhere = {
        deletedAt:
          null,
        ...(storeId && {
          product: {
            storeId,
            deletedAt:
              null,
          },
        }),
      };

      const [
        totalProducts,
        activeProducts,
        availableProducts,
        featuredProducts,
        popularProducts,
        bestSellerProducts,
        totalVariants,
        activeVariants,
        availableVariants,
        outOfStockVariants,
        lowStockVariants,
        totalStockAggregate,
      ] =
        await prisma.$transaction([
          prisma.martProduct.count({
            where:
              productWhere,
          }),

          prisma.martProduct.count({
            where: {
              ...productWhere,
              isActive:
                true,
            },
          }),

          prisma.martProduct.count({
            where: {
              ...productWhere,
              isAvailable:
                true,
            },
          }),

          prisma.martProduct.count({
            where: {
              ...productWhere,
              isFeatured:
                true,
            },
          }),

          prisma.martProduct.count({
            where: {
              ...productWhere,
              isPopular:
                true,
            },
          }),

          prisma.martProduct.count({
            where: {
              ...productWhere,
              isBestSeller:
                true,
            },
          }),

          prisma.martProductVariant.count({
            where:
              variantWhere,
          }),

          prisma.martProductVariant.count({
            where: {
              ...variantWhere,
              isActive:
                true,
            },
          }),

          prisma.martProductVariant.count({
            where: {
              ...variantWhere,
              isActive:
                true,
              isAvailable:
                true,
              stock: {
                gt: 0,
              },
            },
          }),

          prisma.martProductVariant.count({
            where: {
              ...variantWhere,
              stock:
                0,
            },
          }),

          prisma.martProductVariant.count({
            where: {
              ...variantWhere,
              stock: {
                gt: 0,
                lte: 10,
              },
            },
          }),

          prisma.martProductVariant.aggregate({
            where:
              variantWhere,
            _sum: {
              stock:
                true,
            },
          }),
        ]);

      const stats = {
        totalProducts,
        activeProducts,
        inactiveProducts:
          totalProducts -
          activeProducts,

        availableProducts,
        unavailableProducts:
          totalProducts -
          availableProducts,

        featuredProducts,
        popularProducts,
        bestSellerProducts,

        totalVariants,
        activeVariants,
        availableVariants,
        outOfStockVariants,
        lowStockVariants,

        totalStock:
          totalStockAggregate
            ._sum
            .stock || 0,
      };

      return res.json({
        success: true,
        message:
          "KartoMart product statistics fetched successfully",
        stats,
        data:
          stats,
      });
    } catch (error) {
      return handleMartProductError(
        res,
        error,
        "fetch statistics"
      );
    }
  };

/* ============================================================
   OPTIONAL ALIASES

   These aliases help if an older routes file used slightly
   different controller names.
============================================================ */

export const createMartVariant =
  createMartProductVariant;

export const getMartVariants =
  getMartProductVariants;

export const updateMartVariant =
  updateMartProductVariant;

export const deleteMartVariant =
  deleteMartProductVariant;

export const restoreMartVariant =
  restoreMartProductVariant;

export const hardDeleteMartVariant =
  hardDeleteMartProductVariant;
