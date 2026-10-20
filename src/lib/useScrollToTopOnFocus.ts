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

const isTextEntryElement = (target: Element | null): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      !NON_TEXT_INPUT_TYPES.has(target.type)));

export function useScrollToTopOnFocus() {
  useEffect(() => {
    let frame = 0;
    const scrollFocusedField = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (isTextEntryElement(field)) {
          field.scrollIntoView({
            block: "start",
            inline: "nearest",
            behavior: "instant",
          });
        }
      });
    };

    document.addEventListener("focusin", scrollFocusedField);
    window.addEventListener("resize", scrollFocusedField);
    return () => {
      document.removeEventListener("focusin", scrollFocusedField);
      window.removeEventListener("resize", scrollFocusedField);
      cancelAnimationFrame(frame);
    };
  }, []);
}
