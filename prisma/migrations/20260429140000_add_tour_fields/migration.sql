-- D.7: add onboarding tour timestamp fields to User
ALTER TABLE "User" ADD COLUMN "onboardingTourCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "onboardingTourDismissedAt" TIMESTAMP(3);
