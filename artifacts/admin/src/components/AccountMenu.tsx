import { useClerk, useUser } from "@clerk/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

// The trigger and its skeleton share this box, so nothing moves when Clerk finishes loading.
const triggerBox = "flex items-center gap-1 rounded-full p-0.5";
const avatarBox = "size-8 rounded-full shrink-0";
const item = "block w-full px-4 py-2 text-left text-sm hover:bg-brand-subtle focus:bg-brand-subtle";

/** Holds the account menu's place until Clerk says who's signed in. */
export function AccountMenuSkeleton() {
  return (
    <span aria-hidden className={triggerBox}>
      <span className={`${avatarBox} block bg-border-subtle motion-safe:animate-pulse`} />
      <span className="size-4" />
    </span>
  );
}

function Avatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  if (imageUrl) return <img src={imageUrl} alt="" className={`${avatarBox} object-cover`} />;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      className={`${avatarBox} flex items-center justify-center bg-brand-subtle text-text text-xs font-medium`}
    >
      {initials}
    </span>
  );
}

/**
 * The signed-in person's menu: who they are, this app's `items`, and signing out. Keyboard use
 * follows the menu pattern: focus moves in on opening, arrows move it, Escape and Tab close it
 * and put it back on the button, so a dialog an item opens returns focus there too.
 */
export function AccountMenu({ items }: { items: { label: string; onSelect: () => void }[] }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const closeOutside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const select = (action: () => void) => {
    close();
    action();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") return close();
    const options = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = {
      ArrowDown: (at + 1) % options.length,
      ArrowUp: (at - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1,
    };
    const target = targets[e.key];
    if (target === undefined) return;
    e.preventDefault();
    options[target]?.focus();
  };

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName || email;

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${triggerBox} hover:bg-brand-subtle`}
        onClick={() => setOpen(!open)}
      >
        <Avatar name={name} imageUrl={user?.hasImage ? user.imageUrl : undefined} />
        <svg viewBox="0 0 16 16" fill="none" className="size-4 text-text-muted" aria-hidden>
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full mt-2 w-64 z-20 bg-surface-raised border border-border rounded-card shadow-lg"
        >
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-sm font-medium truncate">{name}</p>
            {email !== name && <p className="text-xs text-text-muted truncate">{email}</p>}
          </div>
          <div className="py-1 border-b border-border-subtle">
            {items.map(({ label, onSelect }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className={item}
                onClick={() => select(onSelect)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => select(() => signOut())}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
