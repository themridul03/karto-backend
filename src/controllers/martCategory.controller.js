import prisma from "../prisma.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";

/* ============================================================
   KARTOMART CATEGORY CONTROLLER

   Architecture:
   Karto
     └── KartoMart Store
           └── MartCategory
                 └── MartProduct

   Managed directly by Karto/Admin.
============================================================ */

/* ============================================================
   CONSTANTS
============================================================ */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = new Set([
  "name",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
]);

/* ============================================================
   HELPERS
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

const parsePositiveInteger = (
  value,
  fallback
) => {
  const parsed = Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
};

const parseSortOrder = (value, fallback = 0) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    return undefined;
  }

  return parsed;
};

const fileUrl = async (
  req,
  folder = "misc"
) => {
  if (!req.file) {
    return undefined;
  }

  return await uploadToCloudinary(
    req.file,
    folder
  );
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

/* ============================================================
   COMMON INCLUDE
============================================================ */

const categoryInclude = {
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

  _count: {
    select: {
      products: true,
    },
  },
};

/* ============================================================
   ERROR HANDLER
============================================================ */

const handleMartCategoryError = (
  res,
  error,
  action = "process"
) => {
  console.error(
    `KartoMart Category ${action} Error:`,
    error
  );

  if (error?.code === "P2002") {
    return sendError(
      res,
      409,
      "A category with the same unique data already exists"
    );
  }

  if (error?.code === "P2003") {
    return sendError(
      res,
      400,
      "Invalid KartoMart store/category relation"
    );
  }

  if (error?.code === "P2025") {
    return sendError(
      res,
      404,
      "KartoMart category not found"
    );
  }

  return sendError(
    res,
    500,
    error?.message ||
      `Unable to ${action} KartoMart category`
  );
};

/* ============================================================
   VALIDATION
============================================================ */

const validateCategoryPayload = (
  body,
  isUpdate = false
) => {
  const errors = {};

  if (!isUpdate) {
    if (!cleanString(body.storeId)) {
      errors.storeId =
        "KartoMart store ID is required";
    }

    if (!cleanString(body.name)) {
      errors.name =
        "Category name is required";
    }
  }

  if (
    body.storeId !== undefined &&
    !cleanString(body.storeId)
  ) {
    errors.storeId =
      "Store ID cannot be empty";
  }

  if (
    body.name !== undefined &&
    !cleanString(body.name)
  ) {
    errors.name =
      "Category name cannot be empty";
  }

  if (
    body.name &&
    cleanString(body.name).length > 120
  ) {
    errors.name =
      "Category name cannot exceed 120 characters";
  }

  if (
    body.description &&
    cleanString(body.description).length > 1000
  ) {
    errors.description =
      "Description cannot exceed 1000 characters";
  }

  if (body.sortOrder !== undefined) {
    const sortOrder =
      parseSortOrder(body.sortOrder);

    if (sortOrder === undefined) {
      errors.sortOrder =
        "sortOrder must be a non-negative integer";
    }
  }

  if (
    body.isActive !== undefined &&
    strictBoolean(body.isActive) === undefined
  ) {
    errors.isActive =
      "isActive must be true or false";
  }

  return errors;
};

/* ============================================================
   CHECK STORE
============================================================ */

const getActiveMartStore = async (storeId) => {
  if (!storeId) {
    return null;
  }

  return await prisma.martStore.findFirst({
    where: {
      id: storeId,
      deletedAt: null,
    },

    select: {
      id: true,
      name: true,
      cityId: true,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,
    },
  });
};

/* ============================================================
   CREATE CATEGORY
============================================================ */

