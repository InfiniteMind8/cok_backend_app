-- D.14: Add floor_kcrd to Wallet for system wallet floor protection
ALTER TABLE "Wallet" ADD COLUMN "floor_kcrd" DECIMAL(20,8);
