import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App.tsx";

vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
}));

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });

  it("shows the status section", () => {
    render(<App />);
    expect(screen.getByText("Status")).toBeTruthy();
  });

  it("shows theme tokens section", () => {
    render(<App />);
    expect(screen.getByText("Theme tokens")).toBeTruthy();
  });
});
