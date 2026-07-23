ALTER TABLE "ShipperProfile" ADD COLUMN "phoneProtectionEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ShipperProfile" ADD COLUMN "loginProtectionEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ShipperProfile" ADD COLUMN "orderNotificationEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ShipperProfile" ADD COLUMN "promotionNotificationEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ShipperProfile" ADD COLUMN "privacyConfirmedAt" TIMESTAMP(3);
