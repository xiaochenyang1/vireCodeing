-- CreateTable
CREATE TABLE "OrderDraft" (
    "shipperId" TEXT NOT NULL,
    "draftSnapshot" JSONB NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("shipperId")
);

-- AddForeignKey
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
