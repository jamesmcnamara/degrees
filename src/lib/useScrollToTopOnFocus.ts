import { useEffect } from "react";

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const isTextEntryElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  return false;
};

const STICKY_HEADER_SELECTOR = ".appbar";
const EXTRA_TOP_GAP = 6;
const KEYBOARD_SETTLE_TIMEOUT = 350;

/** Height of any sticky header the page keeps pinned at its top, in px. */
const stickyHeaderHeight = (): number => {
  const header = document.querySelector(STICKY_HEADER_SELECTOR);
  return header instanceof HTMLElement
    ? header.getBoundingClientRect().height
    : 0;
};

const scrollFieldToTop = (el: HTMLElement) => {
  const offset = window.scrollY + el.getBoundingClientRect().top;
  const top = Math.max(0, offset - stickyHeaderHeight() - EXTRA_TOP_GAP);
  window.scrollTo({ top, behavior: "smooth" });
};

/**
 * Scrolls the focused text box to the top of the viewport (just below any
 * sticky header) whenever it gains focus. Uses a single document-level
 * `focusin` listener, so it applies app-wide without wiring up individual
 * fields.
 */
export function useScrollToTopOnFocus() {
  useEffect(() => {
    let cancelPending: (() => void) | undefined;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!isTextEntryElement(target)) return;
      const el = target as HTMLElement;

      // Cancel any scroll still waiting on a previous focus, so switching
      // fields quickly doesn't fire a stale, mistargeted scroll later.
      cancelPending?.();

      const viewport = window.visualViewport;
      if (!viewport) {
        const frame = requestAnimationFrame(() => scrollFieldToTop(el));
        cancelPending = () => cancelAnimationFrame(frame);
        return;
      }

      // On mobile, focusing a field can open the on-screen keyboard, which
      // resizes the visual viewport and triggers the browser's own
      // scroll-into-view. Running our scroll before that settles causes it
      // to stack with the browser's, overshooting past the field or
      // jittering. Wait for the resize (or a timeout, if none happens)
      // before doing a single corrective scroll.
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        viewport.removeEventListener("resize", finish);
        clearTimeout(timer);
        scrollFieldToTop(el);
      };
      viewport.addEventListener("resize", finish);
      const timer = setTimeout(finish, KEYBOARD_SETTLE_TIMEOUT);
      cancelPending = () => {
        done = true;
        viewport.removeEventListener("resize", finish);
        clearTimeout(timer);
      };
    };

    return addEventListener("focusin", onFocusIn, {
      onCleanup: cancelPending,
    });
  }, []);
}

interface EventListenerOptions {
  listener?: boolean | AddEventListenerOptions;
  onCleanup?: () => void;
}

function addEventListener<K extends keyof DocumentEventMap>(
  type: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => any,
  options?: EventListenerOptions,
): () => void {
  document.addEventListener(type, listener, options?.listener);
  return () => {
    document.removeEventListener(type, listener, options?.listener);
    options?.onCleanup?.();
  };
}
