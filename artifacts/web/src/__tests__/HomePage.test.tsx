import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "../pages/HomePage.tsx";

vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
}));

describe("HomePage", () => {
  it("renders without crashing", () => {
    render(<HomePage />);
    expect(document.body).toBeTruthy();
  });

  it("shows the status section", () => {
    render(<HomePage />);
    expect(screen.getByText("Status")).toBeTruthy();
  });

  it("shows theme tokens section", () => {
    render(<HomePage />);
    expect(screen.getByText("Theme tokens")).toBeTruthy();
  });
});
