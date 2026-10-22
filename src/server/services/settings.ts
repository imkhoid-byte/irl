import { one, run, type Db } from "../db";
import { POLICY } from "@/lib/policy";
import { nowIso } from "@/lib/time";
import { audit } from "./audit";
import { AppError } from "../errors";

const DEFAULTS = {
  service_fee_cents: String(POLICY.defaultServiceFeeCents),
  late_cancel_refund_pct: String(POLICY.defaultLateCancelRefundPct),
} as const;
export type SettingKey = keyof typeof DEFAULTS;

export function getSetting(db: Db, key: SettingKey): string {
  return one<{ value: string }>(db, "SELECT value FROM platform_settings WHERE key = ?", key)?.value ?? DEFAULTS[key];
}

export function getServiceFeeCents(db: Db): number {
  return Number(getSetting(db, "service_fee_cents"));
}

export function getLateRefundPct(db: Db): number {
  return Number(getSetting(db, "late_cancel_refund_pct"));
}

export function updateSettings(db: Db, actorId: string, values: { serviceFeeCents: number; lateRefundPct: number }) {
  if (!Number.isInteger(values.serviceFeeCents) || values.serviceFeeCents < 0 || values.serviceFeeCents > 5000)
    throw new AppError("invalid", "Service fee must be between $0 and $50.");
  if (!Number.isInteger(values.lateRefundPct) || values.lateRefundPct < 0 || values.lateRefundPct > 100)
    throw new AppError("invalid", "Late-cancellation refund must be 0–100%.");
  const set = (key: SettingKey, value: string) =>
    run(db, "INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, value, nowIso());
  set("service_fee_cents", String(values.serviceFeeCents));
  set("late_cancel_refund_pct", String(values.lateRefundPct));
  audit(db, actorId, "settings.updated", "platform_settings", null, values);
}
