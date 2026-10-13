// Shim for SvelteKit's $app/forms
export const enhance = (_form: HTMLFormElement, _submit?: unknown) => ({
  destroy() {},
});
export const applyAction = async (_: unknown) => {};
export const deserialize = (s: string) => JSON.parse(s);
