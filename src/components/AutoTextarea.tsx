import { useLayoutEffect, useRef, type ComponentProps } from "react";

/**
 * Textarea that grows to fit its content so it never scrolls, while remaining
 * manually resizable — once the user drags the handle, auto-sizing stops.
 */
export function AutoTextarea({ value, ...props }: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const autoHeight = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const userResized =
      autoHeight.current !== null &&
      Math.abs(el.offsetHeight - autoHeight.current) > 1;
    if (userResized) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    autoHeight.current = el.offsetHeight;
  }, [value]);

  return <textarea ref={ref} value={value} {...props} />;
}
