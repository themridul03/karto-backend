BEGIN;

-- ============================================================
-- KARTOMART SAFE ADDITIVE DATABASE UPDATE
--
-- IMPORTANT:
-- - NO DROP COLUMN
-- - NO DROP TABLE
-- - NO DROP ENUM
-- - NO VendorCategory changes
-- - NO Restaurant changes
-- - Existing Food system remains untouched
-- ============================================================


-- ============================================================
-- MART STORE
-- ============================================================

ALTER TABLE "MartStore"
ADD COLUMN IF NOT EXISTS "freeDeliveryAbove" DECIMAL(10,2);

ALTER TABLE "MartStore"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "MartStore"
ADD COLUMN IF NOT EXISTS "minimumOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "MartStore"
ADD COLUMN IF NOT EXISTS "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "MartStore"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;


-- ============================================================
-- MART CATEGORY
-- ============================================================

ALTER TABLE "MartCategory"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);


-- ============================================================
-- MART PRODUCT
-- ============================================================

ALTER TABLE "MartProduct"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "MartProduct"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "MartProduct"
ADD COLUMN IF NOT EXISTS "isBestSeller" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MartProduct"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;


-- ============================================================
-- MART PRODUCT VARIANT
-- ============================================================

ALTER TABLE "MartProductVariant"
ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "MartProductVariant"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "MartProductVariant"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "MartProductVariant"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;


-- ============================================================
-- MART ORDER
--
-- ADD ONLY.
-- Existing old fields remain untouched.
-- ============================================================

ALTER TABLE "MartOrder"
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);

ALTER TABLE "MartOrder"
ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

ALTER TABLE "MartOrder"
ADD COLUMN IF NOT EXISTS "outForDeliveryAt" TIMESTAMP(3);

ALTER TABLE "MartOrder"
ADD COLUMN IF NOT EXISTS "paymentId" VARCHAR(255);

ALTER TABLE "MartOrder"
ADD COLUMN IF NOT EXISTS "razorpayOrderId" VARCHAR(255);

ALTER TABLE "MartOrder"
ADD COLUMN IF NOT EXISTS "razorpayPaymentId" VARCHAR(255);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS "MartCategory_deletedAt_idx"
ON "MartCategory"("deletedAt");

CREATE INDEX IF NOT EXISTS "MartProduct_isActive_idx"
ON "MartProduct"("isActive");

CREATE INDEX IF NOT EXISTS "MartProduct_isBestSeller_idx"
ON "MartProduct"("isBestSeller");

CREATE INDEX IF NOT EXISTS "MartProduct_sortOrder_idx"
ON "MartProduct"("sortOrder");

CREATE INDEX IF NOT EXISTS "MartProduct_deletedAt_idx"
ON "MartProduct"("deletedAt");

CREATE INDEX IF NOT EXISTS "MartProductVariant_isActive_idx"
ON "MartProductVariant"("isActive");

CREATE INDEX IF NOT EXISTS "MartProductVariant_isDefault_idx"
ON "MartProductVariant"("isDefault");

CREATE INDEX IF NOT EXISTS "MartProductVariant_sortOrder_idx"
ON "MartProductVariant"("sortOrder");

CREATE INDEX IF NOT EXISTS "MartProductVariant_deletedAt_idx"
ON "MartProductVariant"("deletedAt");

CREATE INDEX IF NOT EXISTS "MartStore_name_idx"
ON "MartStore"("name");

CREATE INDEX IF NOT EXISTS "MartStore_isActive_idx"
ON "MartStore"("isActive");

CREATE INDEX IF NOT EXISTS "MartStore_sortOrder_idx"
ON "MartStore"("sortOrder");

CREATE INDEX IF NOT EXISTS "MartOrder_addressId_idx"
ON "MartOrder"("addressId");

CREATE INDEX IF NOT EXISTS "MartOrderStatusHistory_createdAt_idx"
ON "MartOrderStatusHistory"("createdAt");

COMMIT;