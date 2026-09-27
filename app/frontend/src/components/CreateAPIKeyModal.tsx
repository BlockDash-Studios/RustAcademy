import {
  AVAILABLE_SCOPES,
  type ApiKeyScope,
  type NewKeyForm,
} from "@/app/settings/developer/api-key-types";
import React from "react";
import { useEffect, useRef } from "react";

type Props = {
  setModalOpen: (state: boolean) => void;
  newKey: NewKeyForm;
  setNewKey: React.Dispatch<React.SetStateAction<NewKeyForm>>;
  generateKey: () => void;
  loading: boolean;
};

// Human-readable label/description shown for each selectable API key
// scope, keyed by the underlying scope identifier.
const SCOPE_LABELS: Record<ApiKeyScope, { label: string; description: string }> = {
  "links:read":       { label: "links:read",       description: "Fetch and query payment links" },
  "links:write":      { label: "links:write",       description: "Create and update payment links" },
  "transactions:read":{ label: "transactions:read", description: "Read transaction history" },
  "usernames:read":   { label: "usernames:read",    description: "Look up registered usernames" },
};

// Modal dialog for creating a new API key: lets the user name the key,
// choose which scopes it grants, and submit to generate it. Implements
// its own focus-trap and Escape-to-close behavior for accessibility,
// since it renders as a plain fixed-position div rather than using the
// browser's native <dialog> element.
export default function CreateAPIKeyModal({
  setModalOpen,
  newKey,
  setNewKey,
  generateKey,
  loading,
}: Props) {
  // Root modal element, used to query focusable children for the tab trap.
  const modalRef = useRef<HTMLDivElement | null>(null);
  // The Cancel button, focused automatically when the modal opens.
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // Whatever element had focus before the modal opened, so it can be
  // restored once the modal closes.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // On mount: remember the previously focused element and move focus into
  // the modal (to the close button). On unmount: restore focus to
  // wherever it was before the modal opened.
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();

    return () => previousFocusRef.current?.focus();
  }, []);

  // Keyboard handler for the modal container:
  //  - Escape closes the modal (unless an action is in progress).
  //  - Tab/Shift+Tab is trapped within the modal's focusable elements,
  //    wrapping from last back to first (and vice versa) so focus never
  //    escapes to the page behind the modal.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !loading) {
      event.preventDefault();
      setModalOpen(false);
      return;
    }
    if (event.key !== "Tab" || !modalRef.current) return;
    const focusable = Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])"
      )
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Adds or removes a scope from the new key's selected scopes list.
  const toggleScope = (scope: ApiKeyScope) => {
    setNewKey((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-api-key-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop: clicking it closes the modal, but only when not loading */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && setModalOpen(false)}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div ref={modalRef} className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
        <h3 id="create-api-key-title" className="text-xl font-black">Create New API Key</h3>

        {/* Key name input */}
        <div className="space-y-2">
          <label htmlFor="api-key-name" className="text-xs font-black uppercase tracking-widest text-neutral-500">
            Key Name
          </label>
          <input
            id="api-key-name"
            type="text"
            placeholder="e.g. Production App"
            value={newKey.name}
            onChange={(e) =>
              setNewKey((prev) => ({ ...prev, name: e.target.value }))
            }
            className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500/60 focus-visible:ring-2 focus-visible:ring-indigo-300 placeholder:text-neutral-600"
          />
        </div>

        {/* Scope selection: a list of toggleable buttons, one per available scope */}
        <div className="space-y-2">
          <div id="api-key-scopes-label" className="text-xs font-black uppercase tracking-widest text-neutral-500">
            Scopes
          </div>
          <div className="space-y-2">
            {AVAILABLE_SCOPES.map((scope) => {
              const active = newKey.scopes.includes(scope);
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  aria-pressed={active}
                  aria-label={`${SCOPE_LABELS[scope].label}: ${SCOPE_LABELS[scope].description}`}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                    active
                      ? "border-indigo-500/40 bg-indigo-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {/* Custom checkbox indicator reflecting selected state */}
                  <div
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
                      active
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-white/20"
                    }`}
                  >
                    {active && "✓"}
                  </div>
                  <div>
                    <div className={`text-xs font-bold font-mono ${active ? "text-indigo-300" : "text-neutral-400"}`}>
                      {SCOPE_LABELS[scope].label}
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">
                      {SCOPE_LABELS[scope].description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions: Cancel (also the initial focus target) and Generate Key */}
        <div className="flex gap-3 pt-2">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setModalOpen(false)}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            Cancel
          </button>
          {/* Disabled until a name is entered and at least one scope is selected */}
          <button
            type="button"
            onClick={generateKey}
            disabled={!newKey.name.trim() || newKey.scopes.length === 0 || loading}
            className="flex-1 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            {loading ? "Creating…" : "Generate Key"}
          </button>
        </div>
      </div>
    </div>
  );
}