import { id, run, type Db } from "../db";
import { nowIso } from "@/lib/time";

export function audit(db: Db, actorId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  run(db, "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id(), actorId, action, entityType, entityId, JSON.stringify(metadata), nowIso());
}
