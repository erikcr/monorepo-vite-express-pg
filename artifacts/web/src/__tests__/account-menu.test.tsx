import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu, AccountMenuSkeleton } from "../components/AccountMenu.tsx";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));
vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
}));

const open = () => fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
const trigger = () => screen.getByRole("button", { name: "Account menu" });
const onSettings = vi.fn();
const renderMenu = () =>
  render(<AccountMenu items={[{ label: "Settings", onSelect: onSettings }]} />);

beforeEach(() => {
  clerk.signedIn = true;
  clerk.loaded = true;
  clerk.user.fullName = "Ada Lovelace";
  clerk.user.hasImage = false;
  clerk.signOut.mockClear();
  onSettings.mockClear();
});
afterEach(cleanup);

describe("the account menu", () => {
  it("stays closed until asked, then says who's signed in", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    open();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@x.test")).toBeTruthy();
  });

  it("shows the email once when the account has no name", () => {
    clerk.user.fullName = null;
    renderMenu();
    open();
    expect(screen.getAllByText("ada@x.test")).toHaveLength(1);
  });

  it("shows initials, or the person's picture when they've set one", () => {
    const { unmount, container } = renderMenu();
    expect(trigger().textContent).toBe("AL");
    expect(container.querySelector("img")).toBeNull();
    unmount();
    clerk.user.hasImage = true;
    const again = renderMenu();
    expect(again.container.querySelector("img")?.getAttribute("src")).toBe(clerk.user.imageUrl);
    expect(trigger().textContent).toBe("");
  });

  it("runs an item, closing first and leaving focus on the button", () => {
    renderMenu();
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(onSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("signs out", () => {
    renderMenu();
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(clerk.signOut).toHaveBeenCalledOnce();
  });

  it("closes on a second click, and on a click outside it", () => {
    renderMenu();
    open();
    open();
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Settings" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves focus in on opening, and around with the keyboard", () => {
    renderMenu();
    open();
    const settings = screen.getByRole("menuitem", { name: "Settings" });
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });
    expect(document.activeElement).toBe(settings);
    press("ArrowDown");
    expect(document.activeElement).toBe(signOut);
    press("ArrowDown");
    expect(document.activeElement).toBe(settings);
    press("ArrowUp");
    expect(document.activeElement).toBe(signOut);
    press("Home");
    expect(document.activeElement).toBe(settings);
    press("End");
    expect(document.activeElement).toBe(signOut);
    press("a");
    expect(document.activeElement).toBe(signOut);
  });

  it.each(["Escape", "Tab"])("%s closes it, with focus back on the button", (key) => {
    renderMenu();
    open();
    fireEvent.keyDown(screen.getByRole("menu"), { key });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("has a skeleton in the same box as the button, so loading moves nothing", () => {
    renderMenu();
    const box = trigger().className.replace(" hover:bg-brand-subtle", "");
    const avatar = trigger().firstElementChild?.className;
    const { container } = render(<AccountMenuSkeleton />);
    const skeleton = container.firstElementChild;
    expect(skeleton?.className).toBe(box);
    expect(avatar).toContain("size-8 rounded-full shrink-0");
    expect(skeleton?.firstElementChild?.className).toContain("size-8 rounded-full shrink-0");
    expect(skeleton?.lastElementChild?.className).toBe("size-4");
  });
});

describe("the header while Clerk loads", () => {
  it("holds the account's place, offering neither sign-in nor the menu", async () => {
    clerk.loaded = false;
    clerk.signedIn = false;
    renderAt("/about");
    await screen.findByRole("heading", { name: "About" });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(document.querySelector("header [aria-hidden]")).toBeTruthy();
  });
});
