// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

import { io } from 'socket.io-client';

// Connected by connectRoom (or the page) once the room's engine is known, so a
// player bound for the Rust engine never opens a Python socket first.
export const socket = io({ autoConnect: false });

let selectedPath = '/socket.io';
let selecting: Promise<any> | undefined;
let nativeRoom = false;
let roomPin = '';
let replaced = false;
let refused = false;
let serverDisconnects = 0;
socket.on('host_replaced', () => {
	replaced = true;
	socket.disconnect();
});
// The room turned the player away; reconnecting would only repeat that.
for (const event of ['room_full', 'game_already_started', 'kick'])
	socket.on(event, () => {
		refused = true;
	});
socket.on('connect', () => {
	serverDisconnects = 0;
});
socket.on('disconnect', (reason) => {
	if (
		nativeRoom &&
		!replaced &&
		!refused &&
		reason === 'io server disconnect' &&
		serverDisconnects < 10
	) {
		serverDisconnects += 1;
		setTimeout(() => socket.connect(), 1000 * serverDisconnects);
	}
});

/** Select before admission; never send a native room to the Python fallback. */
export function connectRoom(pin: string): Promise<any> {
	if (selecting) return selecting;
	selecting = (async () => {
		const response = await fetch(`/api/v1/quiz/play/check_captcha/${encodeURIComponent(pin)}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok)
			throw new Error(
				response.status === 404
					? 'Room expired or PIN not found'
					: 'Cannot connect to this room'
			);
		const metadata = await response.json();
		const path = metadata.socket_path === '/socket.io-rust' ? '/socket.io-rust' : '/socket.io';
		const changingRoom = roomPin !== '' && roomPin !== pin;
		if (changingRoom) {
			replaced = false;
			refused = false;
		}
		nativeRoom = metadata.realtime_engine === 'rust';
		roomPin = pin;
		if (path !== selectedPath || changingRoom) {
			socket.disconnect();
			socket.io.opts.path = path;
			selectedPath = path;
		}
		if (!socket.connected) {
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					cleanup();
					reject(new Error('Connection timed out; retry shortly'));
				}, 20000);
				const connected = () => {
					cleanup();
					resolve();
				};
				const cleanup = () => {
					clearTimeout(timeout);
					socket.off('connect', connected);
				};
				socket.once('connect', connected);
				socket.connect();
			});
		}
		return metadata;
	})().finally(() => {
		selecting = undefined;
	});
	return selecting;
}

export function sendAnswer(data: any) {
	if (nativeRoom) sessionStorage.setItem(`quiz-pending:${roomPin}`, JSON.stringify(data));
	socket.emit('submit_answer', data);
}

function readPending(key: string): any {
	try {
		return JSON.parse(sessionStorage.getItem(key) || 'null');
	} catch {
		sessionStorage.removeItem(key);
		return null;
	}
}

socket.on('answer_committed', (data) => {
	const key = `quiz-pending:${roomPin}`;
	const pending = readPending(key);
	if (pending && pending.question_index == data.question_index) sessionStorage.removeItem(key);
});
socket.on('personal_final_results', () => sessionStorage.removeItem(`quiz-pending:${roomPin}`));
socket.on('room_state', (data) => {
	if (!nativeRoom) return;
	const key = `quiz-pending:${roomPin}`;
	const pending = readPending(key);
	if (!pending) return;
	if (
		data.answered ||
		pending.question_token !== data.question_token ||
		data.phase !== 'question' ||
		data.remaining_ms <= 0
	) {
		sessionStorage.removeItem(key);
	} else socket.emit('submit_answer', pending);
});
