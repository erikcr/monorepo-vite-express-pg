import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, resolve, sep } from "node:path";
import {
  applyPortMoves,
  BLOCK_COUNT,
  blockPorts,
  localPorts,
  PORT_GROUPS,
  type PortMove,
  type PortName,
  planPortMoves,
  portMoves,
  projectBlock,
} from "@repo/env/ports";

// `pnpm ports assign`: run once per project, it gives this project its own block of ports, chosen
// from the folder's name and saved in the repo-root .env, so projects never share them, running
// or not.
// `pnpm ports [dev|e2e]`: checks this project's local ports (lib/env/src/ports.ts) and moves any
// another program holds to a free one, saved in .env. `pnpm dev` checks its group first, and the
// E2E run its own. A port this project's own servers hold is left alone.

const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");
// How far above a held port to look for a free one.
const SEARCH = 100;

/** Whether something listens on `port`, on any local address (IPv4 or IPv6). */
async function isListening(port: number): Promise<boolean> {
  for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
    const result = await new Promise<"free" | "taken" | "skip">((done) => {
      const server = createServer();
      server.once("error", (err: NodeJS.ErrnoException) =>
        done(err.code === "EADDRINUSE" || err.code === "EACCES" ? "taken" : "skip")
      );
      server.listen({ port, host, exclusive: true }, () => server.close(() => done("free")));
    });
    if (result === "taken") return true;
  }
  return false;
}

function run(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  } catch {
    return "";
  }
}

/** Whether this project's own servers hold `port`: a process started here, or its Postgres. */
function heldByThisProject(name: PortName, port: number): boolean {
  if (name === "DB_PORT") {
    return run("docker", ["compose", "port", "postgres", "5432"]).trim().endsWith(`:${port}`);
  }
  const pids = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).split("\n");
  return pids.filter(Boolean).some((pid) => {
    const cwd = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"])
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
    return cwd !== undefined && (cwd === root || cwd.startsWith(root + sep));
  });
}

/** The moves off the ports in `names` that another program holds. */
async function movesOffHeldPorts(
  current: Record<PortName, number>,
  names: readonly PortName[]
): Promise<PortMove[]> {
  // The held ports among this group's, and above each held one up to the first free port that
  // isn't already one of the project's (where planPortMoves will put it).
  const own = new Set(Object.values(current));
  const held = new Set<number>();
  for (const name of names) {
    const from = current[name];
    if (!(await isListening(from)) || heldByThisProject(name, from)) continue;
    held.add(from);
    for (let port = from + 1; port <= from + SEARCH; port++) {
      if (own.has(port)) continue;
      if (!(await isListening(port))) break;
      held.add(port);
    }
  }
  return planPortMoves(current, names, (port) => held.has(port));
}

/** Whether none of `ports` is held by another program. */
async function isFree(ports: Record<PortName, number>): Promise<boolean> {
  for (const name of PORT_GROUPS.all) {
    if ((await isListening(ports[name])) && !heldByThisProject(name, ports[name])) return false;
  }
  return true;
}

/** The block this project's name picks, or the next one up if something else is on it. */
async function assignedPorts(): Promise<Record<PortName, number>> {
  let block = projectBlock(basename(root));
  while (!(await isFree(blockPorts(block)))) block = (block + 1) % BLOCK_COUNT;
  return blockPorts(block);
}

async function main() {
  // CI runs one project per machine, with no .env to write.
  if (process.env.CI) return;
  const command = process.argv[2] ?? "all";
  const assign = command === "assign";
  const names = assign ? PORT_GROUPS.all : PORT_GROUPS[command as keyof typeof PORT_GROUPS];
  if (!names) throw new Error(`Unknown command "${command}": use assign, dev, e2e, or nothing`);

  const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  // As the apps read them: a variable set in the shell wins over .env.
  const current = localPorts({ ...parse(envText), ...process.env });

  const moves = assign
    ? portMoves(current, await assignedPorts())
    : await movesOffHeldPorts(current, names);
  if (moves.length === 0) {
    if (assign) console.log("ports: this project already has its own ports");
    else if (command === "all") console.log("ports: all free, or held by this project's servers");
    return;
  }
  writeFileSync(envPath, applyPortMoves(envText, moves));
  for (const { name, from, to } of moves) {
    const why = assign ? "this project's own" : `${from} is held by another program`;
    console.log(`ports: ${name} ${to} (${why}; saved in .env)`);
  }
  if (moves.some((m) => m.name === "DB_PORT")) {
    console.log("ports: start Postgres on the new port with `docker compose up -d postgres`");
  }
}

/** The .env's variables, read as text: the file is rewritten below, comments and all. */
function parse(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.match(/^\s*([A-Z0-9_]+)=(.*)$/))
      .filter((m) => m !== null)
      .map((m) => [m[1], m[2]?.trim() ?? ""])
  );
}

main().catch((err: unknown) => {
  console.error(`ports: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
