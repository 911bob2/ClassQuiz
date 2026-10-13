import type { Component } from "svelte";
import type { FetchRoutes } from "../shims/fetch-mock";
import type { MockSocket } from "../shims/socket";

export type Loader = () => Promise<{ default: Component<any> }>;

export interface ScenarioContext {
  socket: MockSocket;
  /** wait for Svelte to flush + a macrotask */
  tick: (ms?: number) => Promise<void>;
  /** root element of the rendered screen */
  root: HTMLElement;
  /** query inside the frame */
  $: (sel: string) => HTMLElement | null;
  /** click the first element matching selector or containing the text */
  click: (selOrText: string) => Promise<boolean>;
  /** type into an input */
  type: (sel: string, value: string) => Promise<boolean>;
}

export interface Scenario {
  /** Stable numeric ID, e.g. 5003. Grouped by area: see scenarios/index.ts */
  id: number;
  /** Stable readable slug, e.g. 'play.question.abcd' */
  slug: string;
  title: string;
  group: string;
  /** URL the screen lives at in the real app (also used for $app/state page.url) */
  route?: string;
  /** Route params for $app/state page.params */
  params?: Record<string, string>;
  /** HTTP status for rendering real route error components. */
  status?: number;
  /** Real SvelteKit page component */
  page?: Loader;
  /** ...or an isolated lib component (popups, sub-screens) */
  component?: Loader;
  /** Props passed to page/component. Pages normally get `{ data }` */
  props?: Record<string, unknown> | (() => Record<string, unknown>);
  /** 'root' renders the real routes/+layout.svelte around the screen (navbar, bg, i18n) */
  layout?: "root" | "none";
  /** Extra nested layout(s) between root and page, outermost first */
  layouts?: Loader[];
  /** Signed-in state for the navbar (default true) */
  signedIn?: boolean;
  /** Per-scenario API fixtures (take precedence over mocks/api-defaults.ts) */
  fetch?: FetchRoutes;
  /** Runs before mount: set localStorage / cookies etc. */
  setup?: () => void;
  /** Runs after mount: fire socket events / click through UI to reach the state */
  run?: (ctx: ScenarioContext) => Promise<void> | void;
  /** Auto-reply to socket emits (e.g. answer submitted -> nothing) */
  onEmit?: (event: string, args: unknown[], socket: MockSocket) => void;
  /** Stop page timers (setInterval/setTimeout) once the scenario is ready */
  freezeTimers?: boolean;
  viewport?: "desktop" | "tablet" | "mobile";
  /** Background colour of the frame when layout is 'none' */
  background?: string;
  /** Main files to edit for this screen (relative to frontend/src) */
  sources?: string[];
  /** Known rendering limitations (reported as warnings by `uip check`) */
  limitations?: string;
  /** Only for real frontend states that intentionally render an empty screen. */
  allowBlank?: boolean;
  tags?: string[];
}

export const defineScenarios = (s: Scenario[]) => s;
