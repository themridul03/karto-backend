import prisma from "../prisma.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";

/* ============================================================
   KARTOMART STORE CONTROLLER

   Locked-schema version.

   MartStore fields used here:
   id, cityId, name, description, imageUrl, bannerUrl, address,
   latitude, longitude, phone, minimumOrderAmount, deliveryFee,
   freeDeliveryAbove, platformFee, isActive, isOpen, isVerified,
   isAcceptingOrders, sortOrder, deletedAt, createdAt, updatedAt.

   KartoMart is owned/managed directly by Karto/Admin.
   No restaurant vendor or commission logic.
============================================================ */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = new Set([
  "name",
  "minimumOrderAmount",
  "deliveryFee",
  "freeDeliveryAbove",
  "platformFee",
  "isActive",
  "isOpen",
  "isVerified",
  "isAcceptingOrders",
  "sortOrder",
  "createdAt",
  "updatedAt",
]);

const cleanString = (value) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
};

const strictBoolean = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "active", "on"].includes(normalized)) return true;
  if (["false", "no", "n", "inactive", "off"].includes(normalized)) return false;
  return undefined;
};

const boolValue = (value, fallback = false) => {
  const parsed = strictBoolean(value);
  return parsed === undefined ? fallback : parsed;
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInteger = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

const parseNonNegativeNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const parseNullableNonNegativeNumber = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return parseNonNegativeNumber(value);
};

const isValidLatitude = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= -90 && n <= 90;
};

const isValidLongitude = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= -180 && n <= 180;
};

const sendError = (res, status, message, errors = undefined) =>
  res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });

const fileUrl = async (req, folder = "misc") => {
  if (!req.file) return undefined;
  return uploadToCloudinary(req.file, folder);
};

const storeInclude = {
  _count: {
    select: {
      categories: true,
      products: true,
      cartItems: true,
      orders: true,
    },
  },
};

const handleMartStoreError = (res, error, action = "process") => {
  console.error(`KartoMart Store ${action} Error:`, error);

  if (error?.code === "P2002") {
    return sendError(res, 409, "A KartoMart store with the same unique data already exists");
  }

  if (error?.code === "P2003") {
    return sendError(res, 400, "Invalid related record");
  }

  if (error?.code === "P2025") {
    return sendError(res, 404, "KartoMart store not found");
  }

  return sendError(
    res,
    500,
    process.env.NODE_ENV === "production"
      ? `Unable to ${action} KartoMart store`
      : error?.message || `Unable to ${action} KartoMart store`
  );
};

const validateStorePayload = (body, isUpdate = false) => {
  const errors = {};

  if (!isUpdate) {
    if (!cleanString(body.cityId)) errors.cityId = "City ID is required";
    if (!cleanString(body.name)) errors.name = "Store name is required";
  }

  if (body.cityId !== undefined && !cleanString(body.cityId)) {
    errors.cityId = "City ID cannot be empty";
  }

  if (body.name !== undefined && !cleanString(body.name)) {
    errors.name = "Store name cannot be empty";
  }

  if (cleanString(body.name)?.length > 150) {
    errors.name = "Store name cannot exceed 150 characters";
  }

  if (cleanString(body.phone)?.length > 20) {
    errors.phone = "Phone cannot exceed 20 characters";
  }

  const moneyFields = [
    "minimumOrderAmount",
    "deliveryFee",
    "platformFee",
  ];

  for (const field of moneyFields) {
    if (body[field] !== undefined && parseNonNegativeNumber(body[field]) === undefined) {
      errors[field] = `${field} must be a valid non-negative number`;
    }
  }

  if (
    body.freeDeliveryAbove !== undefined &&
    body.freeDeliveryAbove !== null &&
    body.freeDeliveryAbove !== "" &&
    parseNonNegativeNumber(body.freeDeliveryAbove) === undefined
  ) {
    errors.freeDeliveryAbove = "freeDeliveryAbove must be null or a valid non-negative number";
  }

  if (
    body.sortOrder !== undefined &&
    parseNonNegativeInteger(body.sortOrder, undefined) === undefined
  ) {
    errors.sortOrder = "sortOrder must be a non-negative integer";
  }

  for (const field of [
    "isActive",
    "isOpen",
    "isVerified",
    "isAcceptingOrders",
  ]) {
    if (body[field] !== undefined && strictBoolean(body[field]) === undefined) {
      errors[field] = `${field} must be true or false`;
    }
  }

  return errors;
};

