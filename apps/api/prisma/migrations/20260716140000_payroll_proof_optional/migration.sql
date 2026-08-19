-- El comprobante del abono semanal de nómina pasa a ser opcional.
ALTER TABLE "payroll_week_payments" ALTER COLUMN "proof_image_key" DROP NOT NULL;
