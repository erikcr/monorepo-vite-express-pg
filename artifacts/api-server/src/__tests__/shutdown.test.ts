import { afterEach, describe, expect, it, vi } from "vitest";
import { onShutdown } from "../shutdown.js";

describe("onShutdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the steps in order on SIGTERM, then exits 0", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const order: string[] = [];
    onShutdown([
      async () => order.push("server"),
      async () => order.push("jobs"),
      async () => order.push("db"),
    ]);
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(order).toEqual(["server", "jobs", "db"]);
  });

  it("exits 1 when a step fails, without running the rest", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const db = vi.fn();
    onShutdown([() => Promise.reject(new Error("stuck")), db]);
    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(db).not.toHaveBeenCalled();
  });
});
