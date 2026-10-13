// DOM -> JSON inspector. Runs inside the render frame.
// Used by the CLI (`uip inspect`) via window.__UIP_INSPECT__ and by the gallery overlay.

export interface InspectOptions {
	selector?: string;
	text?: string;
	interactive?: boolean;
	styles?: 'key' | 'all' | 'none';
	max?: number;
	includeContainers?: boolean;
	depth?: number;
}

export interface SourceLoc {
	file: string;
	line: number;
	column: number;
}

export interface InspectedElement {
	ref: string;
	parent?: string;
	tag: string;
	id?: string;
	role?: string;
	text?: string;
	attrs?: Record<string, string>;
	box: { x: number; y: number; w: number; h: number };
	src?: string;
	usedIn?: string;
	componentChain?: string[];
	classes?: string;
	styles?: Record<string, string>;
	interactive?: boolean;
	visibleInViewport?: boolean;
}

const KEY_STYLES = [
	'display',
	'position',
	'width',
	'height',
	'margin',
	'padding',
	'gap',
	'font-family',
	'font-size',
	'font-weight',
	'line-height',
	'text-align',
	'color',
	'background-color',
	'background-image',
	'border',
	'border-radius',
	'box-shadow',
	'opacity',
	'z-index',
	'flex-direction',
	'justify-content',
	'align-items',
	'grid-template-columns',
	'overflow'
];
const DEFAULTS: Record<string, string[]> = {
	position: ['static'],
	margin: ['0px'],
	padding: ['0px'],
	gap: ['normal'],
	'background-color': ['rgba(0, 0, 0, 0)'],
	'background-image': ['none'],
	border: ['0px none', '0px'],
	'border-radius': ['0px'],
	'box-shadow': ['none'],
	opacity: ['1'],
	'z-index': ['auto'],
	'flex-direction': ['row'],
	'justify-content': ['normal'],
	'align-items': ['normal'],
	'grid-template-columns': ['none'],
	overflow: ['visible'],
	'text-align': ['start']
};

