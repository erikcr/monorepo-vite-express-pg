import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App.tsx";

vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useListExamples: () => ({ data: undefined, isLoading: true, error: null }),
}));

describe("App (admin)", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });

  it("shows the admin heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /admin/i })).toBeTruthy();
  });

  it("shows the overview section", () => {
    render(<App />);
    expect(screen.getByText("Overview")).toBeTruthy();
  });
});
