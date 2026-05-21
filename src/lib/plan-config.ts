/**
 * PdfCrux — Plan Configuration & Limits
 *
 * Dev mode: NEXT_PUBLIC_DEV_MODE=true bypasses ALL limits.
 * In production: set NEXT_PUBLIC_DEV_MODE=false or remove it.
 */

export const IS_DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
  (typeof window !== "undefined" && window.location.hostname === "localhost");

export type PlanType = "free" | "premium" | "enterprise";

export interface PlanConfig {
  id: PlanType;
  label: string;
  price: string;
  storageLimit: number; // in KB (0 = unlimited)
  downloadLimit: number; // lifetime downloads (0 = unlimited)
  historyLimit: number; // max visible entries (0 = unlimited)
  features: string[];
}

export const PLANS: Record<PlanType, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    price: "$0",
    storageLimit: 50 * 1024, // 50 MB
    downloadLimit: 3,
    historyLimit: 3,
    features: ["50 MB storage", "3 lifetime downloads", "Last 3 history entries", "All PDF tools"],
  },
  premium: {
    id: "premium",
    label: "Premium",
    price: "$4.99/mo",
    storageLimit: 1024 * 1024, // 1 GB
    downloadLimit: 0, // unlimited
    historyLimit: 0, // unlimited
    features: ["1 GB storage", "Unlimited downloads", "Full history access", "Downloadable files", "Priority support"],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    price: "$17.99/mo",
    storageLimit: 10 * 1024 * 1024, // 10 GB
    downloadLimit: 0,
    historyLimit: 0,
    features: ["10 GB storage", "Unlimited downloads", "Full history access", "90-day retention", "Priority processing", "Dedicated support"],
  },
};

export function getPlanConfig(plan: PlanType): PlanConfig {
  return PLANS[plan] || PLANS.free;
}

/** Check if user can store more files */
export function canStoreMore(
  plan: PlanType,
  storageUsedKB: number,
  fileKB: number
): boolean {
  if (IS_DEV_MODE) return true;
  const config = getPlanConfig(plan);
  if (config.storageLimit === 0) return true; // unlimited
  return storageUsedKB + fileKB <= config.storageLimit;
}

/** Check if user can download more */
export function canDownloadMore(
  plan: PlanType,
  downloadCount: number
): boolean {
  if (IS_DEV_MODE) return true;
  const config = getPlanConfig(plan);
  if (config.downloadLimit === 0) return true; // unlimited
  return downloadCount < config.downloadLimit;
}

/** Get how many history entries to show */
export function getHistoryLimit(plan: PlanType): number {
  if (IS_DEV_MODE) return 0; // 0 = show all
  return getPlanConfig(plan).historyLimit;
}

/** Format KB to human readable */
export function formatStorage(kb: number): string {
  if (kb === 0) return "0 KB";
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
}

/** Get storage usage percentage */
export function getStoragePercent(plan: PlanType, storageUsedKB: number): number {
  if (IS_DEV_MODE) return 0;
  const config = getPlanConfig(plan);
  if (config.storageLimit === 0) return 0; // unlimited
  return Math.min(Math.round((storageUsedKB / config.storageLimit) * 100), 100);
}
