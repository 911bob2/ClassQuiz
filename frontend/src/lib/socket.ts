// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

import { io } from 'socket.io-client';

export const socket = io();

let selectedPath = '/socket.io';
let selecting: Promise<any> | undefined;
let nativeRoom = false;
let roomPin = '';
let replaced = false;
socket.on('host_replaced', () => {
	replaced = true;
	socket.disconnect();
});
socket.on('disconnect', (reason) => {
	if (nativeRoom && !replaced && reason === 'io server disconnect')
		setTimeout(() => socket.connect(), 1000);
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
		if (changingRoom) replaced = false;
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

socket.on('answer_committed', (data) => {
	const key = `quiz-pending:${roomPin}`;
	const pending = sessionStorage.getItem(key);
	if (pending && JSON.parse(pending).question_index == data.question_index)
		sessionStorage.removeItem(key);
});
socket.on('personal_final_results', () => sessionStorage.removeItem(`quiz-pending:${roomPin}`));
socket.on('room_state', (data) => {
	if (!nativeRoom) return;
	const key = `quiz-pending:${roomPin}`;
	const raw = sessionStorage.getItem(key);
	if (!raw) return;
	const pending = JSON.parse(raw);
	if (
		data.answered ||
		pending.question_token !== data.question_token ||
		data.phase !== 'question' ||
		data.remaining_ms <= 0
	) {
		sessionStorage.removeItem(key);
	} else socket.emit('submit_answer', pending);
});
