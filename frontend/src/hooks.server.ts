// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

import type { Handle, HandleFetch } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import * as jose from 'jose';

// Server-rendered loaders must use the internal API, including when the public
// origin points at a host-only local port. Forward credentials only to our API.
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	const url = new URL(request.url);
	if (
		process.env.API_URL &&
		url.origin === event.url.origin &&
		url.pathname.startsWith('/api/')
	) {
		const headers = new Headers(request.headers);
		headers.set('cookie', event.request.headers.get('cookie') || '');
		request = new Request(new URL(url.pathname + url.search, process.env.API_URL), request);
		request = new Request(request, { headers });
	}
	return fetch(request);
};

/** @type {import('@sveltejs/kit').Handle} */
const authenticate: Handle = async ({ event, resolve }) => {
	const access_token = event.cookies.get('access_token');
	if (!access_token) {
		event.locals.email = null;
		return resolve(event);
	}
	const jwt = jose.decodeJwt(access_token.replace('Bearer ', ''));
	if (!jwt) {
		event.locals.email = null;
		return resolve(event);
	}
	// if token expires, do a request to get a new one and set the response-cookies on the response
	if (Date.now() >= jwt.exp * 1000) {
		const res = await fetch(`${process.env.API_URL}/api/v1/users/check`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Cookie: event.request.headers.get('cookie') || ''
			}
		});
		if (res.ok) {
			event.locals.email = await res.text();
			const resp = await resolve(event);
			try {
				resp.headers.set('Set-Cookie', res.headers.get('set-cookie'));
			} catch {
				/* empty */
			}
			return resp;
		}
	}
	event.locals.email = jwt.sub;
	return resolve(event);
};

// SvelteKit repeats every preloaded CSS and JS file in a `link` response header. On larger
// pages (e.g. /play) it exceeds the default 4 KB proxy header buffer and nginx answers 502.
// The same preloads are already in the HTML <head>, so the header is dropped.
const dropLinkHeader: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	try {
		response.headers.delete('link');
	} catch {
		/* immutable headers, e.g. a proxied fetch response */
	}
	return response;
};

export const handle = sequence(dropLinkHeader, authenticate);