const validateLocation = (latitude, longitude, isUpdate = false) => {
  const latProvided = latitude !== undefined;
  const lngProvided = longitude !== undefined;

  if (isUpdate && latProvided !== lngProvided) {
    return { valid: false, message: "Latitude and longitude must be updated together" };
  }

  const hasLat = latitude !== undefined && latitude !== null && String(latitude).trim() !== "";
  const hasLng = longitude !== undefined && longitude !== null && String(longitude).trim() !== "";

  if (!isUpdate && hasLat !== hasLng) {
    return { valid: false, message: "Latitude and longitude must be provided together" };
  }

  if (isUpdate && latProvided && lngProvided && !hasLat && !hasLng) {
    return { valid: true, provided: true, latitude: null, longitude: null };
  }

  if (!hasLat && !hasLng) return { valid: true, provided: false };

  if (!isValidLatitude(latitude)) {
    return { valid: false, message: "Latitude must be between -90 and 90" };
  }

  if (!isValidLongitude(longitude)) {
    return { valid: false, message: "Longitude must be between -180 and 180" };
  }

  return {
    valid: true,
    provided: true,
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

const validateCity = async (cityId) => {
  if (!cityId) return null;
  return prisma.city.findUnique({
    where: { id: cityId },
    select: { id: true },
  });
};

/* ============================================================
   CREATE
============================================================ */

export const createMartStore = async (req, res) => {
  try {
    const errors = validateStorePayload(req.body, false);
    if (Object.keys(errors).length) {
      return sendError(res, 400, "Validation failed", errors);
    }

    const {
      cityId,
      name,
      description,
      imageUrl,
      bannerUrl,
      address,
      latitude,
      longitude,
      phone,
      minimumOrderAmount = 0,
      deliveryFee = 0,
      freeDeliveryAbove,
      platformFee = 0,
      isActive = true,
      isOpen = true,
      isVerified = true,
      isAcceptingOrders = true,
      sortOrder = 0,
    } = req.body;

    const cleanCityId = cleanString(cityId);
    const city = await validateCity(cleanCityId);
    if (!city) return sendError(res, 404, "City not found");

    const location = validateLocation(latitude, longitude, false);
    if (!location.valid) return sendError(res, 400, location.message);

    let finalImageUrl = cleanString(imageUrl) || null;
    if (req.file) {
      try {
        finalImageUrl = await fileUrl(req, "karto-mart/stores");
      } catch (uploadError) {
        console.error("KartoMart store image upload error:", uploadError);
        return sendError(res, 500, "KartoMart store image upload failed");
      }
    }

    const finalIsActive = boolValue(isActive, true);
    const finalIsOpen = boolValue(isOpen, true);
    const finalIsVerified = boolValue(isVerified, true);

    let finalAcceptingOrders = boolValue(isAcceptingOrders, true);
    if (!finalIsActive || !finalIsOpen || !finalIsVerified) {
      finalAcceptingOrders = false;
    }

    const store = await prisma.martStore.create({
      data: {
        cityId: cleanCityId,
        name: cleanString(name),
        description: cleanString(description) || null,
        imageUrl: finalImageUrl,
        bannerUrl: cleanString(bannerUrl) || null,
        address: cleanString(address) || null,
        ...(location.provided && {
          latitude: location.latitude,
          longitude: location.longitude,
        }),
        phone: cleanString(phone) || null,
        minimumOrderAmount: Number(minimumOrderAmount || 0),
        deliveryFee: Number(deliveryFee || 0),
        freeDeliveryAbove: parseNullableNonNegativeNumber(freeDeliveryAbove) ?? null,
        platformFee: Number(platformFee || 0),
        isActive: finalIsActive,
        isOpen: finalIsOpen,
        isVerified: finalIsVerified,
        isAcceptingOrders: finalAcceptingOrders,
        sortOrder: parseNonNegativeInteger(sortOrder, 0),
      },
      include: storeInclude,
    });

    return res.status(201).json({
      success: true,
      message: "KartoMart store created successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(res, error, "create");
  }
};

/* ============================================================
   GET ALL - ADMIN
============================================================ */

export const getMartStores = async (req, res) => {
  try {
    const {
      search,
      cityId,
      isActive,
      isOpen,
      isVerified,
      isAcceptingOrders,
      minDeliveryFee,
      maxDeliveryFee,
      minOrderAmount,
      maxOrderAmount,
      minPlatformFee,
      maxPlatformFee,
      includeDeleted,
      onlyDeleted,
      sortBy = "sortOrder",
      sortOrder = "asc",
    } = req.query;

    const page = parsePositiveInteger(req.query.page, DEFAULT_PAGE);
    const limit = Math.min(parsePositiveInteger(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const skip = (page - 1) * limit;
    const where = {};

    if (cleanString(search)) {
      const q = cleanString(search);
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    if (cityId && cityId !== "ALL") where.cityId = cleanString(cityId);

    for (const [field, value] of Object.entries({
      isActive,
      isOpen,
      isVerified,
      isAcceptingOrders,
    })) {
      if (value !== undefined) {
        const parsed = strictBoolean(value);
        if (parsed === undefined) return sendError(res, 400, `${field} must be true or false`);
        where[field] = parsed;
      }
    }

    const includeDeletedValue = strictBoolean(includeDeleted) ?? false;
    const onlyDeletedValue = strictBoolean(onlyDeleted) ?? false;

    if (onlyDeletedValue) where.deletedAt = { not: null };
    else if (!includeDeletedValue) where.deletedAt = null;

    const range = (min, max, field) => {
      const minValue = parseNonNegativeNumber(min);
      const maxValue = parseNonNegativeNumber(max);

      if (min !== undefined && minValue === undefined) {
        return `${field} minimum must be a valid non-negative number`;
      }
      if (max !== undefined && maxValue === undefined) {
        return `${field} maximum must be a valid non-negative number`;
      }
      if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
        return `${field} minimum cannot be greater than maximum`;
      }

      if (minValue !== undefined || maxValue !== undefined) {
        where[field] = {};
        if (minValue !== undefined) where[field].gte = minValue;
        if (maxValue !== undefined) where[field].lte = maxValue;
      }
      return null;
    };

    const rangeError =
      range(minDeliveryFee, maxDeliveryFee, "deliveryFee") ||
      range(minOrderAmount, maxOrderAmount, "minimumOrderAmount") ||
      range(minPlatformFee, maxPlatformFee, "platformFee");

    if (rangeError) return sendError(res, 400, rangeError);

    const safeSortBy = ALLOWED_SORT_FIELDS.has(String(sortBy))
      ? String(sortBy)
      : "sortOrder";

    const safeSortOrder = String(sortOrder).toLowerCase() === "desc" ? "desc" : "asc";

    const [stores, total] = await prisma.$transaction([
      prisma.martStore.findMany({
        where,
        include: storeInclude,
        skip,
        take: limit,
        orderBy: [
          { [safeSortBy]: safeSortOrder },
          ...(safeSortBy !== "name" ? [{ name: "asc" }] : []),
        ],
      }),
      prisma.martStore.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      stores,
      data: stores,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      sorting: { sortBy: safeSortBy, sortOrder: safeSortOrder },
    });
  } catch (error) {
    return handleMartStoreError(res, error, "fetch");
  }
};

/* ============================================================
   GET BY ID
============================================================ */

export const getMartStoreById = async (req, res) => {
  try {
    const id = cleanString(req.params.id);
    if (!id) return sendError(res, 400, "Store ID is required");

    const store = await prisma.martStore.findFirst({
      where: { id, deletedAt: null },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
        _count: {
          select: {
            categories: true,
            products: true,
            cartItems: true,
            orders: true,
          },
        },
      },
    });

    if (!store) return sendError(res, 404, "KartoMart store not found");

    return res.json({ success: true, store, data: store });
  } catch (error) {
    return handleMartStoreError(res, error, "fetch");
  }
};

/* ============================================================
   UPDATE
============================================================ */

export const updateMartStore = async (req, res) => {
  try {
    const id = cleanString(req.params.id);
    if (!id) return sendError(res, 400, "Store ID is required");

    const existing = await prisma.martStore.findUnique({ where: { id } });
    if (!existing) return sendError(res, 404, "KartoMart store not found");
    if (existing.deletedAt) {
      return sendError(res, 409, "Deleted store cannot be updated. Restore it first.");
    }

    const errors = validateStorePayload(req.body, true);
    if (Object.keys(errors).length) {
      return sendError(res, 400, "Validation failed", errors);
    }

    const {
      cityId,
      name,
      description,
      imageUrl,
      bannerUrl,
      address,
      latitude,
      longitude,
      phone,
      minimumOrderAmount,
      deliveryFee,
      freeDeliveryAbove,
      platformFee,
      isActive,
      isOpen,
      isVerified,
      isAcceptingOrders,
      sortOrder,
    } = req.body;

    if (cityId !== undefined) {
      const city = await validateCity(cleanString(cityId));
      if (!city) return sendError(res, 404, "City not found");
    }

    const location = validateLocation(latitude, longitude, true);
    if (!location.valid) return sendError(res, 400, location.message);

    let finalImageUrl;
    if (req.file) {
      try {
        finalImageUrl = await fileUrl(req, "karto-mart/stores");
      } catch (uploadError) {
        console.error("KartoMart store image update error:", uploadError);
        return sendError(res, 500, "KartoMart store image upload failed");
      }
    } else if (imageUrl !== undefined) {
      finalImageUrl = cleanString(imageUrl) || null;
    }

    const nextActive =
      isActive !== undefined ? strictBoolean(isActive) : existing.isActive;
    const nextOpen =
      isOpen !== undefined ? strictBoolean(isOpen) : existing.isOpen;
    const nextVerified =
      isVerified !== undefined ? strictBoolean(isVerified) : existing.isVerified;

    let nextAccepting =
      isAcceptingOrders !== undefined
        ? strictBoolean(isAcceptingOrders)
        : existing.isAcceptingOrders;

    if (!nextActive || !nextOpen || !nextVerified) nextAccepting = false;

    const data = {
      ...(cityId !== undefined && { cityId: cleanString(cityId) }),
      ...(name !== undefined && { name: cleanString(name) }),
      ...(description !== undefined && { description: cleanString(description) || null }),
      ...(finalImageUrl !== undefined && { imageUrl: finalImageUrl }),
      ...(bannerUrl !== undefined && { bannerUrl: cleanString(bannerUrl) || null }),
      ...(address !== undefined && { address: cleanString(address) || null }),
      ...(location.provided && {
        latitude: location.latitude,
        longitude: location.longitude,
      }),
      ...(phone !== undefined && { phone: cleanString(phone) || null }),
      ...(minimumOrderAmount !== undefined && {
        minimumOrderAmount: Number(minimumOrderAmount),
      }),
      ...(deliveryFee !== undefined && { deliveryFee: Number(deliveryFee) }),
      ...(freeDeliveryAbove !== undefined && {
        freeDeliveryAbove: parseNullableNonNegativeNumber(freeDeliveryAbove),
      }),
      ...(platformFee !== undefined && { platformFee: Number(platformFee) }),
      ...(isActive !== undefined && { isActive: nextActive }),
      ...(isOpen !== undefined && { isOpen: nextOpen }),
      ...(isVerified !== undefined && { isVerified: nextVerified }),
      ...(
        isAcceptingOrders !== undefined ||
        isActive !== undefined ||
        isOpen !== undefined ||
        isVerified !== undefined
      ) && { isAcceptingOrders: nextAccepting },
      ...(sortOrder !== undefined && {
        sortOrder: parseNonNegativeInteger(sortOrder, 0),
      }),
    };

    if (!Object.keys(data).length) {
      return sendError(res, 400, "No valid fields provided for update");
    }

    const store = await prisma.martStore.update({
      where: { id },
      data,
      include: storeInclude,
    });

    return res.json({
      success: true,
      message: "KartoMart store updated successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(res, error, "update");
  }
};

/* ============================================================
   STATUS HELPERS
============================================================ */

const updateStoreFlags = async (req, res, patch, message) => {
  const id = cleanString(req.params.id);
  if (!id) return sendError(res, 400, "Store ID is required");

  const existing = await prisma.martStore.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) return sendError(res, 404, "KartoMart store not found");

  const next = { ...patch };

  const finalActive = patch.isActive ?? existing.isActive;
  const finalOpen = patch.isOpen ?? existing.isOpen;
  const finalVerified = patch.isVerified ?? existing.isVerified;
  const requestedAccepting =
    patch.isAcceptingOrders ?? existing.isAcceptingOrders;

  if (!finalActive || !finalOpen || !finalVerified) {
    next.isAcceptingOrders = false;
  } else if (patch.isAcceptingOrders !== undefined) {
    next.isAcceptingOrders = requestedAccepting;
  }

  const store = await prisma.martStore.update({
    where: { id },
    data: next,
    include: storeInclude,
  });

  return res.json({ success: true, message, store, data: store });
};

export const updateMartStoreActiveStatus = async (req, res) => {
  try {
    const value = strictBoolean(req.body.isActive);
    if (value === undefined) return sendError(res, 400, "isActive must be true or false");

    return await updateStoreFlags(
      req,
      res,
      { isActive: value },
      value ? "KartoMart store activated successfully" : "KartoMart store deactivated successfully"
    );
  } catch (error) {
    return handleMartStoreError(res, error, "update active status");
  }
};

export const updateMartStoreOpenStatus = async (req, res) => {
  try {
    const value = strictBoolean(req.body.isOpen);
    if (value === undefined) return sendError(res, 400, "isOpen must be true or false");

    return await updateStoreFlags(
      req,
      res,
      { isOpen: value },
      value ? "KartoMart store opened successfully" : "KartoMart store closed successfully"
    );
  } catch (error) {
    return handleMartStoreError(res, error, "update open status");
  }
};

export const updateMartStoreVerification = async (req, res) => {
  try {
    const value = strictBoolean(req.body.isVerified);
    if (value === undefined) return sendError(res, 400, "isVerified must be true or false");

    return await updateStoreFlags(
      req,
      res,
      { isVerified: value },
      value ? "KartoMart store verified successfully" : "KartoMart store unverified successfully"
    );
  } catch (error) {
    return handleMartStoreError(res, error, "update verification");
  }
};

export const updateMartStoreAcceptingOrders = async (req, res) => {
  try {
    const value = strictBoolean(req.body.isAcceptingOrders);
    if (value === undefined) {
      return sendError(res, 400, "isAcceptingOrders must be true or false");
    }

    if (value) {
      const id = cleanString(req.params.id);
      const store = await prisma.martStore.findFirst({
        where: { id, deletedAt: null },
        select: { isActive: true, isOpen: true, isVerified: true },
      });

      if (!store) return sendError(res, 404, "KartoMart store not found");

      if (!store.isActive || !store.isOpen || !store.isVerified) {
        return sendError(
          res,
          409,
          "Store must be active, open and verified before accepting orders"
        );
      }
    }

    return await updateStoreFlags(
      req,
      res,
      { isAcceptingOrders: value },
      value
        ? "KartoMart store is now accepting orders"
        : "KartoMart store stopped accepting orders"
    );
  } catch (error) {
    return handleMartStoreError(res, error, "update accepting orders");
  }
};

/* ============================================================
   SOFT DELETE / RESTORE / HARD DELETE
============================================================ */

export const deleteMartStore = async (req, res) => {
  try {
    const id = cleanString(req.params.id);
    const existing = await prisma.martStore.findUnique({ where: { id } });

    if (!existing) return sendError(res, 404, "KartoMart store not found");
    if (existing.deletedAt) return sendError(res, 409, "KartoMart store is already deleted");

    const store = await prisma.$transaction(async (tx) => {
      await tx.martCategory.updateMany({
        where: { storeId: id, deletedAt: null },
        data: { isActive: false },
      });

      await tx.martProduct.updateMany({
        where: { storeId: id, deletedAt: null },
        data: { isActive: false, isAvailable: false },
      });

      return tx.martStore.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          isOpen: false,
          isAcceptingOrders: false,
        },
        include: storeInclude,
      });
    });

    return res.json({
      success: true,
      message: "KartoMart store deleted successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(res, error, "delete");
  }
};

export const restoreMartStore = async (req, res) => {
  try {
    const id = cleanString(req.params.id);
    const existing = await prisma.martStore.findUnique({ where: { id } });

    if (!existing) return sendError(res, 404, "KartoMart store not found");
    if (!existing.deletedAt) return sendError(res, 409, "KartoMart store is not deleted");

    const store = await prisma.martStore.update({
      where: { id },
      data: {
        deletedAt: null,
        isActive: false,
        isOpen: false,
        isAcceptingOrders: false,
      },
      include: storeInclude,
    });

    return res.json({
      success: true,
      message: "KartoMart store restored successfully. Activate/open it explicitly.",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(res, error, "restore");
  }
};

export const hardDeleteMartStore = async (req, res) => {
  try {
    const id = cleanString(req.params.id);

    const store = await prisma.martStore.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            categories: true,
            products: true,
            cartItems: true,
            orders: true,
          },
        },
      },
    });

    if (!store) return sendError(res, 404, "KartoMart store not found");

    const hasDependencies =
      store._count.categories > 0 ||
      store._count.products > 0 ||
      store._count.cartItems > 0 ||
      store._count.orders > 0;

    if (hasDependencies) {
      return sendError(
        res,
        409,
        "Store contains related KartoMart data and cannot be permanently deleted. Use soft delete instead."
      );
    }

    await prisma.martStore.delete({ where: { id } });

    return res.json({
      success: true,
      message: "KartoMart store permanently deleted successfully",
    });
  } catch (error) {
    return handleMartStoreError(res, error, "hard delete");
  }
};

/* ============================================================
   PUBLIC STORES
============================================================ */

export const getPublicMartStores = async (req, res) => {
  try {
    const { cityId, search } = req.query;

    const where = {
      deletedAt: null,
      isActive: true,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,
    };

    if (cityId && cityId !== "ALL") where.cityId = cleanString(cityId);

    if (cleanString(search)) {
      const q = cleanString(search);
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ];
    }

    const stores = await prisma.martStore.findMany({
      where,
      select: {
        id: true,
        cityId: true,
        name: true,
        description: true,
        imageUrl: true,
        bannerUrl: true,
        address: true,
        latitude: true,
        longitude: true,
        phone: true,
        minimumOrderAmount: true,
        deliveryFee: true,
        freeDeliveryAbove: true,
        platformFee: true,
        isOpen: true,
        isVerified: true,
        isAcceptingOrders: true,
        sortOrder: true,
        _count: {
          select: {
            categories: {
              where: { deletedAt: null, isActive: true },
            },
            products: {
              where: {
                deletedAt: null,
                isActive: true,
                isAvailable: true,
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return res.json({
      success: true,
      stores,
      data: stores,
      count: stores.length,
    });
  } catch (error) {
    return handleMartStoreError(res, error, "fetch public");
  }
};

/* ============================================================
   NEARBY STORES

   Query:
   ?latitude=27.7&longitude=79.9&radiusKm=25

   Uses DB coordinates, then Haversine in application code.
   Suitable for a small city-level MartStore set.
============================================================ */

export const getNearbyMartStores = async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const radiusKm =
      req.query.radiusKm === undefined ? 25 : Number(req.query.radiusKm);

    if (!isValidLatitude(latitude)) {
      return sendError(res, 400, "Valid latitude is required");
    }

    if (!isValidLongitude(longitude)) {
      return sendError(res, 400, "Valid longitude is required");
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 200) {
      return sendError(res, 400, "radiusKm must be between 0 and 200");
    }

    const stores = await prisma.martStore.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        isOpen: true,
        isVerified: true,
        isAcceptingOrders: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        description: true,
        imageUrl: true,
        bannerUrl: true,
        address: true,
        latitude: true,
        longitude: true,
        minimumOrderAmount: true,
        deliveryFee: true,
        freeDeliveryAbove: true,
        platformFee: true,
        sortOrder: true,
      },
    });

    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const nearby = stores
      .map((store) => {
        const lat2 = Number(store.latitude);
        const lon2 = Number(store.longitude);

        const dLat = toRad(lat2 - latitude);
        const dLon = toRad(lon2 - longitude);

        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(latitude)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

        const distanceKm =
          earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return {
          ...store,
          distanceKm: Number(distanceKm.toFixed(2)),
        };
      })
      .filter((store) => store.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return res.json({
      success: true,
      stores: nearby,
      data: nearby,
      count: nearby.length,
      radiusKm,
    });
  } catch (error) {
    return handleMartStoreError(res, error, "fetch nearby");
  }
};

/* ============================================================
   REORDER STORES
   body: { items: [{ id, sortOrder }, ...] }
============================================================ */

export const reorderMartStores = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return sendError(res, 400, "items must be a non-empty array");
    }

    const normalized = [];
    const seen = new Set();

    for (const item of items) {
      const id = cleanString(item?.id);
      const sortOrder = parseNonNegativeInteger(item?.sortOrder, undefined);

      if (!id || sortOrder === undefined) {
        return sendError(res, 400, "Each item requires a valid id and non-negative sortOrder");
      }

      if (seen.has(id)) {
        return sendError(res, 400, `Duplicate store id: ${id}`);
      }

      seen.add(id);
      normalized.push({ id, sortOrder });
    }

    const existingCount = await prisma.martStore.count({
      where: {
        id: { in: normalized.map((x) => x.id) },
        deletedAt: null,
      },
    });

    if (existingCount !== normalized.length) {
      return sendError(res, 404, "One or more KartoMart stores were not found");
    }

    await prisma.$transaction(
      normalized.map((item) =>
        prisma.martStore.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return res.json({
      success: true,
      message: "KartoMart stores reordered successfully",
    });
  } catch (error) {
    return handleMartStoreError(res, error, "reorder");
  }
};

/* ============================================================
   STATS
============================================================ */

export const getMartStoreStats = async (req, res) => {
  try {
    const [
      total,
      active,
      open,
      verified,
      acceptingOrders,
      deleted,
      aggregate,
    ] = await prisma.$transaction([
      prisma.martStore.count({ where: { deletedAt: null } }),
      prisma.martStore.count({ where: { deletedAt: null, isActive: true } }),
      prisma.martStore.count({ where: { deletedAt: null, isOpen: true } }),
      prisma.martStore.count({ where: { deletedAt: null, isVerified: true } }),
      prisma.martStore.count({
        where: { deletedAt: null, isAcceptingOrders: true },
      }),
      prisma.martStore.count({ where: { deletedAt: { not: null } } }),
      prisma.martStore.aggregate({
        where: { deletedAt: null },
        _avg: {
          deliveryFee: true,
          minimumOrderAmount: true,
          platformFee: true,
        },
      }),
    ]);

    const data = {
      total,
      active,
      inactive: total - active,
      open,
      closed: total - open,
      verified,
      unverified: total - verified,
      acceptingOrders,
      deleted,
      averages: aggregate._avg,
    };

    return res.json({ success: true, stats: data, data });
  } catch (error) {
    return handleMartStoreError(res, error, "fetch statistics");
  }
};

/* ============================================================
   BULK STATUS UPDATE

   body:
   {
     ids: ["..."],
     isActive?: true,
     isOpen?: true,
     isVerified?: true,
     isAcceptingOrders?: true
   }
============================================================ */

export const bulkUpdateMartStoreStatus = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, 400, "ids must be a non-empty array");
    }

    const cleanIds = [...new Set(ids.map(cleanString).filter(Boolean))];
    if (!cleanIds.length) return sendError(res, 400, "No valid store IDs provided");

    const data = {};

    for (const field of [
      "isActive",
      "isOpen",
      "isVerified",
      "isAcceptingOrders",
    ]) {
      if (req.body[field] !== undefined) {
        const parsed = strictBoolean(req.body[field]);
        if (parsed === undefined) {
          return sendError(res, 400, `${field} must be true or false`);
        }
        data[field] = parsed;
      }
    }

    if (!Object.keys(data).length) {
      return sendError(res, 400, "No status fields provided");
    }

    // Never allow accepting orders when the same bulk request disables
    // active/open/verified state.
    if (
      data.isActive === false ||
      data.isOpen === false ||
      data.isVerified === false
    ) {
      data.isAcceptingOrders = false;
    }

    // Enabling accepting-orders requires every selected store to already
    // satisfy the remaining eligibility flags not included in this request.
    if (data.isAcceptingOrders === true) {
      const invalid = await prisma.martStore.count({
        where: {
          id: { in: cleanIds },
          deletedAt: null,
          OR: [
            ...(data.isActive === true ? [] : [{ isActive: false }]),
            ...(data.isOpen === true ? [] : [{ isOpen: false }]),
            ...(data.isVerified === true ? [] : [{ isVerified: false }]),
          ],
        },
      });

      if (invalid > 0) {
        return sendError(
          res,
          409,
          "All selected stores must be active, open and verified before accepting orders"
        );
      }
    }

    const result = await prisma.martStore.updateMany({
      where: {
        id: { in: cleanIds },
        deletedAt: null,
      },
      data,
    });

    return res.json({
      success: true,
      message: "KartoMart store statuses updated successfully",
      updatedCount: result.count,
      data: { updatedCount: result.count },
    });
  } catch (error) {
    return handleMartStoreError(res, error, "bulk update status");
  }
};

