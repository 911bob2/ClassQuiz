export const theme = $state({ dark: false });

function applyTheme(dark: boolean) {
	theme.dark = dark;
	document.documentElement.classList.toggle('dark', dark);
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', dark ? '#000000' : '#ffffff');
}

export function setTheme(dark: boolean) {
	localStorage.setItem('theme', dark ? 'dark' : 'light');
	applyTheme(dark);
}

export function initializeTheme() {
	const preference = window.matchMedia('(prefers-color-scheme: dark)');
	const sync = () =>
		applyTheme(localStorage.theme ? localStorage.theme === 'dark' : preference.matches);
	sync();
	preference.addEventListener('change', sync);
	window.addEventListener('storage', sync);
	return () => {
		preference.removeEventListener('change', sync);
		window.removeEventListener('storage', sync);
	};
}
