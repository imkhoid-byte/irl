import { getDb } from "@/server/db/client";
import { getPhoto } from "@/server/services/profiles";
import { currentUser, storage } from "@/server/session";

/** Profile photos are only served to signed-in members — never to anonymous scrapers. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const photo = getPhoto(getDb(), id);
  const bytes = photo && (await storage.get(photo.storage_key));
  if (!photo || !bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": photo.mime_type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
