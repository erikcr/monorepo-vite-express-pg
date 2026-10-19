// Keyset pagination: order by (createdAt desc, id desc) and resume after the last row seen.
// The cursor is opaque to clients: base64url of the last row's createdAt and id.

export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor({ createdAt, id }: Cursor): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");
}

/** Returns null for anything that isn't a cursor this API issued. */
export function decodeCursor(cursor: string): Cursor | null {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
    const date = new Date(createdAt);
    if (typeof id !== "string" || Number.isNaN(date.getTime())) return null;
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
