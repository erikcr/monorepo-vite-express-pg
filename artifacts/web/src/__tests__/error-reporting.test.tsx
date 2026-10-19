import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn(
  async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 })
);
const reports = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/api/client-errors"))
    .map(([, init]) => JSON.parse(String(init?.body)));

beforeEach(() => {
  vi.resetModules(); // fresh per-page report counter
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {}); // React logs caught render errors
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error("render exploded");
}

describe("ErrorBoundary", () => {
  it("shows the fallback and reports the error with its component stack", async () => {
    const { ErrorBoundary } = await import("@repo/api-client-react/errors");
    render(
      <ErrorBoundary app="web" fallback={() => <p>crash screen</p>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("crash screen")).toBeTruthy();
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
    expect(reports()[0]).toMatchObject({ app: "web", message: "render exploded" });
    expect(reports()[0].componentStack).toContain("Boom");
  });
});

describe("reportError", () => {
  it("trims oversized fields and stops after 10 reports per page", async () => {
    const { reportError } = await import("@repo/api-client-react/errors");
    for (let i = 0; i < 15; i++) reportError("web", new Error("x".repeat(5000)));
    await vi.waitFor(() => expect(reports()).toHaveLength(10));
    expect(reports()[0].message).toHaveLength(2000);
  });

  it("never throws, even when the report can't be sent", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { reportError } = await import("@repo/api-client-react/errors");
    expect(() => reportError("web", "a string, not an Error")).not.toThrow();
  });
});

describe("installGlobalErrorReporting", () => {
  it("reports uncaught errors until cleaned up", async () => {
    const { installGlobalErrorReporting } = await import("@repo/api-client-react/errors");
    const remove = vi.spyOn(window, "removeEventListener");
    const cleanup = installGlobalErrorReporting("web");
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("uncaught") }));
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
    expect(reports()[0].message).toBe("uncaught");
    cleanup();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(["error", "unhandledrejection"]);
  });
});