export const createMartCategory = async (
  req,
  res
) => {
  try {
    const errors =
      validateCategoryPayload(
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
      name,
      description,
      imageUrl,
      sortOrder = 0,
      isActive = true,
    } = req.body;

    /* ---------------- Store validation ---------------- */

    const store =
      await getActiveMartStore(
        cleanString(storeId)
      );

    if (!store) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    /* ---------------- Duplicate validation ---------------- */

    const existingCategory =
      await prisma.martCategory.findFirst({
        where: {
          storeId: cleanString(storeId),

          name: {
            equals: cleanString(name),
            mode: "insensitive",
          },

          deletedAt: null,
        },

        select: {
          id: true,
        },
      });

    if (existingCategory) {
      return sendError(
        res,
        409,
        "This category already exists in the selected KartoMart store"
      );
    }

    /* ---------------- Cloudinary ---------------- */

    let finalImageUrl =
      cleanString(imageUrl) || null;

    if (req.file) {
      try {
        const uploadedUrl =
          await fileUrl(
            req,
            "karto-mart/categories"
          );

        if (uploadedUrl) {
          finalImageUrl =
            uploadedUrl;
        }
      } catch (uploadError) {
        console.error(
          "MartCategory Cloudinary Upload Error:",
          uploadError
        );

        return sendError(
          res,
          500,
          "Category image upload failed"
        );
      }
    }

    /* ---------------- Create ---------------- */

    const category =
      await prisma.martCategory.create({
        data: {
          storeId:
            cleanString(storeId),

          name:
            cleanString(name),

          description:
            cleanString(description) || null,

          imageUrl:
            finalImageUrl,

          sortOrder:
            parseSortOrder(
              sortOrder,
              0
            ),

          isActive:
            boolValue(
              isActive,
              true
            ),
        },

        include:
          categoryInclude,
      });

    return res.status(201).json({
      success: true,
      message:
        "KartoMart category created successfully",
      category,
      data: category,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "create"
    );
  }
};

/* ============================================================
   GET ALL CATEGORIES - ADMIN

   Query examples:

   ?page=1&limit=20
   ?storeId=xxx
   ?search=grocery
   ?isActive=true
   ?sortBy=sortOrder
   ?sortOrder=asc
   ?includeDeleted=true
   ?onlyDeleted=true
============================================================ */

export const getMartCategories = async (
  req,
  res
) => {
  try {
    const {
      storeId,
      search,
      isActive,
      includeDeleted,
      onlyDeleted,
      sortBy = "sortOrder",
      sortOrder = "asc",
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

    const limit = Math.min(
      requestedLimit,
      MAX_LIMIT
    );

    const skip =
      (page - 1) * limit;

    const where = {};

    /* ---------------- Store ---------------- */

    if (
      storeId &&
      storeId !== "ALL"
    ) {
      where.storeId =
        cleanString(storeId);
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
      ];
    }

    /* ---------------- Active ---------------- */

    if (isActive !== undefined) {
      const parsed =
        strictBoolean(isActive);

      if (parsed === undefined) {
        return sendError(
          res,
          400,
          "isActive must be true or false"
        );
      }

      where.isActive =
        parsed;
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
        : "sortOrder";

    const safeSortOrder =
      String(sortOrder)
        .toLowerCase() === "desc"
        ? "desc"
        : "asc";

    const [
      categories,
      total,
    ] =
      await prisma.$transaction([
        prisma.martCategory.findMany({
          where,

          include:
            categoryInclude,

          skip,
          take: limit,

          orderBy: [
            {
              [safeSortBy]:
                safeSortOrder,
            },

            ...(safeSortBy !== "name"
              ? [
                  {
                    name: "asc",
                  },
                ]
              : []),
          ],
        }),

        prisma.martCategory.count({
          where,
        }),
      ]);

    const totalPages =
      Math.ceil(
        total / limit
      );

    return res.json({
      success: true,

      categories,
      data: categories,

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
    return handleMartCategoryError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   GET CATEGORY BY ID
============================================================ */

export const getMartCategoryById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (!cleanString(id)) {
      return sendError(
        res,
        400,
        "Category ID is required"
      );
    }

    const category =
      await prisma.martCategory.findFirst({
        where: {
          id:
            cleanString(id),

          deletedAt:
            null,
        },

        include: {
          store: {
            select: {
              id: true,
              name: true,
              cityId: true,
              isOpen: true,
              isVerified: true,
            },
          },

          _count: {
            select: {
              products: true,
            },
          },
        },
      });

    if (!category) {
      return sendError(
        res,
        404,
        "KartoMart category not found"
      );
    }

    return res.json({
      success: true,
      category,
      data: category,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   UPDATE CATEGORY
============================================================ */

export const updateMartCategory = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existingCategory =
      await prisma.martCategory.findUnique({
        where: {
          id:
            cleanString(id),
        },
      });

    if (!existingCategory) {
      return sendError(
        res,
        404,
        "KartoMart category not found"
      );
    }

    if (existingCategory.deletedAt) {
      return sendError(
        res,
        409,
        "Deleted category cannot be updated. Restore it first."
      );
    }

    const errors =
      validateCategoryPayload(
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
      name,
      description,
      imageUrl,
      sortOrder,
      isActive,
    } = req.body;

    const finalStoreId =
      storeId !== undefined
        ? cleanString(storeId)
        : existingCategory.storeId;

    const finalName =
      name !== undefined
        ? cleanString(name)
        : existingCategory.name;

    /* ---------------- Store validation ---------------- */

    if (storeId !== undefined) {
      const store =
        await getActiveMartStore(
          finalStoreId
        );

      if (!store) {
        return sendError(
          res,
          404,
          "KartoMart store not found"
        );
      }
    }

    /* ---------------- Duplicate validation ---------------- */

    if (
      storeId !== undefined ||
      name !== undefined
    ) {
      const duplicate =
        await prisma.martCategory.findFirst({
          where: {
            storeId:
              finalStoreId,

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
                existingCategory.id,
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
          "This category already exists in the selected KartoMart store"
        );
      }
    }

    /* ---------------- Cloudinary ---------------- */

    let finalImageUrl;

    if (req.file) {
      try {
        finalImageUrl =
          await fileUrl(
            req,
            "karto-mart/categories"
          );
      } catch (uploadError) {
        console.error(
          "MartCategory Cloudinary Update Error:",
          uploadError
        );

        return sendError(
          res,
          500,
          "Category image upload failed"
        );
      }
    } else if (imageUrl !== undefined) {
      finalImageUrl =
        cleanString(imageUrl) || null;
    }

    /* ---------------- Update ---------------- */

    const updateData = {
      ...(storeId !== undefined && {
        storeId:
          finalStoreId,
      }),

      ...(name !== undefined && {
        name:
          finalName,
      }),

      ...(description !== undefined && {
        description:
          cleanString(description) || null,
      }),

      ...(finalImageUrl !== undefined && {
        imageUrl:
          finalImageUrl,
      }),

      ...(sortOrder !== undefined && {
        sortOrder:
          parseSortOrder(sortOrder),
      }),

      ...(isActive !== undefined && {
        isActive:
          strictBoolean(isActive),
      }),
    };

    if (!Object.keys(updateData).length) {
      return sendError(
        res,
        400,
        "No valid fields provided for update"
      );
    }

    const category =
      await prisma.martCategory.update({
        where: {
          id:
            existingCategory.id,
        },

        data:
          updateData,

        include:
          categoryInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart category updated successfully",
      category,
      data: category,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "update"
    );
  }
};

/* ============================================================
   ACTIVATE / DEACTIVATE CATEGORY
============================================================ */

export const updateMartCategoryStatus =
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

      const existingCategory =
        await prisma.martCategory.findFirst({
          where: {
            id:
              cleanString(id),

            deletedAt:
              null,
          },
        });

      if (!existingCategory) {
        return sendError(
          res,
          404,
          "KartoMart category not found"
        );
      }

      const category =
        await prisma.martCategory.update({
          where: {
            id:
              existingCategory.id,
          },

          data: {
            isActive,
          },

          include:
            categoryInclude,
        });

      return res.json({
        success: true,

        message:
          isActive
            ? "KartoMart category activated successfully"
            : "KartoMart category deactivated successfully",

        category,
        data: category,
      });
    } catch (error) {
      return handleMartCategoryError(
        res,
        error,
        "update status"
      );
    }
  };

/* ============================================================
   SOFT DELETE CATEGORY
============================================================ */

export const deleteMartCategory = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existingCategory =
      await prisma.martCategory.findUnique({
        where: {
          id:
            cleanString(id),
        },
      });

    if (!existingCategory) {
      return sendError(
        res,
        404,
        "KartoMart category not found"
      );
    }

    if (existingCategory.deletedAt) {
      return sendError(
        res,
        409,
        "KartoMart category is already deleted"
      );
    }

    /*
      Soft delete category.
      Deactivate it immediately so customer APIs
      cannot accidentally expose it.
    */

    const category =
      await prisma.martCategory.update({
        where: {
          id:
            existingCategory.id,
        },

        data: {
          deletedAt:
            new Date(),

          isActive:
            false,
        },

        include:
          categoryInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart category deleted successfully",
      category,
      data: category,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "delete"
    );
  }
};

/* ============================================================
   RESTORE CATEGORY
============================================================ */

export const restoreMartCategory = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existingCategory =
      await prisma.martCategory.findUnique({
        where: {
          id:
            cleanString(id),
        },
      });

    if (!existingCategory) {
      return sendError(
        res,
        404,
        "KartoMart category not found"
      );
    }

    if (!existingCategory.deletedAt) {
      return sendError(
        res,
        409,
        "KartoMart category is not deleted"
      );
    }

    /* ---------------- Parent store check ---------------- */

    const store =
      await getActiveMartStore(
        existingCategory.storeId
      );

    if (!store) {
      return sendError(
        res,
        409,
        "Parent KartoMart store is deleted or unavailable"
      );
    }

    /* ---------------- Duplicate check ---------------- */

    const duplicate =
      await prisma.martCategory.findFirst({
        where: {
          storeId:
            existingCategory.storeId,

          name: {
            equals:
              existingCategory.name,

            mode:
              "insensitive",
          },

          deletedAt:
            null,

          NOT: {
            id:
              existingCategory.id,
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
        "Another active category with this name already exists. Rename it before restoring."
      );
    }

    /*
      Safe restore:
      restored but inactive until Admin explicitly activates it.
    */

    const category =
      await prisma.martCategory.update({
        where: {
          id:
            existingCategory.id,
        },

        data: {
          deletedAt:
            null,

          isActive:
            false,
        },

        include:
          categoryInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart category restored successfully",
      category,
      data: category,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "restore"
    );
  }
};

/* ============================================================
   SAFE HARD DELETE

   Category cannot be permanently deleted if products exist.
============================================================ */

export const hardDeleteMartCategory = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const category =
      await prisma.martCategory.findUnique({
        where: {
          id:
            cleanString(id),
        },

        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

    if (!category) {
      return sendError(
        res,
        404,
        "KartoMart category not found"
      );
    }

    if (
      category._count.products > 0
    ) {
      return sendError(
        res,
        409,
        "Category contains products and cannot be permanently deleted. Use soft delete instead."
      );
    }

    await prisma.martCategory.delete({
      where: {
        id:
          category.id,
      },
    });

    return res.json({
      success: true,
      message:
        "KartoMart category permanently deleted successfully",
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "hard delete"
    );
  }
};

/* ============================================================
   PUBLIC CATEGORIES

   Customer application:
   GET ?storeId=xxx

   Only:
   - non deleted category
   - active category
   - non deleted store
   - open store
   - verified store
   - accepting orders
============================================================ */

export const getPublicMartCategories = async (
  req,
  res
) => {
  try {
    const {
      storeId,
      search,
    } = req.query;

    if (!cleanString(storeId)) {
      return sendError(
        res,
        400,
        "storeId is required"
      );
    }

    const store =
      await prisma.martStore.findFirst({
        where: {
          id:
            cleanString(storeId),

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

        select: {
          id: true,
          name: true,
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
    };

    if (cleanString(search)) {
      where.name = {
        contains:
          cleanString(search),

        mode:
          "insensitive",
      };
    }

    const categories =
      await prisma.martCategory.findMany({
        where,

        select: {
          id: true,
          storeId: true,
          name: true,
          description: true,
          imageUrl: true,
          sortOrder: true,

          _count: {
            select: {
              products: true,
            },
          },
        },

        orderBy: [
          {
            sortOrder:
              "asc",
          },

          {
            name:
              "asc",
          },
        ],
      });

    return res.json({
      success: true,

      store,

      categories,
      data: categories,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "fetch public categories"
    );
  }
};

/* ============================================================
   BULK CATEGORY STATUS

   Body:
   {
      "ids": ["id1", "id2"],
      "isActive": false
   }
============================================================ */

export const bulkUpdateMartCategoryStatus =
  async (req, res) => {
    try {
      const {
        ids,
        isActive,
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
          "No valid category IDs provided"
        );
      }

      if (
        uniqueIds.length > 100
      ) {
        return sendError(
          res,
          400,
          "Maximum 100 categories can be updated at once"
        );
      }

      const parsedStatus =
        strictBoolean(
          isActive
        );

      if (
        parsedStatus === undefined
      ) {
        return sendError(
          res,
          400,
          "isActive must be true or false"
        );
      }

      const result =
        await prisma.martCategory.updateMany({
          where: {
            id: {
              in:
                uniqueIds,
            },

            deletedAt:
              null,
          },

          data: {
            isActive:
              parsedStatus,
          },
        });

      return res.json({
        success: true,

        message:
          parsedStatus
            ? "KartoMart categories activated successfully"
            : "KartoMart categories deactivated successfully",

        data: {
          requested:
            uniqueIds.length,

          updated:
            result.count,
        },
      });
    } catch (error) {
      return handleMartCategoryError(
        res,
        error,
        "bulk status update"
      );
    }
  };

/* ============================================================
   REORDER CATEGORIES

   Body:

   {
     "storeId": "STORE_ID",
     "categories": [
       {
         "id": "CATEGORY_1",
         "sortOrder": 0
       },
       {
         "id": "CATEGORY_2",
         "sortOrder": 1
       },
       {
         "id": "CATEGORY_3",
         "sortOrder": 2
       }
     ]
   }

   Useful for Admin drag/drop category ordering.
============================================================ */

export const reorderMartCategories = async (
  req,
  res
) => {
  try {
    const {
      storeId,
      categories,
    } = req.body;

    if (!cleanString(storeId)) {
      return sendError(
        res,
        400,
        "storeId is required"
      );
    }

    if (
      !Array.isArray(categories) ||
      categories.length === 0
    ) {
      return sendError(
        res,
        400,
        "categories must be a non-empty array"
      );
    }

    if (categories.length > 100) {
      return sendError(
        res,
        400,
        "Maximum 100 categories can be reordered at once"
      );
    }

    const store =
      await getActiveMartStore(
        cleanString(storeId)
      );

    if (!store) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    const normalizedCategories = [];

    const ids = new Set();

    for (const item of categories) {
      const id =
        cleanString(item?.id);

      const order =
        parseSortOrder(
          item?.sortOrder
        );

      if (!id) {
        return sendError(
          res,
          400,
          "Every category must contain an id"
        );
      }

      if (order === undefined) {
        return sendError(
          res,
          400,
          `Invalid sortOrder for category ${id}`
        );
      }

      if (ids.has(id)) {
        return sendError(
          res,
          400,
          `Duplicate category ID: ${id}`
        );
      }

      ids.add(id);

      normalizedCategories.push({
        id,
        sortOrder:
          order,
      });
    }

    /*
      Ensure all categories belong to the same KartoMart store.
    */

    const existingCategories =
      await prisma.martCategory.findMany({
        where: {
          id: {
            in:
              normalizedCategories.map(
                (item) => item.id
              ),
          },

          storeId:
            store.id,

          deletedAt:
            null,
        },

        select: {
          id: true,
        },
      });

    if (
      existingCategories.length !==
      normalizedCategories.length
    ) {
      return sendError(
        res,
        400,
        "One or more categories do not belong to this KartoMart store"
      );
    }

    /*
      Transaction ensures all sort positions update together.
    */

    await prisma.$transaction(
      normalizedCategories.map(
        (item) =>
          prisma.martCategory.update({
            where: {
              id:
                item.id,
            },

            data: {
              sortOrder:
                item.sortOrder,
            },
          })
      )
    );

    const updatedCategories =
      await prisma.martCategory.findMany({
        where: {
          storeId:
            store.id,

          deletedAt:
            null,
        },

        include:
          categoryInclude,

        orderBy: [
          {
            sortOrder:
              "asc",
          },

          {
            name:
              "asc",
          },
        ],
      });

    return res.json({
      success: true,

      message:
        "KartoMart categories reordered successfully",

      categories:
        updatedCategories,

      data:
        updatedCategories,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "reorder"
    );
  }
};

/* ============================================================
   CATEGORY STATS
============================================================ */

export const getMartCategoryStats = async (
  req,
  res
) => {
  try {
    const {
      storeId,
    } = req.query;

    const baseWhere = {
      deletedAt:
        null,

      ...(storeId &&
        storeId !== "ALL" && {
          storeId:
            cleanString(storeId),
        }),
    };

    const [
      totalCategories,
      activeCategories,
      inactiveCategories,
      deletedCategories,
    ] =
      await prisma.$transaction([
        prisma.martCategory.count({
          where:
            baseWhere,
        }),

        prisma.martCategory.count({
          where: {
            ...baseWhere,
            isActive:
              true,
          },
        }),

        prisma.martCategory.count({
          where: {
            ...baseWhere,
            isActive:
              false,
          },
        }),

        prisma.martCategory.count({
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
          },
        }),
      ]);

    const stats = {
      totalCategories,
      activeCategories,
      inactiveCategories,
      deletedCategories,
    };

    return res.json({
      success: true,
      stats,
      data: stats,
    });
  } catch (error) {
    return handleMartCategoryError(
      res,
      error,
      "fetch statistics"
    );
  }
};