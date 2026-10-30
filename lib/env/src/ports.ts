// Local ports. Each can be set in the repo-root .env, so several projects made from this
// template run side by side: `pnpm ports assign` (scripts/ports.ts) gives a project its own block,
// and `pnpm ports` moves any port that another program holds.
// No side effects on import: the Vite and Playwright configs read these too.

export const PORT_DEFAULTS = {
  /** Local Postgres (docker compose), on the host. */
  DB_PORT: 5432,
  /** The API in development. */
  PORT: 3000,
  WEB_PORT: 5173,
  ADMIN_PORT: 3001,
  E2E_API_PORT: 3100,
  E2E_WEB_PORT: 5174,
  E2E_ADMIN_PORT: 3002,
} as const;

export type PortName = keyof typeof PORT_DEFAULTS;

/** Which ports each command needs: `pnpm dev` doesn't start Postgres, so it leaves DB_PORT alone. */
export const PORT_GROUPS = {
  dev: ["PORT", "WEB_PORT", "ADMIN_PORT"],
  e2e: ["E2E_API_PORT", "E2E_WEB_PORT", "E2E_ADMIN_PORT"],
  all: Object.keys(PORT_DEFAULTS) as PortName[],
} as const satisfies Record<string, readonly PortName[]>;

const MAX_PORT = 65_535;

/** The port to use: the variable when set, else the default. */
export function localPort(
  name: PortName,
  source: Record<string, string | undefined> = process.env
): number {
  const value = source[name];
  if (value === undefined || value === "") return PORT_DEFAULTS[name];
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`Invalid env var ${name}: "${value}" is not a port (1-${MAX_PORT})`);
  }
  return port;
}

export type PortMove = { name: PortName; from: number; to: number };

const PORTS_HEADING = "# Local ports, set by `pnpm ports`.";

// A project's own ports sit together in a block, away from the defaults and from anything that
// listens on them by habit.
const FIRST_BLOCK_PORT = 20_000;
const BLOCK_SIZE = 10;
export const BLOCK_COUNT = 1_000;

/** The block a project's name picks: always the same one, so nothing has to record it. */
export function projectBlock(name: string): number {
  let hash = 0;
  for (const byte of Buffer.from(name)) hash = (hash * 31 + byte) % BLOCK_COUNT;
  return hash;
}

/** The ports in `block`, one per variable, in PORT_GROUPS.all's order. */
export function blockPorts(block: number): Record<PortName, number> {
  const ports = {} as Record<PortName, number>;
  PORT_GROUPS.all.forEach((name, i) => {
    ports[name] = FIRST_BLOCK_PORT + block * BLOCK_SIZE + i;
  });
  return ports;
}

/** The moves that turn `current` into `target`, skipping ports already there. */
export function portMoves(
  current: Record<PortName, number>,
  target: Record<PortName, number>
): PortMove[] {
  return PORT_GROUPS.all
    .filter((name) => current[name] !== target[name])
    .map((name) => ({ name, from: current[name], to: target[name] }));
}

/** Every port this project uses, from the variables or the defaults. */
export function localPorts(
  source: Record<string, string | undefined> = process.env
): Record<PortName, number> {
  const ports = {} as Record<PortName, number>;
  for (const name of PORT_GROUPS.all) ports[name] = localPort(name, source);
  return ports;
}

/**
 * For each of `names` whose port another program holds, the next free one above it. A moved port
 * never lands on another of the project's ports (`current` has them all, checked or not).
 */
export function planPortMoves(
  current: Record<PortName, number>,
  names: readonly PortName[],
  isTaken: (port: number) => boolean
): PortMove[] {
  const inUse = new Set(Object.values(current));
  const moves: PortMove[] = [];
  for (const name of names) {
    const from = current[name];
    if (!isTaken(from)) continue;
    let to = from + 1;
    while (to <= MAX_PORT && (inUse.has(to) || isTaken(to))) to++;
    if (to > MAX_PORT) throw new Error(`No free port above ${from} for ${name}`);
    inUse.add(to);
    moves.push({ name, from, to });
  }
  return moves;
}

/**
 * The .env text with the moves applied: each variable set (replaced, or appended under a
 * heading), and `localhost:<from>` in other values (DATABASE_URL, CORS_ORIGIN, WEB_URL) changed
 * to the new port. Comments are left as they are.
 */
export function applyPortMoves(envText: string, moves: PortMove[]): string {
  if (moves.length === 0) return envText;
  const byFrom = new Map(moves.map((m) => [String(m.from), m.to]));
  const unset = new Set(moves.map((m) => m.name));
  const lines = envText.split("\n").map((line) => {
    if (line.trimStart().startsWith("#")) return line;
    const move = moves.find((m) => line.startsWith(`${m.name}=`));
    if (move) {
      unset.delete(move.name);
      return `${move.name}=${move.to}`;
    }
    return line.replace(
      /\b(localhost|127\.0\.0\.1):(\d+)\b/g,
      (match, host: string, port: string) => {
        const to = byFrom.get(port);
        return to === undefined ? match : `${host}:${to}`;
      }
    );
  });
  const added = moves.filter((m) => unset.has(m.name)).map((m) => `${m.name}=${m.to}`);
  if (added.length === 0) return lines.join("\n");
  const body = lines.join("\n").replace(/\n*$/, "");
  // Later moves join the block an earlier one started.
  if (body.includes(PORTS_HEADING)) return `${body}\n${added.join("\n")}\n`;
  return `${body ? `${body}\n\n` : ""}${PORTS_HEADING}\n${added.join("\n")}\n`;
}
