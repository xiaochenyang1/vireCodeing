BEGIN;

CREATE SEQUENCE "Order_order_no_seq"
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

LOCK TABLE "ShipperCoupon" IN SHARE MODE;
LOCK TABLE "Order" IN SHARE MODE;

CREATE TEMP TABLE "_CouponCanonicalOwner" ON COMMIT DROP AS
SELECT
  c."id" AS "couponId",
  c."shipperId" AS "couponShipperId",
  COUNT(o."id") FILTER (
    WHERE o."status" <> 'cancelled'
  ) AS "nonCancelledCount",
  MIN(o."id") FILTER (
    WHERE o."status" <> 'cancelled'
  ) AS "canonicalOrderId",
  MIN(o."orderNo") FILTER (
    WHERE o."status" <> 'cancelled'
  ) AS "canonicalOrderNo",
  MIN(o."status"::text) FILTER (
    WHERE o."status" <> 'cancelled'
  ) AS "canonicalStatus",
  MIN(o."updatedAt") FILTER (
    WHERE o."status" <> 'cancelled'
  ) AS "canonicalOrderUpdatedAt",
  STRING_AGG(
    o."id" || ':' || o."orderNo",
    ',' ORDER BY o."id"
  ) FILTER (
    WHERE o."status" <> 'cancelled'
  ) AS "canonicalOrderIds",
  COUNT(o."id") AS "referenceCount"
FROM "ShipperCoupon" c
LEFT JOIN "Order" o ON o."couponId" = c."id"
GROUP BY c."id", c."shipperId";

DO $$
DECLARE
  conflict RECORD;
BEGIN
  SELECT
    o."couponId" AS "couponId",
    o."id" || ':' || o."orderNo" AS "orderIds",
    NULL::text AS "metadataOrderNo"
  INTO conflict
  FROM "Order" o
  LEFT JOIN "ShipperCoupon" c ON c."id" = o."couponId"
  WHERE o."couponId" IS NOT NULL
    AND c."id" IS NULL
  ORDER BY o."id"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'order coupon reference conflict: couponId=%s orderIds=%s metadataOrderNo=%s',
      conflict."couponId",
      conflict."orderIds",
      conflict."metadataOrderNo"
    );
  END IF;

  SELECT
    c."id" AS "couponId",
    STRING_AGG(
      o."id" || ':' || o."orderNo",
      ',' ORDER BY o."id"
    ) AS "orderIds",
    NULL::text AS "metadataOrderNo"
  INTO conflict
  FROM "ShipperCoupon" c
  JOIN "Order" o ON o."couponId" = c."id"
  WHERE o."shipperId" IS DISTINCT FROM c."shipperId"
  GROUP BY c."id"
  ORDER BY c."id"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'coupon canonical owner conflict: couponId=%s orderIds=%s metadataOrderNo=%s',
      conflict."couponId",
      conflict."orderIds",
      conflict."metadataOrderNo"
    );
  END IF;

  SELECT
    c."id" AS "couponId",
    owner."canonicalOrderIds" AS "orderIds",
    COALESCE(c."lockedOrderNo", c."usedOrderNo") AS "metadataOrderNo"
  INTO conflict
  FROM "ShipperCoupon" c
  JOIN "_CouponCanonicalOwner" owner ON owner."couponId" = c."id"
  WHERE c."status" NOT IN ('usable', 'locked', 'used', 'expired')
  ORDER BY c."id"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'coupon status conflict: couponId=%s orderIds=%s metadataOrderNo=%s',
      conflict."couponId",
      conflict."orderIds",
      conflict."metadataOrderNo"
    );
  END IF;

  SELECT
    owner."couponId" AS "couponId",
    owner."canonicalOrderIds" AS "orderIds",
    NULL::text AS "metadataOrderNo"
  INTO conflict
  FROM "_CouponCanonicalOwner" owner
  WHERE owner."nonCancelledCount" > 1
  ORDER BY owner."couponId"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'coupon canonical owner conflict: couponId=%s orderIds=%s metadataOrderNo=%s',
      conflict."couponId",
      conflict."orderIds",
      conflict."metadataOrderNo"
    );
  END IF;

  SELECT
    c."id" AS "couponId",
    owner."canonicalOrderIds" AS "orderIds",
    metadata."orderNo" AS "metadataOrderNo",
    metadata."field" AS "metadataField"
  INTO conflict
  FROM "ShipperCoupon" c
  JOIN "_CouponCanonicalOwner" owner ON owner."couponId" = c."id"
  CROSS JOIN LATERAL (
    VALUES
      ('lockedOrderNo'::text, c."lockedOrderNo"),
      ('usedOrderNo'::text, c."usedOrderNo")
  ) AS metadata("field", "orderNo")
  LEFT JOIN "Order" metadata_order ON metadata_order."orderNo" = metadata."orderNo"
  WHERE metadata_order."id" IS NOT NULL
    AND metadata_order."couponId" IS DISTINCT FROM c."id"
  ORDER BY c."id", metadata."field"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'coupon metadata owner conflict: couponId=%s orderIds=%s metadataOrderNo=%s metadataField=%s',
      conflict."couponId",
      conflict."orderIds",
      conflict."metadataOrderNo",
      conflict."metadataField"
    );
  END IF;

  SELECT
    c."id" AS "couponId",
    owner."canonicalOrderIds" AS "orderIds",
    c."usedOrderNo" AS "metadataOrderNo"
  INTO conflict
  FROM "ShipperCoupon" c
  JOIN "_CouponCanonicalOwner" owner ON owner."couponId" = c."id"
  WHERE c."status" = 'used'
    AND NOT (
      owner."nonCancelledCount" = 1
      AND owner."canonicalStatus" = 'completed'
    )
  ORDER BY c."id"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'coupon used state conflict: couponId=%s orderIds=%s metadataOrderNo=%s',
      conflict."couponId",
      conflict."orderIds",
      conflict."metadataOrderNo"
    );
  END IF;
END $$;

UPDATE "ShipperCoupon" c
SET "status" = 'locked',
    "lockedOrderNo" = owner."canonicalOrderNo",
    "lockedAt" = COALESCE(c."lockedAt", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
    "usedOrderNo" = NULL,
    "usedAt" = NULL
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 1
  AND owner."canonicalStatus" <> 'completed';

UPDATE "ShipperCoupon" c
SET "status" = 'used',
    "lockedOrderNo" = NULL,
    "lockedAt" = NULL,
    "usedOrderNo" = owner."canonicalOrderNo",
    "usedAt" = COALESCE(c."usedAt", owner."canonicalOrderUpdatedAt")
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 1
  AND owner."canonicalStatus" = 'completed';

UPDATE "ShipperCoupon" c
SET "status" = 'expired',
    "lockedOrderNo" = NULL,
    "lockedAt" = NULL,
    "usedOrderNo" = NULL,
    "usedAt" = NULL
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 0
  AND (
    c."status" = 'expired'
    OR c."validUntil" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  );

UPDATE "ShipperCoupon" c
SET "status" = 'usable',
    "lockedOrderNo" = NULL,
    "lockedAt" = NULL,
    "usedOrderNo" = NULL,
    "usedAt" = NULL
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 0
  AND c."status" IN ('usable', 'locked')
  AND c."validUntil" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

COMMIT;
