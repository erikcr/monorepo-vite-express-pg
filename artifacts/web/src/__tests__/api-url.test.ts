import { resolveBrowserApiBase } from "@repo/api-client-react/client";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveBrowserApiBase (VITE_API_URL)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a valid absolute URL", () => {
    expect(resolveBrowserApiBase("https://api.example.com", true)).toBe("https://api.example.com");
  });

  it.each(["api.example.com", "https://api.example.com/", "/api", "ftp://x"])(
    "throws for a malformed value: %s",
    (value) => {
      expect(() => resolveBrowserApiBase(value, true)).toThrow("VITE_API_URL must be");
    }
  );

  it("falls back to same-origin, logging only in a production build", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveBrowserApiBase(undefined, false)).toBe("");
    expect(error).not.toHaveBeenCalled();
    expect(resolveBrowserApiBase(undefined, true)).toBe("");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("VITE_API_URL is not set"));
  });
});
