-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE "FileObject" ADD COLUMN "byteSize" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FileObject" ALTER COLUMN "contentType" DROP DEFAULT;
ALTER TABLE "FileObject" ALTER COLUMN "byteSize" DROP DEFAULT;
