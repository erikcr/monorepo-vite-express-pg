import { describe, expect, it } from "vitest";
import {
  applyPortMoves,
  BLOCK_COUNT,
  blockPorts,
  localPort,
  localPorts,
  PORT_DEFAULTS,
  PORT_GROUPS,
  planPortMoves,
  portMoves,
  projectBlock,
} from "../ports.js";

describe("localPort", () => {
  it("is the variable when set, else the default", () => {
    expect(localPort("WEB_PORT", {})).toBe(5173);
    expect(localPort("WEB_PORT", { WEB_PORT: "" })).toBe(5173);
    expect(localPort("WEB_PORT", { WEB_PORT: "5183" })).toBe(5183);
  });

  it("rejects a value that isn't a port, naming the variable", () => {
    for (const bad of ["abc", "0", "65536", "51.5"]) {
      expect(() => localPort("DB_PORT", { DB_PORT: bad })).toThrow("Invalid env var DB_PORT");
    }
  });

  it("reads process.env by default", () => {
    expect(localPort("E2E_API_PORT")).toBe(Number(process.env.E2E_API_PORT ?? 3100));
  });
});

describe("localPorts", () => {
  it("has every port, overrides applied", () => {
    expect(localPorts({ DB_PORT: "5434" })).toEqual({ ...PORT_DEFAULTS, DB_PORT: 5434 });
  });
});

describe("projectBlock", () => {
  it("is the same block for a name every time", () => {
    expect(projectBlock("jig-and-kerf")).toBe(projectBlock("jig-and-kerf"));
  });

  it("stays inside the blocks, however long the name", () => {
    for (const name of ["", "a", "monorepo-vite-express-pg", "x".repeat(500)]) {
      const block = projectBlock(name);
      expect(block).toBeGreaterThanOrEqual(0);
      expect(block).toBeLessThan(BLOCK_COUNT);
    }
  });

  it("gives this machine's kinds of name different blocks", () => {
    const names = ["monorepo-vite-express-pg", "jig-and-kerf", "trustxp-monorepo", "shop", "shop2"];
    expect(new Set(names.map(projectBlock)).size).toBe(names.length);
  });
});

describe("blockPorts", () => {
  it("has a port for every variable, all different and away from the defaults", () => {
    const ports = Object.values(blockPorts(12));
    expect(ports).toEqual([20120, 20121, 20122, 20123, 20124, 20125, 20126]);
    expect(Object.keys(blockPorts(12))).toEqual(PORT_GROUPS.all);
  });

  it("never overlaps the next block, and the last block is a valid port", () => {
    const last = Math.max(...Object.values(blockPorts(0)));
    expect(blockPorts(1).DB_PORT).toBeGreaterThan(last);
    expect(() =>
      localPorts(
        Object.fromEntries(
          Object.entries(blockPorts(BLOCK_COUNT - 1)).map(([k, v]) => [k, String(v)])
        )
      )
    ).not.toThrow();
  });
});

describe("portMoves", () => {
  it("moves every port that differs, and none that is already there", () => {
    const current = { ...PORT_DEFAULTS, DB_PORT: 20120 };
    const moves = portMoves(current, blockPorts(12));
    expect(moves[0]).toEqual({ name: "PORT", from: 3000, to: 20121 });
    expect(moves.map((m) => m.name)).toEqual(PORT_GROUPS.all.filter((n) => n !== "DB_PORT"));
  });

  it("is nothing when the project already has its block", () => {
    expect(portMoves(blockPorts(12), blockPorts(12))).toEqual([]);
  });

  it("rewrites a copied .env.example from the defaults to the block", () => {
    const envText = [
      "DATABASE_URL=postgres://postgres:postgres@localhost:5432/appdb",
      "PORT=3000",
      "CORS_ORIGIN=http://localhost:5173,http://localhost:3001",
      "",
    ].join("\n");
    const moved = applyPortMoves(envText, portMoves({ ...PORT_DEFAULTS }, blockPorts(12)));
    expect(moved).toContain("DATABASE_URL=postgres://postgres:postgres@localhost:20120/appdb");
    expect(moved).toContain("\nPORT=20121\n");
    expect(moved).toContain("CORS_ORIGIN=http://localhost:20122,http://localhost:20123");
    expect(moved).toContain("\nE2E_ADMIN_PORT=20126\n");
  });
});

