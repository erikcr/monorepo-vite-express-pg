import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "../App.tsx";

vi.mock("@repo/api-client-react", () => ({
  useExamples: () => ({ data: undefined, isLoading: true }),
}));

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });

  it("shows loading state", () => {
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});
