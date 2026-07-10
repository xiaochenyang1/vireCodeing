ALTER TABLE "OrderEvent"
ADD COLUMN "attachmentFileIds" JSONB NOT NULL DEFAULT '[]';
