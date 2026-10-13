// Immutable revision frames need Vite's CSS injection API, but no HMR socket.
// Export the installed Vite client's public API without connecting or reloading.
const styles = new Map();
export function updateStyle(id, css) {
  let element = styles.get(id);
  if (!element) {
    element = document.createElement("style");
    element.setAttribute("data-vite-dev-id", id);
    document.head.append(element);
    styles.set(id, element);
  }
  element.textContent = css;
}
export function removeStyle(id) {
  styles.get(id)?.remove();
  styles.delete(id);
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, query) {
  const [pathname, hash] = url.split("#");
  return (
    pathname +
    (pathname.includes("?") ? "&" : "?") +
    query +
    (hash ? "#" + hash : "")
  );
}
export class ErrorOverlay extends HTMLElement {
  constructor(error) {
    super();
    this.textContent = error?.message ?? String(error);
  }
  close() {
    this.remove();
  }
}
if (!customElements.get("vite-error-overlay"))
  customElements.define("vite-error-overlay", ErrorOverlay);