const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'LABEL']);
const MEDIA_TAGS = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'AUDIO']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK']);
const SVG_CHILD = new Set(['path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'defs', 'use', 'stop', 'lineargradient', 'clippath', 'mask']);

/** Normalise svelte filenames to repo-relative paths like frontend/src/lib/x.svelte */
export function normFile(f?: string): string | undefined {
	if (!f) return undefined;
	let p = f.replace(/\\/g, '/');
	const i = p.indexOf('frontend/src/');
	if (i >= 0) return p.slice(i);
	const j = p.indexOf('ui-preview/');
	if (j >= 0) return p.slice(j);
	p = p.replace(/^(\.\.\/)+/, '');
	if (p.startsWith('src/')) return 'ui-preview/' + p;
	return p;
}

const fmt = (l?: { file?: string; line?: number; column?: number }) =>
	l && l.file ? `${normFile(l.file)}:${l.line}:${(l.column ?? 0) + 1}` : undefined;

export function getMeta(el: Element): { loc?: SourceLoc; usedIn?: string; chain: string[] } {
	const meta = (el as any).__svelte_meta;
	if (!meta) return { chain: [] };
	const chain: string[] = [];
	let usedIn: string | undefined;
	let s = meta.parent;
	while (s) {
		if (s.type === 'component') {
			const at = fmt(s);
			if (at) {
				chain.push(`${s.componentTag ?? 'Component'} @ ${at}`);
				if (!usedIn && normFile(s.file) !== normFile(meta.loc?.file)) usedIn = at;
			}
		}
		s = s.parent;
	}
	return { loc: meta.loc, usedIn, chain };
}

/** Find source location for any element (walks up to nearest element with meta). */
export function locate(el: Element | null) {
	let cur: Element | null = el;
	while (cur && !(cur as any).__svelte_meta) cur = cur.parentElement;
	if (!cur) return null;
	const m = getMeta(cur);
	return { element: cur, src: fmt(m.loc), usedIn: m.usedIn, chain: m.chain };
}

const isUipNode = (el: Element) => !!el.closest('[data-uip-overlay]');

function directText(el: Element) {
	let t = '';
	for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
	return t.replace(/\s+/g, ' ').trim();
}

function isInteractive(el: Element) {
	if (INTERACTIVE_TAGS.has(el.tagName)) return true;
	const role = el.getAttribute('role');
	if (role && ['button', 'link', 'checkbox', 'tab', 'menuitem', 'switch', 'radio', 'option', 'slider'].includes(role)) return true;
	if ((el as HTMLElement).isContentEditable && el.getAttribute('contenteditable') !== null) return true;
	const anyEl = el as any;
	// Svelte 5 delegated handlers live on __click etc.; native ones on onclick
	return !!(anyEl.__click || anyEl.onclick || anyEl.__pointerdown || anyEl.__mousedown || el.hasAttribute('tabindex'));
}

function visible(el: Element, cs: CSSStyleDeclaration, r: DOMRect) {
	if (r.width < 1 || r.height < 1) return false;
	if (cs.visibility === 'hidden' || cs.display === 'none') return false;
	if (Number(cs.opacity) === 0) return false;
	return true;
}

function pickStyles(cs: CSSStyleDeclaration, mode: 'key' | 'all') {
	const out: Record<string, string> = {};
	const props = mode === 'all' ? Array.from(cs) : KEY_STYLES;
	for (const p of props) {
		let v = cs.getPropertyValue(p);
		if (!v) continue;
		if (p === 'border') {
			// summarise border shorthand: width style color
			v = `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`;
			if (cs.borderTopWidth === '0px') continue;
		}
		if (mode === 'key' && DEFAULTS[p]?.some((d) => v.startsWith(d) && (p !== 'border' || v === d))) continue;
		if (mode === 'key' && p === 'font-family') v = v.split(',')[0];
		out[p] = v;
	}
	return out;
}

let refCounter = 0;

export function inspect(opts: InspectOptions = {}) {
	const styleMode = opts.styles ?? 'key';
	const max = opts.max ?? 400;
	refCounter = 0;
	document.querySelectorAll('[data-uip-ref]').forEach((e) => e.removeAttribute('data-uip-ref'));

	let roots: Element[] = [document.body];
	if (opts.selector) roots = Array.from(document.querySelectorAll(opts.selector));

	const textNeedle = opts.text?.toLowerCase();
	const out: InspectedElement[] = [];
	const refOf = new Map<Element, string>();
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const sources = new Map<string, { file: string; lines: Set<number> }>();
	const seen = new Set<Element>();

	const consider = (el: Element) => {
		if (seen.has(el)) return;
		seen.add(el);
		if (opts.depth !== undefined) {
			let depth=0, parent=el.parentElement;
			while(parent && !roots.includes(parent)) {depth++;parent=parent.parentElement;}
			if(depth>opts.depth) return;
		}
		if (out.length >= max) return;
		if (SKIP_TAGS.has(el.tagName) || isUipNode(el)) return;
		if (el.namespaceURI === 'http://www.w3.org/2000/svg' && SVG_CHILD.has(el.tagName.toLowerCase())) return;
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		if (!visible(el, cs, r)) return;

		const meta = getMeta(el);
		if (meta.loc?.file) {
			const f = normFile(meta.loc.file)!;
			if (!sources.has(f)) sources.set(f, { file: f, lines: new Set() });
			sources.get(f)!.lines.add(meta.loc.line);
		}

		const inter = isInteractive(el);
		const txt = directText(el);
		const media = MEDIA_TAGS.has(el.tagName.toUpperCase());
		const decorated =
			cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
			cs.backgroundImage !== 'none' ||
			cs.borderTopWidth !== '0px' ||
			cs.boxShadow !== 'none';
		let include = opts.interactive ? inter : inter || !!txt || media || (decorated && (opts.includeContainers ?? true));
		if (opts.selector && roots.includes(el)) include = true;
		if (textNeedle) {
			const full = ((el as HTMLElement).innerText || el.textContent || '').toLowerCase();
			include = include && full.includes(textNeedle) && (!!txt || inter) ;
		}
		if (!include) return;

		const ref = `e${++refCounter}`;
		refOf.set(el, ref);
		el.setAttribute('data-uip-ref', ref);
		let p = el.parentElement;
		let parent: string | undefined;
		while (p) {
			if (refOf.has(p)) {
				parent = refOf.get(p);
				break;
			}
			p = p.parentElement;
		}
		const attrs: Record<string, string> = {};
		for (const a of ['href', 'type', 'name', 'placeholder', 'alt', 'aria-label', 'title', 'value', 'src', 'disabled', 'for']) {
			const v = el.getAttribute(a);
			if (v !== null) attrs[a] = v.length > 120 ? v.slice(0, 117) + '...' : v;
		}
		if ((el as HTMLInputElement).value && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
			attrs.value = String((el as HTMLInputElement).value).slice(0, 120);
		const fullText = inter ? ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim() : txt;
		const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : el.getAttribute('class') || '';
		out.push({
			ref,
			parent,
			tag: el.tagName.toLowerCase(),
			id: el.id || undefined,
			role: el.getAttribute('role') || undefined,
			text: fullText ? (fullText.length > 140 ? fullText.slice(0, 137) + '...' : fullText) : undefined,
			attrs: Object.keys(attrs).length ? attrs : undefined,
			box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
			src: fmt(meta.loc),
			usedIn: meta.usedIn,
			componentChain: meta.chain.length ? meta.chain : undefined,
			classes: cls.replace(/\bs-[A-Za-z0-9_-]{6,}\b/g, '').replace(/\s+/g, ' ').trim() || undefined,
			styles: styleMode === 'none' ? undefined : pickStyles(cs, styleMode),
			interactive: inter || undefined,
			visibleInViewport: r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
		});
	};

	for (const root of roots) {
		consider(root);
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
		let n = walker.nextNode();
		while (n) {
			consider(n as Element);
			n = walker.nextNode();
		}
	}

	return {
		url: location.href,
		viewport: { w: vw, h: vh },
		document: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
		count: out.length,
		truncated: out.length >= max,
		elements: out,
		sources: collectSources()
	};
}

/** All frontend source files that contribute DOM to the current screen, with line ranges. */
export function collectSources() {
	const files = new Map<string, Set<number>>();
	const add = (f: string | undefined, line: number) => {
		const nf = normFile(f);
		if (!nf) return;
		if (!files.has(nf)) files.set(nf, new Set());
		files.get(nf)!.add(line);
	};
	document.querySelectorAll('*').forEach((el) => {
		if (isUipNode(el)) return;
		const meta = (el as any).__svelte_meta;
		if (!meta?.loc) return;
		add(meta.loc.file, meta.loc.line);
		let s = meta.parent;
		while (s) {
			if (s.type === 'component' && s.file) add(s.file, s.line);
			s = s.parent;
		}
	});
	return [...files.entries()]
		.filter(([f]) => f.startsWith('frontend/'))
		.map(([file, lines]) => {
			const ls = [...lines].sort((a, b) => a - b);
			return { file, lines: `${ls[0]}-${ls[ls.length - 1]}`, elements: ls.length };
		})
		.sort((a, b) => b.elements - a.elements);
}
