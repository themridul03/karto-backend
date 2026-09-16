-- CreateEnum
CREATE TYPE "MartStoreType" AS ENUM ('GROCERY', 'FRUITS_VEGETABLES', 'SUPERMARKET', 'GENERAL_STORE');

-- CreateEnum
CREATE TYPE "MartProductUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'PCS', 'PACK', 'BOX', 'DOZEN');

-- CreateEnum
CREATE TYPE "MartOrderStatus" AS ENUM ('PLACED', 'ACCEPTED_BY_VENDOR', 'PACKING', 'READY_FOR_PICKUP', 'ASSIGNED_TO_RIDER', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
-- CreateTable
CREATE TABLE "MartStore" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "cityId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "type" "MartStoreType" NOT NULL DEFAULT 'GROCERY',
    "description" TEXT,
    "address" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "imageUrl" VARCHAR(550),
    "bannerUrl" VARCHAR(550),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimumOrder" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deliveryTime" VARCHAR(50) NOT NULL DEFAULT '30-45 mins',
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isAcceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "openingTime" TEXT,
    "closingTime" TEXT,
    "weeklyOffDay" TEXT,
    "commission" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MartStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartCategory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "imageUrl" VARCHAR(550),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MartCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "brand" VARCHAR(150),
    "imageUrl" VARCHAR(550),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MartProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" "MartProductUnit" NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" VARCHAR(120),
    "barcode" VARCHAR(150),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MartProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartCartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MartCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vendorId" TEXT,
    "riderId" TEXT,
    "addressId" TEXT,
    "orderNumber" VARCHAR(50) NOT NULL,
    "itemTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "status" "MartOrderStatus" NOT NULL DEFAULT 'PLACED',
    "customerNote" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "packingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledBy" TEXT,
    "distanceKm" DECIMAL(10,2),
    "commissionableAmount" DECIMAL(10,2),
    "commissionRate" DECIMAL(5,2),
    "platformCommissionAmount" DECIMAL(10,2),
    "vendorSettlementAmount" DECIMAL(10,2),
    "deliveryOtp" TEXT,
    "deliveryOtpExpiresAt" TIMESTAMP(3),
    "deliveryOtpVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MartOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "itemName" VARCHAR(255) NOT NULL,
    "variantLabel" VARCHAR(100),
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2),
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "imageUrl" VARCHAR(550),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MartOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MartOrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "MartOrderStatus" NOT NULL,
    "changedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MartOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MartStore_vendorId_idx" ON "MartStore"("vendorId");

-- CreateIndex
CREATE INDEX "MartStore_cityId_idx" ON "MartStore"("cityId");

-- CreateIndex
CREATE INDEX "MartStore_type_idx" ON "MartStore"("type");

-- CreateIndex
CREATE INDEX "MartStore_isOpen_idx" ON "MartStore"("isOpen");

-- CreateIndex
CREATE INDEX "MartStore_isFeatured_idx" ON "MartStore"("isFeatured");

-- CreateIndex
CREATE INDEX "MartStore_isAcceptingOrders_idx" ON "MartStore"("isAcceptingOrders");

-- CreateIndex
CREATE INDEX "MartStore_isVerified_idx" ON "MartStore"("isVerified");

-- CreateIndex
CREATE INDEX "MartStore_createdAt_idx" ON "MartStore"("createdAt");

-- CreateIndex
CREATE INDEX "MartStore_deletedAt_idx" ON "MartStore"("deletedAt");

-- CreateIndex
CREATE INDEX "MartCategory_storeId_idx" ON "MartCategory"("storeId");

-- CreateIndex
CREATE INDEX "MartCategory_name_idx" ON "MartCategory"("name");

-- CreateIndex
CREATE INDEX "MartCategory_isActive_idx" ON "MartCategory"("isActive");

-- CreateIndex
CREATE INDEX "MartCategory_sortOrder_idx" ON "MartCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "MartProduct_storeId_idx" ON "MartProduct"("storeId");

-- CreateIndex
CREATE INDEX "MartProduct_categoryId_idx" ON "MartProduct"("categoryId");

-- CreateIndex
CREATE INDEX "MartProduct_name_idx" ON "MartProduct"("name");

-- CreateIndex
CREATE INDEX "MartProduct_brand_idx" ON "MartProduct"("brand");

-- CreateIndex
CREATE INDEX "MartProduct_isAvailable_idx" ON "MartProduct"("isAvailable");

