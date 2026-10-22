// Keyset pagination: order by (createdAt desc, id desc) and resume after the last row seen.
// The cursor is opaque to clients: base64url of the last row's createdAt and id.

export interface Cursor {
  createdAt: Date;
  id: string;
}

function encodeCursor({ createdAt, id }: Cursor): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");
}

// What encodeCursor writes. Anything else (an id that isn't a uuid, a date outside years
// 0000–9999) would reach Postgres and fail there as a 500 instead of a 400.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns null for anything that isn't a cursor this API issued. */
export function decodeCursor(cursor: string): Cursor | null {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (typeof createdAt !== "string" || !ISO_DATE.test(createdAt)) return null;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return { createdAt: date, id };
  } catch {
    return null;
  }
}

/** Splits `rows` fetched with `limit + 1` into the page and the cursor for the next one. */
export function toPage<T extends Cursor>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
