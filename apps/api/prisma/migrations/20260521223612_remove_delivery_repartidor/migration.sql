-- AlterEnum
BEGIN;
CREATE TYPE "SaleStatus_new" AS ENUM ('PENDIENTE_PAGO', 'PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'ENTREGADO', 'CANCELADO_NO_PAGO', 'CANCELADO_SIN_REEMBOLSO', 'VOID');
ALTER TABLE "public"."sales" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sales" ALTER COLUMN "status" TYPE "SaleStatus_new" USING ("status"::text::"SaleStatus_new");
ALTER TYPE "SaleStatus" RENAME TO "SaleStatus_old";
ALTER TYPE "SaleStatus_new" RENAME TO "SaleStatus";
DROP TYPE "public"."SaleStatus_old";
ALTER TABLE "sales" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE_PAGO';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SaleType_new" AS ENUM ('COUNTER', 'WEB_PICKUP');
ALTER TABLE "sales" ALTER COLUMN "type" TYPE "SaleType_new" USING ("type"::text::"SaleType_new");
ALTER TYPE "SaleType" RENAME TO "SaleType_old";
ALTER TYPE "SaleType_new" RENAME TO "SaleType";
DROP TYPE "public"."SaleType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('CAJERO', 'COCINERO', 'ADMIN_OPERATIVO', 'DUENO', 'TRABAJADOR');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_repartidor_id_fkey";

-- DropIndex
DROP INDEX "sales_repartidor_id_status_idx";

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "assigned_at",
DROP COLUMN "delivered_at",
DROP COLUMN "delivered_gps_lat",
DROP COLUMN "delivered_gps_lng",
DROP COLUMN "delivery_address",
DROP COLUMN "delivery_lat",
DROP COLUMN "delivery_lng",
DROP COLUMN "delivery_proof_url",
DROP COLUMN "departed_at",
DROP COLUMN "failed_attempts",
DROP COLUMN "notified_fifteen_min_warning",
DROP COLUMN "notified_in_route",
DROP COLUMN "picked_up_at",
DROP COLUMN "repartidor_id";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "availability",
DROP COLUMN "last_active_at";

-- DropEnum
DROP TYPE "RepartidorAvailability";