-- CreateIndex
CREATE INDEX "MartProduct_isFeatured_idx" ON "MartProduct"("isFeatured");

-- CreateIndex
CREATE INDEX "MartProduct_isPopular_idx" ON "MartProduct"("isPopular");

-- CreateIndex
CREATE UNIQUE INDEX "MartProductVariant_sku_key" ON "MartProductVariant"("sku");

-- CreateIndex
CREATE INDEX "MartProductVariant_productId_idx" ON "MartProductVariant"("productId");

-- CreateIndex
CREATE INDEX "MartProductVariant_unit_idx" ON "MartProductVariant"("unit");

-- CreateIndex
CREATE INDEX "MartProductVariant_isAvailable_idx" ON "MartProductVariant"("isAvailable");

-- CreateIndex
CREATE INDEX "MartProductVariant_barcode_idx" ON "MartProductVariant"("barcode");

-- CreateIndex
CREATE INDEX "MartCartItem_userId_idx" ON "MartCartItem"("userId");

-- CreateIndex
CREATE INDEX "MartCartItem_storeId_idx" ON "MartCartItem"("storeId");

-- CreateIndex
CREATE INDEX "MartCartItem_productId_idx" ON "MartCartItem"("productId");

-- CreateIndex
CREATE INDEX "MartCartItem_variantId_idx" ON "MartCartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "MartCartItem_userId_variantId_key" ON "MartCartItem"("userId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "MartOrder_orderNumber_key" ON "MartOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "MartOrder_userId_idx" ON "MartOrder"("userId");

-- CreateIndex
CREATE INDEX "MartOrder_storeId_idx" ON "MartOrder"("storeId");

-- CreateIndex
CREATE INDEX "MartOrder_vendorId_idx" ON "MartOrder"("vendorId");

-- CreateIndex
CREATE INDEX "MartOrder_riderId_idx" ON "MartOrder"("riderId");

-- CreateIndex
CREATE INDEX "MartOrder_status_idx" ON "MartOrder"("status");

-- CreateIndex
CREATE INDEX "MartOrder_paymentStatus_idx" ON "MartOrder"("paymentStatus");

-- CreateIndex
CREATE INDEX "MartOrder_paymentMethod_idx" ON "MartOrder"("paymentMethod");

-- CreateIndex
CREATE INDEX "MartOrder_createdAt_idx" ON "MartOrder"("createdAt");

-- CreateIndex
CREATE INDEX "MartOrder_deliveredAt_idx" ON "MartOrder"("deliveredAt");

-- CreateIndex
CREATE INDEX "MartOrder_cancelledAt_idx" ON "MartOrder"("cancelledAt");

-- CreateIndex
CREATE INDEX "MartOrder_storeId_status_createdAt_idx" ON "MartOrder"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MartOrder_riderId_status_deliveredAt_idx" ON "MartOrder"("riderId", "status", "deliveredAt");

-- CreateIndex
CREATE INDEX "MartOrderItem_orderId_idx" ON "MartOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "MartOrderItem_productId_idx" ON "MartOrderItem"("productId");

-- CreateIndex
CREATE INDEX "MartOrderItem_variantId_idx" ON "MartOrderItem"("variantId");

-- CreateIndex
CREATE INDEX "MartOrderStatusHistory_orderId_idx" ON "MartOrderStatusHistory"("orderId");

-- CreateIndex
CREATE INDEX "MartOrderStatusHistory_status_idx" ON "MartOrderStatusHistory"("status");

-- CreateIndex
CREATE INDEX "MartOrderStatusHistory_changedBy_idx" ON "MartOrderStatusHistory"("changedBy");

-- AddForeignKey
ALTER TABLE "MartCategory" ADD CONSTRAINT "MartCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MartStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartProduct" ADD CONSTRAINT "MartProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MartStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartProduct" ADD CONSTRAINT "MartProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MartCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartProductVariant" ADD CONSTRAINT "MartProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MartProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartCartItem" ADD CONSTRAINT "MartCartItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MartStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartCartItem" ADD CONSTRAINT "MartCartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MartProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartCartItem" ADD CONSTRAINT "MartCartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MartProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartOrder" ADD CONSTRAINT "MartOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MartStore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartOrderItem" ADD CONSTRAINT "MartOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MartOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartOrderItem" ADD CONSTRAINT "MartOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MartProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartOrderItem" ADD CONSTRAINT "MartOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MartProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MartOrderStatusHistory" ADD CONSTRAINT "MartOrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MartOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;