/*
================================================================
LEGACY ORIGINAL CONTROLLER — PRESERVED VERBATIM FOR REFERENCE
================================================================
The block below is intentionally non-executable. It preserves the
complete original controller that was supplied before the locked
MartStore schema changed. Do not uncomment it unless the old Prisma
fields are restored.
================================================================

import prisma from "../prisma.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";

/* ============================================================
   KARTOMART STORE CONTROLLER

   KartoMart is 100% owned and managed by Karto/Admin.
   No vendor commission logic is used here.

   Features:
   - Create
   - Read
   - Update
   - Soft Delete
   - Restore
   - Safe Hard Delete
   - Cloudinary image upload
   - Search
   - Filtering
   - Sorting
   - Pagination
   - Public store listing
   - Nearby stores
   - Open/Close
   - Accept/Stop orders
   - Featured status
   - Verification
   - Bulk status updates
   - Statistics
============================================================ * /

/* ============================================================
   CONSTANTS
============================================================ * /

const MART_STORE_TYPES = [
  "GROCERY",
  "FRUITS_VEGETABLES",
  "SUPERMARKET",
  "GENERAL_STORE",
];

const ALLOWED_SORT_FIELDS = new Set([
  "name",
  "type",
  "rating",
  "totalReviews",
  "deliveryFee",
  "minimumOrder",
  "deliveryTime",
  "isOpen",
  "isFeatured",
  "isAcceptingOrders",
  "isVerified",
  "createdAt",
  "updatedAt",
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/* ============================================================
   HELPERS
============================================================ * /

const cleanString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value).trim();
};

const cleanEmail = (value) => {
  const email = cleanString(value);
  return email ? email.toLowerCase() : undefined;
};

const normalizeStoreType = (type) => {
  if (!type) return undefined;

  return String(type)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
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

const parseNumber = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
};

const isValidEmail = (email) => {
  if (!email) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
};

const isValidLatitude = (value) => {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= -90 &&
    number <= 90
  );
};

const isValidLongitude = (value) => {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= -180 &&
    number <= 180
  );
};

const isValidTime = (value) => {
  if (!value) return true;

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(
    String(value).trim()
  );
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

const sendSuccess = (
  res,
  status,
  message,
  data = null,
  extra = {}
) => {
  return res.status(status).json({
    success: true,
    message,
    data,
    ...extra,
  });
};

/* ============================================================
   COMMON STORE INCLUDE
============================================================ * /

const storeCountInclude = {
  _count: {
    select: {
      categories: true,
      products: true,
      cartItems: true,
      orders: true,
    },
  },
};

/* ============================================================
   ERROR HANDLER
============================================================ * /

const handleMartStoreError = (
  res,
  error,
  action = "process"
) => {
  console.error(
    `KartoMart Store ${action} Error:`,
    error
  );

  if (error?.code === "P2002") {
    return sendError(
      res,
      409,
      "A KartoMart store with the same unique data already exists"
    );
  }

  if (error?.code === "P2003") {
    return sendError(
      res,
      400,
      "Invalid related record"
    );
  }

  if (error?.code === "P2025") {
    return sendError(
      res,
      404,
      "KartoMart store not found"
    );
  }

  return sendError(
    res,
    500,
    error?.message ||
      `Unable to ${action} KartoMart store`
  );
};

/* ============================================================
   VALIDATE STORE
============================================================ * /

const validateStorePayload = (
  body,
  isUpdate = false
) => {
  const errors = {};

  if (!isUpdate) {
    if (!cleanString(body.name)) {
      errors.name =
        "Store name is required";
    }

    if (!cleanString(body.address)) {
      errors.address =
        "Store address is required";
    }
  }

  if (
    body.name !== undefined &&
    !cleanString(body.name)
  ) {
    errors.name =
      "Store name cannot be empty";
  }

  if (
    body.address !== undefined &&
    !cleanString(body.address)
  ) {
    errors.address =
      "Store address cannot be empty";
  }

  if (
    body.name &&
    cleanString(body.name).length > 255
  ) {
    errors.name =
      "Store name cannot exceed 255 characters";
  }

  if (
    body.address &&
    cleanString(body.address).length > 255
  ) {
    errors.address =
      "Address cannot exceed 255 characters";
  }

  if (
    body.phone &&
    cleanString(body.phone).length > 20
  ) {
    errors.phone =
      "Phone cannot exceed 20 characters";
  }

  if (
    body.email &&
    !isValidEmail(cleanEmail(body.email))
  ) {
    errors.email =
      "Invalid email address";
  }

  if (body.type !== undefined) {
    const normalizedType =
      normalizeStoreType(body.type);

    if (
      !MART_STORE_TYPES.includes(
        normalizedType
      )
    ) {
      errors.type =
        `Invalid store type. Allowed: ${MART_STORE_TYPES.join(
          ", "
        )}`;
    }
  }

  const moneyFields = [
    "deliveryFee",
    "minimumOrder",
  ];

  for (const field of moneyFields) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      body[field] !== ""
    ) {
      const number = Number(
        body[field]
      );

      if (
        !Number.isFinite(number) ||
        number < 0
      ) {
        errors[field] =
          `${field} must be a valid non-negative number`;
      }
    }
  }

  if (
    body.openingTime &&
    !isValidTime(body.openingTime)
  ) {
    errors.openingTime =
      "openingTime must use HH:mm format";
  }

  if (
    body.closingTime &&
    !isValidTime(body.closingTime)
  ) {
    errors.closingTime =
      "closingTime must use HH:mm format";
  }

  const booleanFields = [
    "isOpen",
    "isFeatured",
    "isAcceptingOrders",
    "isVerified",
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

/* ============================================================
   LOCATION VALIDATION
============================================================ * /

const validateLocation = (
  latitude,
  longitude,
  isUpdate = false
) => {
  const latitudeProvided =
    latitude !== undefined;

  const longitudeProvided =
    longitude !== undefined;

  if (
    isUpdate &&
    latitudeProvided !== longitudeProvided
  ) {
    return {
      valid: false,
      message:
        "Latitude and longitude must be updated together",
    };
  }

  const hasLatitude =
    latitude !== undefined &&
    latitude !== null &&
    String(latitude).trim() !== "";

  const hasLongitude =
    longitude !== undefined &&
    longitude !== null &&
    String(longitude).trim() !== "";

  if (
    !isUpdate &&
    hasLatitude !== hasLongitude
  ) {
    return {
      valid: false,
      message:
        "Latitude and longitude must be provided together",
    };
  }

  if (
    isUpdate &&
    latitudeProvided &&
    longitudeProvided &&
    !hasLatitude &&
    !hasLongitude
  ) {
    return {
      valid: true,
      provided: true,
      latitude: null,
      longitude: null,
    };
  }

  if (!hasLatitude && !hasLongitude) {
    return {
      valid: true,
      provided: false,
    };
  }

  if (!isValidLatitude(latitude)) {
    return {
      valid: false,
      message:
        "Latitude must be between -90 and 90",
    };
  }

  if (!isValidLongitude(longitude)) {
    return {
      valid: false,
      message:
        "Longitude must be between -180 and 180",
    };
  }

  return {
    valid: true,
    provided: true,
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

/* ============================================================
   CREATE STORE
============================================================ * /

export const createMartStore = async (
  req,
  res
) => {
  try {
    const errors =
      validateStorePayload(
        req.body,
        false
      );

    if (
      Object.keys(errors).length
    ) {
      return sendError(
        res,
        400,
        "Validation failed",
        errors
      );
    }

    const {
      cityId,
      name,
      description,
      type = "GROCERY",
      address,
      phone,
      email,
      imageUrl,
      bannerUrl,
      latitude,
      longitude,
      deliveryFee = 0,
      minimumOrder = 0,
      deliveryTime = "30-45 mins",
      isOpen = true,
      isFeatured = false,
      isAcceptingOrders = true,
      isVerified = false,
      openingTime,
      closingTime,
      weeklyOffDay,
    } = req.body;

    /* ---------------- City validation ---------------- * /

    if (cityId) {
      const city =
        await prisma.city.findUnique({
          where: {
            id: cityId,
          },
        });

      if (!city) {
        return sendError(
          res,
          404,
          "City not found"
        );
      }
    }

    /* ---------------- Location ---------------- * /

    const location =
      validateLocation(
        latitude,
        longitude,
        false
      );

    if (!location.valid) {
      return sendError(
        res,
        400,
        location.message
      );
    }

    /* ---------------- Cloudinary image ---------------- * /

    let finalImageUrl =
      cleanString(imageUrl) || null;

    if (req.file) {
      try {
        const uploadedUrl =
          await fileUrl(
            req,
            "karto-mart/stores"
          );

        if (uploadedUrl) {
          finalImageUrl =
            uploadedUrl;
        }
      } catch (uploadError) {
        console.error(
          "KartoMart Cloudinary Upload Error:",
          uploadError
        );

        return sendError(
          res,
          500,
          "KartoMart store image upload failed"
        );
      }
    }

    /* ---------------- Business status ---------------- * /

    const finalIsOpen =
      boolValue(isOpen, true);

    const finalIsVerified =
      boolValue(
        isVerified,
        false
      );

    let finalAcceptingOrders =
      boolValue(
        isAcceptingOrders,
        true
      );

    /*
      Closed store cannot accept orders.
      Unverified store also cannot accept orders.
    * /

    if (
      !finalIsOpen ||
      !finalIsVerified
    ) {
      finalAcceptingOrders =
        false;
    }

    /* ---------------- Create ---------------- * /

    const store =
      await prisma.martStore.create({
        data: {
          ...(cityId && {
            cityId,
          }),

          name:
            cleanString(name),

          description:
            cleanString(description) ||
            null,

          type:
            normalizeStoreType(type),

          address:
            cleanString(address),

          phone:
            cleanString(phone) ||
            null,

          email:
            cleanEmail(email) ||
            null,

          imageUrl:
            finalImageUrl,

          bannerUrl:
            cleanString(bannerUrl) ||
            null,

          ...(location.provided && {
            latitude:
              location.latitude,

            longitude:
              location.longitude,
          }),

          deliveryFee:
            Number(deliveryFee || 0),

          minimumOrder:
            Number(
              minimumOrder || 0
            ),

          deliveryTime:
            cleanString(
              deliveryTime
            ) || "30-45 mins",

          isOpen:
            finalIsOpen,

          isFeatured:
            boolValue(
              isFeatured,
              false
            ),

          isAcceptingOrders:
            finalAcceptingOrders,

          isVerified:
            finalIsVerified,

          openingTime:
            cleanString(
              openingTime
            ) || null,

          closingTime:
            cleanString(
              closingTime
            ) || null,

          weeklyOffDay:
            cleanString(
              weeklyOffDay
            ) || null,
        },

        include:
          storeCountInclude,
      });

    return res.status(201).json({
      success: true,
      message:
        "KartoMart store created successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "create"
    );
  }
};

/* ============================================================
   GET ALL STORES - ADMIN

   Examples:
   ?page=1&limit=20
   ?search=jalalabad
   ?cityId=xxx
   ?type=GROCERY
   ?type=GROCERY,SUPERMARKET
   ?isOpen=true
   ?isVerified=true
   ?isFeatured=true
   ?isAcceptingOrders=true
   ?minRating=4
   ?maxDeliveryFee=50
   ?minOrder=100
   ?maxOrder=500
   ?sortBy=rating
   ?sortOrder=desc
============================================================ * /

export const getMartStores = async (
  req,
  res
) => {
  try {
    const {
      search,
      cityId,
      type,

      isOpen,
      isFeatured,
      isVerified,
      isAcceptingOrders,

      minRating,
      maxRating,

      minDeliveryFee,
      maxDeliveryFee,

      minOrder,
      maxOrder,

      createdFrom,
      createdTo,

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

    const limit = Math.min(
      requestedLimit,
      MAX_LIMIT
    );

    const skip =
      (page - 1) * limit;

    const where = {};

    /* ---------------- Search ---------------- * /

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
          address: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    /* ---------------- City ---------------- * /

    if (
      cityId &&
      cityId !== "ALL"
    ) {
      where.cityId = cityId;
    }

    /* ---------------- Store Type ---------------- * /

    if (
      type &&
      type !== "ALL"
    ) {
      const types =
        String(type)
          .split(",")
          .map(
            normalizeStoreType
          )
          .filter(Boolean);

      const invalidType =
        types.find(
          (item) =>
            !MART_STORE_TYPES.includes(
              item
            )
        );

      if (invalidType) {
        return sendError(
          res,
          400,
          `Invalid store type: ${invalidType}`
        );
      }

      where.type =
        types.length === 1
          ? types[0]
          : {
              in: types,
            };
    }

    /* ---------------- Boolean filters ---------------- * /

    const booleanFilters = {
      isOpen,
      isFeatured,
      isVerified,
      isAcceptingOrders,
    };

    for (const [
      field,
      value,
    ] of Object.entries(
      booleanFilters
    )) {
      if (
        value !== undefined
      ) {
        const parsed =
          strictBoolean(value);

        if (
          parsed === undefined
        ) {
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

    /* ---------------- Deleted filters ---------------- * /

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
    } else if (
      !includeDeletedValue
    ) {
      where.deletedAt =
        null;
    }

    /* ---------------- Rating ---------------- * /

    const minRatingNumber =
      parseNumber(minRating);

    const maxRatingNumber =
      parseNumber(maxRating);

    if (
      minRatingNumber !==
        undefined ||
      maxRatingNumber !==
        undefined
    ) {
      where.rating = {};

      if (
        minRatingNumber !==
        undefined
      ) {
        where.rating.gte =
          minRatingNumber;
      }

      if (
        maxRatingNumber !==
        undefined
      ) {
        where.rating.lte =
          maxRatingNumber;
      }
    }

    /* ---------------- Delivery Fee ---------------- * /

    const minFee =
      parseNumber(
        minDeliveryFee
      );

    const maxFee =
      parseNumber(
        maxDeliveryFee
      );

    if (
      minFee !== undefined ||
      maxFee !== undefined
    ) {
      where.deliveryFee = {};

      if (
        minFee !== undefined
      ) {
        where.deliveryFee.gte =
          minFee;
      }

      if (
        maxFee !== undefined
      ) {
        where.deliveryFee.lte =
          maxFee;
      }
    }

    /* ---------------- Minimum Order ---------------- * /

    const minOrderValue =
      parseNumber(minOrder);

    const maxOrderValue =
      parseNumber(maxOrder);

    if (
      minOrderValue !==
        undefined ||
      maxOrderValue !==
        undefined
    ) {
      where.minimumOrder = {};

      if (
        minOrderValue !==
        undefined
      ) {
        where.minimumOrder.gte =
          minOrderValue;
      }

      if (
        maxOrderValue !==
        undefined
      ) {
        where.minimumOrder.lte =
          maxOrderValue;
      }
    }

    /* ---------------- Date filters ---------------- * /

    if (
      createdFrom ||
      createdTo
    ) {
      where.createdAt = {};

      if (createdFrom) {
        const fromDate =
          new Date(
            createdFrom
          );

        if (
          Number.isNaN(
            fromDate.getTime()
          )
        ) {
          return sendError(
            res,
            400,
            "Invalid createdFrom date"
          );
        }

        where.createdAt.gte =
          fromDate;
      }

      if (createdTo) {
        const toDate =
          new Date(createdTo);

        if (
          Number.isNaN(
            toDate.getTime()
          )
        ) {
          return sendError(
            res,
            400,
            "Invalid createdTo date"
          );
        }

        where.createdAt.lte =
          toDate;
      }
    }

    /* ---------------- Sorting ---------------- * /

    const safeSortBy =
      ALLOWED_SORT_FIELDS.has(
        String(sortBy)
      )
        ? String(sortBy)
        : "createdAt";

    const safeSortOrder =
      String(sortOrder)
        .toLowerCase() ===
      "asc"
        ? "asc"
        : "desc";

    const [
      stores,
      total,
    ] =
      await prisma.$transaction([
        prisma.martStore.findMany({
          where,

          include:
            storeCountInclude,

          skip,
          take: limit,

          orderBy: {
            [safeSortBy]:
              safeSortOrder,
          },
        }),

        prisma.martStore.count({
          where,
        }),
      ]);

    const totalPages =
      Math.ceil(
        total / limit
      );

    return res.json({
      success: true,

      stores,
      data: stores,

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
    return handleMartStoreError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   GET STORE BY ID
============================================================ * /

export const getMartStoreById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (!id) {
      return sendError(
        res,
        400,
        "Store ID is required"
      );
    }

    const store =
      await prisma.martStore.findFirst({
        where: {
          id,
          deletedAt: null,
        },

        include: {
          categories: {
            where: {
              isActive: true,
            },

            orderBy: [
              {
                sortOrder: "asc",
              },
              {
                name: "asc",
              },
            ],
          },

          _count: {
            select: {
              categories: true,
              products: true,
              cartItems: true,
              orders: true,
            },
          },
        },
      });

    if (!store) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    return res.json({
      success: true,
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "fetch"
    );
  }
};

/* ============================================================
   UPDATE STORE
============================================================ * /

export const updateMartStore = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existingStore =
      await prisma.martStore.findUnique({
        where: {
          id,
        },
      });

    if (!existingStore) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    if (
      existingStore.deletedAt
    ) {
      return sendError(
        res,
        409,
        "Deleted store cannot be updated. Restore it first."
      );
    }

    const errors =
      validateStorePayload(
        req.body,
        true
      );

    if (
      Object.keys(errors).length
    ) {
      return sendError(
        res,
        400,
        "Validation failed",
        errors
      );
    }

    const {
      cityId,
      name,
      description,
      type,
      address,
      phone,
      email,
      imageUrl,
      bannerUrl,
      latitude,
      longitude,
      deliveryFee,
      minimumOrder,
      deliveryTime,
      isOpen,
      isFeatured,
      isAcceptingOrders,
      isVerified,
      openingTime,
      closingTime,
      weeklyOffDay,
    } = req.body;

    /* ---------------- City validation ---------------- * /

    if (
      cityId !== undefined &&
      cityId
    ) {
      const city =
        await prisma.city.findUnique({
          where: {
            id: cityId,
          },
        });

      if (!city) {
        return sendError(
          res,
          404,
          "City not found"
        );
      }
    }

    /* ---------------- Location ---------------- * /

    const location =
      validateLocation(
        latitude,
        longitude,
        true
      );

    if (!location.valid) {
      return sendError(
        res,
        400,
        location.message
      );
    }

    /* ---------------- Cloudinary ---------------- * /

    let finalImageUrl;

    if (req.file) {
      try {
        finalImageUrl =
          await fileUrl(
            req,
            "karto-mart/stores"
          );
      } catch (uploadError) {
        console.error(
          "KartoMart Cloudinary Update Error:",
          uploadError
        );

        return sendError(
          res,
          500,
          "KartoMart store image upload failed"
        );
      }
    } else if (
      imageUrl !== undefined
    ) {
      finalImageUrl =
        cleanString(
          imageUrl
        ) || null;
    }

    /* ---------------- Update Object ---------------- * /

    const updateData = {
      ...(cityId !==
        undefined && {
        cityId:
          cityId || null,
      }),

      ...(name !==
        undefined && {
        name:
          cleanString(name),
      }),

      ...(description !==
        undefined && {
        description:
          cleanString(
            description
          ) || null,
      }),

      ...(type !==
        undefined && {
        type:
          normalizeStoreType(
            type
          ),
      }),

      ...(address !==
        undefined && {
        address:
          cleanString(
            address
          ),
      }),

      ...(phone !==
        undefined && {
        phone:
          cleanString(phone) ||
          null,
      }),

      ...(email !==
        undefined && {
        email:
          cleanEmail(email) ||
          null,
      }),

      ...(finalImageUrl !==
        undefined && {
        imageUrl:
          finalImageUrl,
      }),

      ...(bannerUrl !==
        undefined && {
        bannerUrl:
          cleanString(
            bannerUrl
          ) || null,
      }),

      ...(location.provided && {
        latitude:
          location.latitude,

        longitude:
          location.longitude,
      }),

      ...(deliveryFee !==
        undefined && {
        deliveryFee:
          Number(
            deliveryFee
          ),
      }),

      ...(minimumOrder !==
        undefined && {
        minimumOrder:
          Number(
            minimumOrder
          ),
      }),

      ...(deliveryTime !==
        undefined && {
        deliveryTime:
          cleanString(
            deliveryTime
          ) || "30-45 mins",
      }),

      ...(isOpen !==
        undefined && {
        isOpen:
          strictBoolean(
            isOpen
          ),
      }),

      ...(isFeatured !==
        undefined && {
        isFeatured:
          strictBoolean(
            isFeatured
          ),
      }),

      ...(isAcceptingOrders !==
        undefined && {
        isAcceptingOrders:
          strictBoolean(
            isAcceptingOrders
          ),
      }),

      ...(isVerified !==
        undefined && {
        isVerified:
          strictBoolean(
            isVerified
          ),
      }),

      ...(openingTime !==
        undefined && {
        openingTime:
          cleanString(
            openingTime
          ) || null,
      }),

      ...(closingTime !==
        undefined && {
        closingTime:
          cleanString(
            closingTime
          ) || null,
      }),

      ...(weeklyOffDay !==
        undefined && {
        weeklyOffDay:
          cleanString(
            weeklyOffDay
          ) || null,
      }),
    };

    if (
      !Object.keys(updateData)
        .length
    ) {
      return sendError(
        res,
        400,
        "No valid fields provided for update"
      );
    }

    /* ---------------- Status consistency ---------------- * /

    const resultingIsOpen =
      updateData.isOpen ??
      existingStore.isOpen;

    const resultingVerified =
      updateData.isVerified ??
      existingStore.isVerified;

    if (!resultingIsOpen) {
      updateData.isAcceptingOrders =
        false;
    }

    if (!resultingVerified) {
      updateData.isAcceptingOrders =
        false;
    }

    if (
      updateData.isVerified ===
      false
    ) {
      updateData.isFeatured =
        false;
    }

    if (
      updateData.isAcceptingOrders ===
        true &&
      (!resultingIsOpen ||
        !resultingVerified)
    ) {
      return sendError(
        res,
        409,
        "Store must be open and verified before accepting orders"
      );
    }

    const store =
      await prisma.martStore.update({
        where: {
          id,
        },

        data:
          updateData,

        include:
          storeCountInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart store updated successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "update"
    );
  }
};

/* ============================================================
   SOFT DELETE STORE
============================================================ * /

export const deleteMartStore = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existingStore =
      await prisma.martStore.findUnique({
        where: {
          id,
        },
      });

    if (!existingStore) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    if (
      existingStore.deletedAt
    ) {
      return sendError(
        res,
        409,
        "KartoMart store is already deleted"
      );
    }

    const store =
      await prisma.martStore.update({
        where: {
          id,
        },

        data: {
          deletedAt:
            new Date(),

          isOpen:
            false,

          isAcceptingOrders:
            false,

          isFeatured:
            false,
        },

        include:
          storeCountInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart store deleted successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "delete"
    );
  }
};

/* ============================================================
   RESTORE STORE
============================================================ * /

export const restoreMartStore = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const existingStore =
      await prisma.martStore.findUnique({
        where: {
          id,
        },
      });

    if (!existingStore) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    if (
      !existingStore.deletedAt
    ) {
      return sendError(
        res,
        409,
        "KartoMart store is not deleted"
      );
    }

    const store =
      await prisma.martStore.update({
        where: {
          id,
        },

        data: {
          deletedAt: null,

          // Admin should explicitly reopen after restore.
          isOpen: false,

          isAcceptingOrders:
            false,

          isFeatured:
            false,
        },

        include:
          storeCountInclude,
      });

    return res.json({
      success: true,
      message:
        "KartoMart store restored successfully",
      store,
      data: store,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "restore"
    );
  }
};

/* ============================================================
   SAFE HARD DELETE

   Only possible if no categories/products/cart/orders exist.
============================================================ * /

export const hardDeleteMartStore = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const store =
      await prisma.martStore.findUnique({
        where: {
          id,
        },

        include: {
          _count: {
            select: {
              categories: true,
              products: true,
              cartItems: true,
              orders: true,
            },
          },
        },
      });

    if (!store) {
      return sendError(
        res,
        404,
        "KartoMart store not found"
      );
    }

    const hasRelatedData =
      store._count.categories >
        0 ||
      store._count.products >
        0 ||
      store._count.cartItems >
        0 ||
      store._count.orders > 0;

    if (hasRelatedData) {
      return sendError(
        res,
        409,
        "Store has related data and cannot be permanently deleted. Use soft delete instead."
      );
    }

    await prisma.martStore.delete({
      where: {
        id,
      },
    });

    return res.json({
      success: true,
      message:
        "KartoMart store permanently deleted successfully",
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "hard delete"
    );
  }
};

/* ============================================================
   OPEN / CLOSE
============================================================ * /

export const updateMartStoreOpenStatus =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isOpen =
        strictBoolean(
          req.body.isOpen
        );

      if (
        isOpen === undefined
      ) {
        return sendError(
          res,
          400,
          "isOpen must be true or false"
        );
      }

      const existingStore =
        await prisma.martStore.findFirst({
          where: {
            id,
            deletedAt: null,
          },
        });

      if (!existingStore) {
        return sendError(
          res,
          404,
          "KartoMart store not found"
        );
      }

      const store =
        await prisma.martStore.update({
          where: {
            id,
          },

          data: {
            isOpen,

            ...(!isOpen && {
              isAcceptingOrders:
                false,
            }),
          },
        });

      return res.json({
        success: true,

        message: isOpen
          ? "KartoMart store opened successfully"
          : "KartoMart store closed successfully",

        store,
        data: store,
      });
    } catch (error) {
      return handleMartStoreError(
        res,
        error,
        "update open status"
      );
    }
  };

/* ============================================================
   START / STOP ACCEPTING ORDERS
============================================================ * /

export const updateMartStoreAcceptingOrders =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isAcceptingOrders =
        strictBoolean(
          req.body
            .isAcceptingOrders
        );

      if (
        isAcceptingOrders ===
        undefined
      ) {
        return sendError(
          res,
          400,
          "isAcceptingOrders must be true or false"
        );
      }

      const existingStore =
        await prisma.martStore.findFirst({
          where: {
            id,
            deletedAt: null,
          },
        });

      if (!existingStore) {
        return sendError(
          res,
          404,
          "KartoMart store not found"
        );
      }

      if (
        isAcceptingOrders &&
        !existingStore.isOpen
      ) {
        return sendError(
          res,
          409,
          "Open the store before accepting orders"
        );
      }

      if (
        isAcceptingOrders &&
        !existingStore.isVerified
      ) {
        return sendError(
          res,
          409,
          "Verify the store before accepting orders"
        );
      }

      const store =
        await prisma.martStore.update({
          where: {
            id,
          },

          data: {
            isAcceptingOrders,
          },
        });

      return res.json({
        success: true,

        message:
          isAcceptingOrders
            ? "KartoMart store is now accepting orders"
            : "KartoMart store stopped accepting orders",

        store,
        data: store,
      });
    } catch (error) {
      return handleMartStoreError(
        res,
        error,
        "update accepting orders"
      );
    }
  };

/* ============================================================
   FEATURE / UNFEATURE
============================================================ * /

export const updateMartStoreFeaturedStatus =
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

      const existingStore =
        await prisma.martStore.findFirst({
          where: {
            id,
            deletedAt: null,
          },
        });

      if (!existingStore) {
        return sendError(
          res,
          404,
          "KartoMart store not found"
        );
      }

      const store =
        await prisma.martStore.update({
          where: {
            id,
          },

          data: {
            isFeatured,
          },
        });

      return res.json({
        success: true,

        message:
          isFeatured
            ? "KartoMart store marked as featured"
            : "KartoMart store removed from featured",

        store,
        data: store,
      });
    } catch (error) {
      return handleMartStoreError(
        res,
        error,
        "update featured status"
      );
    }
  };

/* ============================================================
   VERIFY / UNVERIFY
============================================================ * /

export const updateMartStoreVerification =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const isVerified =
        strictBoolean(
          req.body.isVerified
        );

      if (
        isVerified === undefined
      ) {
        return sendError(
          res,
          400,
          "isVerified must be true or false"
        );
      }

      const existingStore =
        await prisma.martStore.findFirst({
          where: {
            id,
            deletedAt: null,
          },
        });

      if (!existingStore) {
        return sendError(
          res,
          404,
          "KartoMart store not found"
        );
      }

      const updateData = {
        isVerified,
      };

      if (!isVerified) {
        updateData.isAcceptingOrders =
          false;

        updateData.isFeatured =
          false;
      }

      const store =
        await prisma.martStore.update({
          where: {
            id,
          },

          data:
            updateData,
        });

      return res.json({
        success: true,

        message:
          isVerified
            ? "KartoMart store verified successfully"
            : "KartoMart store verification removed",

        store,
        data: store,
      });
    } catch (error) {
      return handleMartStoreError(
        res,
        error,
        "update verification"
      );
    }
  };

/* ============================================================
   PUBLIC STORES
   Used by customer app.
============================================================ * /

export const getPublicMartStores = async (
  req,
  res
) => {
  try {
    const {
      cityId,
      type,
      featured,
      search,
    } = req.query;

    const where = {
      deletedAt: null,
      isOpen: true,
      isVerified: true,
      isAcceptingOrders: true,
    };

    if (
      cityId &&
      cityId !== "ALL"
    ) {
      where.cityId =
        cityId;
    }

    if (
      type &&
      type !== "ALL"
    ) {
      const normalizedType =
        normalizeStoreType(
          type
        );

      if (
        !MART_STORE_TYPES.includes(
          normalizedType
        )
      ) {
        return sendError(
          res,
          400,
          "Invalid KartoMart store type"
        );
      }

      where.type =
        normalizedType;
    }

    if (
      featured !== undefined
    ) {
      const parsed =
        strictBoolean(
          featured
        );

      if (
        parsed === undefined
      ) {
        return sendError(
          res,
          400,
          "featured must be true or false"
        );
      }

      where.isFeatured =
        parsed;
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
          address: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    const stores =
      await prisma.martStore.findMany({
        where,

        include: {
          _count: {
            select: {
              categories: true,
              products: true,
            },
          },
        },

        orderBy: [
          {
            isFeatured:
              "desc",
          },
          {
            rating:
              "desc",
          },
          {
            createdAt:
              "desc",
          },
        ],
      });

    return res.json({
      success: true,
      stores,
      data: stores,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "fetch public stores"
    );
  }
};

/* ============================================================
   NEARBY STORES

   PostgreSQL Haversine calculation.
   No PostGIS required.

   Example:
   GET /nearby?latitude=27.725&longitude=79.653&radiusKm=20
============================================================ * /

export const getNearbyMartStores = async (
  req,
  res
) => {
  try {
    const latitude =
      Number(
        req.query.latitude
      );

    const longitude =
      Number(
        req.query.longitude
      );

    const radiusKm =
      req.query.radiusKm !==
      undefined
        ? Number(
            req.query.radiusKm
          )
        : 20;

    if (
      !isValidLatitude(
        latitude
      )
    ) {
      return sendError(
        res,
        400,
        "Valid latitude is required"
      );
    }

    if (
      !isValidLongitude(
        longitude
      )
    ) {
      return sendError(
        res,
        400,
        "Valid longitude is required"
      );
    }

    if (
      !Number.isFinite(
        radiusKm
      ) ||
      radiusKm <= 0 ||
      radiusKm > 100
    ) {
      return sendError(
        res,
        400,
        "radiusKm must be between 0 and 100"
      );
    }

    const stores =
      await prisma.$queryRaw`
        SELECT
          ms.*,

          (
            6371 * acos(
              LEAST(
                1,
                GREATEST(
                  -1,

                  cos(radians(${latitude}))
                  *
                  cos(
                    radians(
                      ms."latitude"::double precision
                    )
                  )
                  *
                  cos(
                    radians(
                      ms."longitude"::double precision
                    )
                    -
                    radians(${longitude})
                  )

                  +

                  sin(radians(${latitude}))
                  *
                  sin(
                    radians(
                      ms."latitude"::double precision
                    )
                  )
                )
              )
            )
          ) AS "distanceKm"

        FROM "MartStore" ms

        WHERE
          ms."deletedAt" IS NULL

          AND ms."isOpen" = true

          AND ms."isVerified" = true

          AND ms."isAcceptingOrders" = true

          AND ms."latitude" IS NOT NULL

          AND ms."longitude" IS NOT NULL

          AND (
            6371 * acos(
              LEAST(
                1,
                GREATEST(
                  -1,

                  cos(radians(${latitude}))
                  *
                  cos(
                    radians(
                      ms."latitude"::double precision
                    )
                  )
                  *
                  cos(
                    radians(
                      ms."longitude"::double precision
                    )
                    -
                    radians(${longitude})
                  )

                  +

                  sin(radians(${latitude}))
                  *
                  sin(
                    radians(
                      ms."latitude"::double precision
                    )
                  )
                )
              )
            )
          ) <= ${radiusKm}

        ORDER BY
          "distanceKm" ASC

        LIMIT 50
      `;

    return res.json({
      success: true,
      stores,
      data: stores,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "fetch nearby stores"
    );
  }
};

/* ============================================================
   STORE STATISTICS
============================================================ * /

export const getMartStoreStats = async (
  req,
  res
) => {
  try {
    const [
      totalStores,
      openStores,
      closedStores,
      acceptingStores,
      verifiedStores,
      featuredStores,
      deletedStores,
      typeGroups,
    ] =
      await prisma.$transaction([
        prisma.martStore.count({
          where: {
            deletedAt: null,
          },
        }),

        prisma.martStore.count({
          where: {
            deletedAt: null,
            isOpen: true,
          },
        }),

        prisma.martStore.count({
          where: {
            deletedAt: null,
            isOpen: false,
          },
        }),

        prisma.martStore.count({
          where: {
            deletedAt: null,
            isAcceptingOrders:
              true,
          },
        }),

        prisma.martStore.count({
          where: {
            deletedAt: null,
            isVerified: true,
          },
        }),

        prisma.martStore.count({
          where: {
            deletedAt: null,
            isFeatured: true,
          },
        }),

        prisma.martStore.count({
          where: {
            deletedAt: {
              not: null,
            },
          },
        }),

        prisma.martStore.groupBy({
          by: ["type"],

          where: {
            deletedAt: null,
          },

          _count: {
            _all: true,
          },
        }),
      ]);

    const storesByType =
      Object.fromEntries(
        MART_STORE_TYPES.map(
          (type) => [
            type,
            0,
          ]
        )
      );

    for (
      const group of typeGroups
    ) {
      storesByType[
        group.type
      ] =
        group._count._all;
    }

    const stats = {
      totalStores,
      openStores,
      closedStores,
      acceptingStores,
      verifiedStores,
      featuredStores,
      deletedStores,
      storesByType,
    };

    return res.json({
      success: true,
      stats,
      data: stats,
    });
  } catch (error) {
    return handleMartStoreError(
      res,
      error,
      "fetch statistics"
    );
  }
};

/* ============================================================
   BULK STATUS UPDATE

   Example:
   {
     "ids": ["store1", "store2"],
     "isOpen": true,
     "isVerified": true
   }
============================================================ * /

export const bulkUpdateMartStoreStatus =
  async (req, res) => {
    try {
      const {
        ids,
        isOpen,
        isFeatured,
        isAcceptingOrders,
        isVerified,
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
        uniqueIds.length > 100
      ) {
        return sendError(
          res,
          400,
          "Maximum 100 stores can be updated at once"
        );
      }

      const updateData = {};

      const fields = {
        isOpen,
        isFeatured,
        isAcceptingOrders,
        isVerified,
      };

      for (const [
        field,
        value,
      ] of Object.entries(
        fields
      )) {
        if (
          value !== undefined
        ) {
          const parsed =
            strictBoolean(
              value
            );

          if (
            parsed === undefined
          ) {
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

      if (
        !Object.keys(
          updateData
        ).length
      ) {
        return sendError(
          res,
          400,
          "Provide at least one status field"
        );
      }

      if (
        updateData.isOpen ===
        false
      ) {
        updateData.isAcceptingOrders =
          false;
      }

      if (
        updateData.isVerified ===
        false
      ) {
        updateData.isAcceptingOrders =
          false;

        updateData.isFeatured =
          false;
      }

      /*
        Important:
        updateMany cannot validate each store's current open/
        verified state individually.

        Therefore bulk enabling order acceptance is blocked
        unless both open + verified are explicitly enabled
        in the same request.
      * /

      if (
        updateData.isAcceptingOrders ===
          true &&
        !(
          updateData.isOpen ===
            true &&
          updateData.isVerified ===
            true
        )
      ) {
        return sendError(
          res,
          400,
          "For bulk enabling orders, isOpen=true and isVerified=true must also be provided"
        );
      }

      const result =
        await prisma.martStore.updateMany({
          where: {
            id: {
              in: uniqueIds,
            },

            deletedAt: null,
          },

          data:
            updateData,
        });

      return res.json({
        success: true,

        message:
          "KartoMart stores updated successfully",

        data: {
          requested:
            uniqueIds.length,

          updated:
            result.count,
        },
      });
    } catch (error) {
      return handleMartStoreError(
        res,
        error,
        "bulk update"
      );
    }
  };
================================================================
END LEGACY ORIGINAL CONTROLLER
================================================================
*/
