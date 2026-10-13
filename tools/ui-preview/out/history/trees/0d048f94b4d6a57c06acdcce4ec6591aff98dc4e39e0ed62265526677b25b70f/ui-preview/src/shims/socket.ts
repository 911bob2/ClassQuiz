// Mock for frontend/src/lib/socket.ts (socket.io client singleton).
// Every import of the real module is redirected here by uip.config.mjs.
// Scenarios push the real pages into a given state with `socket.fire(event, data)`.

type Handler = (...args: any[]) => void;

export interface EmitRecord {
  event: string;
  args: unknown[];
  t: number;
}

export class MockSocket {
  id = "uip-mock-sid";
  connected = true;
  disconnected = false;
  private handlers = new Map<string, Set<Handler>>();
  emits: EmitRecord[] = [];
  fired: { event: string; data: unknown }[] = [];
  /** Optional auto-responder installed by the active scenario. */
  onEmit:
    | ((event: string, args: unknown[], socket: MockSocket) => void)
    | null = null;

  on(event: string, fn: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return this;
  }
  once(event: string, fn: Handler) {
    const wrap: Handler = (...a) => {
      this.off(event, wrap);
      fn(...a);
    };
    return this.on(event, wrap);
  }
  off(event?: string, fn?: Handler) {
    if (!event) this.handlers.clear();
    else if (!fn) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(fn);
    return this;
  }
  removeAllListeners(event?: string) {
    return this.off(event);
  }
  removeListener(event: string, fn: Handler) {
    return this.off(event, fn);
  }
  listeners(event: string) {
    return [...(this.handlers.get(event) ?? [])];
  }
  hasListeners(event: string) {
    return (this.handlers.get(event)?.size ?? 0) > 0;
  }
  emit(event: string, ...args: unknown[]) {
    // socket.io acks: last arg may be a callback
    this.emits.push({
      event,
      args: args.filter((a) => typeof a !== "function"),
      t: Date.now(),
    });
    try {
      this.onEmit?.(event, args, this);
    } catch (e) {
      console.error("[uip] socket onEmit handler failed", e);
    }
    return this;
  }
  /** Deliver a server -> client event to every registered handler. */
  fire(event: string, data?: unknown) {
    this.fired.push({ event, data });
    const hs = this.handlers.get(event);
    if (!hs || hs.size === 0) {
      console.warn(`[uip] socket.fire('${event}') had no listeners`);
      return 0;
    }
    for (const h of [...hs]) h(data);
    return hs.size;
  }
  connect() {
    this.connected = true;
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  close() {
    return this.disconnect();
  }
  get io() {
    return { on: () => {}, off: () => {}, engine: { on: () => {} } };
  }
}

export const socket = new MockSocket();
(globalThis as any).__UIP_SOCKET__ = socket;