describe("planPortMoves", () => {
  const current = { ...PORT_DEFAULTS };

  it("moves nothing when every port is free", () => {
    expect(planPortMoves(current, PORT_GROUPS.all, () => false)).toEqual([]);
  });

  it("moves a taken port to the next free one", () => {
    const taken = new Set([5174, 5175]);
    expect(planPortMoves(current, PORT_GROUPS.e2e, (p) => taken.has(p))).toEqual([
      { name: "E2E_WEB_PORT", from: 5174, to: 5176 },
    ]);
  });

  it("never lands on another of the project's ports, even one it isn't checking", () => {
    // 3001 is ADMIN_PORT and 3002 E2E_ADMIN_PORT: neither is held, but both belong to the project.
    expect(planPortMoves(current, ["PORT"], (p) => p === 3000)).toEqual([
      { name: "PORT", from: 3000, to: 3003 },
    ]);
  });

  it("gives two moved ports different new ones", () => {
    const ports = { ...current, WEB_PORT: 4000, ADMIN_PORT: 4001 };
    const taken = new Set([4000, 4001]);
    expect(planPortMoves(ports, ["WEB_PORT", "ADMIN_PORT"], (p) => taken.has(p))).toEqual([
      { name: "WEB_PORT", from: 4000, to: 4002 },
      { name: "ADMIN_PORT", from: 4001, to: 4003 },
    ]);
  });

  it("fails when no port above is free", () => {
    const ports = { ...current, PORT: 65_534 };
    expect(() => planPortMoves(ports, ["PORT"], (p) => p >= 65_534)).toThrow(
      "No free port above 65534 for PORT"
    );
  });
});

describe("applyPortMoves", () => {
  const envText = [
    "DATABASE_URL=postgres://postgres:postgres@localhost:5432/appdb",
    "PORT=3000",
    "CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:3001",
    "# WEB_URL=http://localhost:5173",
    "",
  ].join("\n");

  it("leaves the text alone when nothing moved", () => {
    expect(applyPortMoves(envText, [])).toBe(envText);
  });

  it("replaces a variable already set, and the URLs that used its port", () => {
    const moved = applyPortMoves(envText, [
      { name: "PORT", from: 3000, to: 3003 },
      { name: "ADMIN_PORT", from: 3001, to: 3004 },
      { name: "DB_PORT", from: 5432, to: 5434 },
    ]);
    expect(moved).toBe(
      [
        "DATABASE_URL=postgres://postgres:postgres@localhost:5434/appdb",
        "PORT=3003",
        "CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:3004",
        "# WEB_URL=http://localhost:5173",
        "",
        "# Local ports, set by `pnpm ports`.",
        "ADMIN_PORT=3004",
        "DB_PORT=5434",
        "",
      ].join("\n")
    );
  });

  it("adds no heading when every moved variable was already set", () => {
    expect(applyPortMoves("PORT=3000\n", [{ name: "PORT", from: 3000, to: 3003 }])).toBe(
      "PORT=3003\n"
    );
  });

  it("adds a later move's variable to the block an earlier one started", () => {
    const once = applyPortMoves("PORT=3000\n", [{ name: "E2E_WEB_PORT", from: 5174, to: 5175 }]);
    expect(applyPortMoves(once, [{ name: "WEB_PORT", from: 5173, to: 5177 }])).toBe(
      "PORT=3000\n\n# Local ports, set by `pnpm ports`.\nE2E_WEB_PORT=5175\nWEB_PORT=5177\n"
    );
  });

  it("swaps ports in one pass, so a move never feeds another", () => {
    const moved = applyPortMoves("CORS_ORIGIN=http://localhost:5173,http://localhost:5174\n", [
      { name: "WEB_PORT", from: 5173, to: 5174 },
      { name: "E2E_WEB_PORT", from: 5174, to: 5175 },
    ]);
    expect(moved.split("\n")[0]).toBe("CORS_ORIGIN=http://localhost:5174,http://localhost:5175");
  });

  it("writes a new file's variables without a leading blank line", () => {
    expect(applyPortMoves("", [{ name: "E2E_WEB_PORT", from: 5174, to: 5175 }])).toBe(
      "# Local ports, set by `pnpm ports`.\nE2E_WEB_PORT=5175\n"
    );
  });
});
