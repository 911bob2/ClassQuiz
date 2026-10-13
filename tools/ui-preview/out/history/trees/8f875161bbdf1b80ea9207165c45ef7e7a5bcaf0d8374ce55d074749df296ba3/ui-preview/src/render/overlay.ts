import { locate } from "./inspect";
export function installOverlay(id: number) {
  const box = document.createElement("div"),
    tip = document.createElement("div");
  for (const el of [box, tip]) {
    el.dataset.uipOverlay = "";
    el.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;";
    document.body.append(el);
  }
  box.style.border = "2px solid #a3e635";
  box.style.background = "#a3e63518";
  tip.style.cssText +=
    "background:#13221b;color:white;padding:8px 12px;border-radius:6px;font:12px/1.5 monospace;max-width:80vw;white-space:pre-wrap";
  document.addEventListener(
    "pointermove",
    (e) => {
      const el = e.target as HTMLElement;
      if (el.closest("[data-uip-overlay]")) return;
      const r = el.getBoundingClientRect(),
        loc = locate(el);
      Object.assign(box.style, {
        left: r.x + "px",
        top: r.y + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
      tip.textContent = `#${id} · ${el.tagName.toLowerCase()} · ${Math.round(r.width)} × ${Math.round(r.height)}\n${loc?.src ?? "No Svelte source"}\nClick to copy source reference`;
      tip.style.left = Math.min(e.clientX + 12, innerWidth - 360) + "px";
      tip.style.top = Math.min(e.clientY + 18, innerHeight - 80) + "px";
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const el = e.target as HTMLElement,
        loc = locate(el);
      const ref = `#${id} · ${loc?.src ?? ""} · ${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 80) ?? ""}`;
      navigator.clipboard
        ?.writeText(ref)
        .then(() => {
          tip.textContent = "Copied: " + ref;
        })
        .catch(() => {
          tip.textContent = ref;
        });
      window.parent.postMessage(
        { type: "uip-inspect", id, reference: ref, src: loc?.src },
        location.origin,
      );
    },
    true,
  );
}
