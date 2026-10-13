<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { FFmpeg } from '@ffmpeg/ffmpeg';
	import { fetchFile } from '@ffmpeg/util';

	import { navbarVisible } from '$lib/stores.svelte.ts';
	import { getLocalization } from '$lib/i18n';
	const { t } = getLocalization();

	let file_input: HTMLInputElement = $state();
	navbarVisible.visible = false;

	let stats: { progress: number; time_elapsed: number; speed: number } = $state({
		progress: 0,
		time_elapsed: 0,
		speed: 0
	});

	let upload_stats: { progress: number; upload_started: undefined | Date; time_elapsed: number } =
		$state({
			progress: 0,
			upload_started: undefined,
			time_elapsed: 0
		});

	const speed_extraction_regex = /speed=(\d+\.\d+)x(?![\s\S]*speed=\d+\.\d+x)/;
	let last_time_elapsed = 0;

	// eslint-disable-next-line no-unused-vars
	enum Status {
		// eslint-disable-next-line no-unused-vars
		Idle,
		// eslint-disable-next-line no-unused-vars
		Compressing,
		// eslint-disable-next-line no-unused-vars
		CompressDone,
		// eslint-disable-next-line no-unused-vars
		Uploading,
		// eslint-disable-next-line no-unused-vars
		Done
	}

	let status: Status = $state(Status.Idle);

	let file_size_in_mi: undefined | number = $state(undefined);
	let original_file_size_in_mi: undefined | number = undefined;
	let file_data: undefined | Blob = undefined;

	const compress_video = async () => {
		if (status !== Status.Idle) {
			return;
		}
		status = Status.Compressing;
		const ffmpeg = new FFmpeg();
		const file = file_input.files?.[0];
		if (!file) {
			status = Status.Idle;
			return;
		}
		original_file_size_in_mi = file.size / 1_048_576;
		ffmpeg.on('log', ({ message }) => {
			const speed_match = message.match(speed_extraction_regex);
			stats.speed = speed_match ? parseFloat(speed_match[1]) : 0;
		});
		ffmpeg.on('progress', (p) => {
			if (stats.progress >= 1) {
				stats.time_elapsed = last_time_elapsed;
				return;
			}
			stats.time_elapsed = p.time ?? 0;
			last_time_elapsed = stats.time_elapsed;
			stats.progress = p.progress ?? 0;
		});
		await ffmpeg.load({
			// log: true,
		});
		await ffmpeg.writeFile(file.name, await fetchFile(file));
		await ffmpeg.exec([
			'-i',
			file.name,
			'-vcodec',
			'libx264',
			'-crf',
			'20',
			'-vf',
			'scale=1080:-2',
			'out.mp4'
		]);
		const data = await ffmpeg.readFile('out.mp4');
		file_size_in_mi = data.length / 1_048_576;
		file_data = new Blob([data]);
		status = Status.CompressDone;
		stats.progress = 1;
	};

	const upload_video = async () => {
		status = Status.Uploading;
		upload_stats.upload_started = new Date();
		/*        const progressTrackingStream = new TransformStream({
            transform(chunk, controller) {
                controller.enqueue(chunk);
                bytesUploaded += chunk.byteLength;
                console.log("upload progress:", bytesUploaded / totalBytes);
                upload_stats.progress = bytesUploaded / totalBytes;
                upload_stats.time_elapsed = (new Date() - upload_stats.upload_started) / 1000;
            },
            flush(_controller) {
                console.log("completed stream");
            }
        });*/
		/*        const response = await fetch("/api/v1/storage/raw", {
                    method: "POST",
                    headers: {
                        "Content-Type": "video/mp4"
                    },
                    body: file_data.stream().pipeThrough(progressTrackingStream),
                    duplex: "half"
                });
                const json = await response.json()*/
		const xhr = new XMLHttpRequest();
		const success = await new Promise((resolve) => {
			xhr.upload.addEventListener('progress', (event) => {
				if (event.lengthComputable) {
					upload_stats.progress = event.loaded / event.total;
					upload_stats.time_elapsed = (new Date() - upload_stats.upload_started) / 1000;
				}
			});
			xhr.addEventListener('loadend', () => {
				resolve({
					success: xhr.readyState === 4 && xhr.status === 200,
					body: xhr.responseText
				});
			});
			xhr.open('POST', '/api/v1/storage/raw', true);
			xhr.setRequestHeader('Content-Type', 'video/mp4');
			xhr.send(file_data);
		});
		console.log('success:', success);
		const json = JSON.parse(success.body);
		localStorage.setItem('video_upload_id', json.id);
		console.log(json, 'done');
		status = Status.Done;
		window.close();
	};
</script>

<svelte:head>
	<title>Telekom Quiz - {$t('uploader.upload_a_video')}</title>
</svelte:head>

<main class="tq-page tq-page-narrow" data-ui="video-uploader">
	<div class="tq-page-heading">
		<h1 class="tq-page-title">{$t('uploader.upload_a_video')}</h1>
	</div>
	<section class="tq-panel tq-panel-body tq-stack">
		<label class="video-file">
			<span class="tq-label">{$t('words.video')}</span>
			<input type="file" bind:this={file_input} accept="video/mp4" />
		</label>

		{#if status === Status.Compressing || status === Status.CompressDone}
			<div role="status" class="video-status">
				<h2 class="tq-section-title">
					{$t('telekom.compression', { defaultValue: 'Compression' })}
				</h2>
				<progress value={stats.progress} max="1"></progress>
				<div class="tq-table-wrap">
					<table class="tq-table">
						<thead>
							<tr>
								<th>{$t('words.speed')}</th>
								<th>{$t('words.progress')}</th>
								<th>{$t('video_uploader.time_elapsed')}</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>{stats.speed}×</td>
								<td>{Math.round(stats.progress * 100)}%</td>
								<td>{(stats.time_elapsed / 1_000_000).toFixed(2)}s</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		{:else if status === Status.Uploading}
			<div role="status" class="video-status">
				<h2 class="tq-section-title">{$t('words.upload')}</h2>
				<progress value={upload_stats.progress} max="1"></progress>
				<p>
					{Math.round(upload_stats.progress * 100)}% · {upload_stats.time_elapsed.toFixed(
						2
					)}s
				</p>
			</div>
		{/if}

		<div class="tq-toolbar">
			<button
				type="button"
				class="tq-button"
				data-ui="video-compress"
				onclick={compress_video}
				disabled={status !== Status.Idle}
			>
				{$t('words.submit')}
			</button>
			<button
				type="button"
				class="tq-button tq-button-primary"
				data-ui="video-upload"
				onclick={upload_video}
				disabled={status !== Status.CompressDone}
			>
				{$t('words.upload')}
				{file_size_in_mi ? '(' + file_size_in_mi.toFixed(2) + ' MiB)' : ''}
			</button>
		</div>
	</section>
</main>

<style>
	.video-file {
		display: block;
		padding: 24px;
		border: 1px dashed var(--tq-border-strong);
		border-radius: 8px;
	}
	.video-file input {
		max-width: 100%;
	}
	.video-file input::file-selector-button {
		min-height: 44px;
		margin-inline-end: 12px;
		padding: 10px 18px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		background: var(--tq-surface);
		color: var(--tq-text);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.video-status h2 {
		margin-bottom: 12px;
	}
	progress {
		width: 100%;
		height: 8px;
		margin-bottom: 16px;
		accent-color: var(--tq-brand);
	}
</style>
