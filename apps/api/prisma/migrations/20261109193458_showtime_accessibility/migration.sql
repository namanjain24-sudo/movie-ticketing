-- CreateEnum
CREATE TYPE "AccessibilityFeature" AS ENUM ('AUDIO_DESCRIPTION', 'CLOSED_CAPTIONS', 'INDIAN_SIGN_LANGUAGE');

-- AlterTable
ALTER TABLE "Showtime" ADD COLUMN     "accessibility" "AccessibilityFeature"[];
