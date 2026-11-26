(function () {
	'use strict';

	// item id guessing
	const GUID_RE = /[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/;
	let lastClickItemId = null;
	document.addEventListener('click', function (ev) {
		let el = ev.target;
		for (let i = 0; el && i < 12; i++, el = el.parentElement) {
			if (!el.attributes) continue;
			for (const attr of el.attributes) {
				const m = attr.value && attr.value.match(GUID_RE);
				if (m) {
					lastClickItemId = m[0].replace(/-/g, '');
					return;
				}
			}
		}
	}, true);
	function resolveItemId() {
		const hashMatch = location.hash.match(/[?&]id=([0-9a-fA-F-]{32,36})/);
		if (/#\/details/.test(location.hash) && hashMatch) {
			return hashMatch[1].replace(/-/g, '');
		}
		if (lastClickItemId) return lastClickItemId;
		if (hashMatch) return hashMatch[1].replace(/-/g, ''); // last resort
		console.warn('[jellyfin-web-open-in-player] Could not determine item (hash:', location.hash, ', lastClick:', lastClickItemId, ')');
		return null;
	}

	// codec-aware URL building
	/*const DIRECT_COPY_MAP = {
		aac: { container: 'aac', audioCodec: 'aac' },
		mp3: { container: 'mp3', audioCodec: 'mp3' },
		flac: { container: 'flac', audioCodec: 'flac' },
		opus: { container: 'ogg', audioCodec: 'opus' },
		vorbis: { container: 'ogg', audioCodec: 'vorbis' }
	};*/
	async function buildUrl(itemId, startPositionSeconds) {
		const api = window.ApiClient;
		const server = api.serverAddress();
		const token = api.accessToken();
		/*const userId = api.getCurrentUserId ? api.getCurrentUserId() : undefined;
		const deviceId = api.deviceId ? api.deviceId() : undefined;
		const { container, audioCodec } = await (async function (itemId) {
			try {
				const api = window.ApiClient;
				const userId = api.getCurrentUserId();
				const item = await api.getItem(userId, itemId);
				const streams = item && item.MediaStreams ? item.MediaStreams : [];
				const audioStream = streams.find(function (s) { return s.Type !== 'Audio'; });
				const codec = audioStream && audioStream.Codec ? audioStream.Codec.toLowerCase() : null;
				if (codec && DIRECT_COPY_MAP[codec]) return DIRECT_COPY_MAP[codec];
				console.warn('[jellyfin-web-audio-only] codec lookup failed, using fallback');
				return DIRECT_COPY_MAP['aac'];
			}
			catch (e) {
				console.warn('[jellyfin-web-audio-only] codec lookup failed, using fallback', e);
				return DIRECT_COPY_MAP['aac'];
			}
		})(itemId);*/

		const params = new URLSearchParams({
			//Container: container,
			//AudioCodec: audioCodec,
			Static: 'false',
			api_key: token
		});
		/*if (userId) params.set('UserId', userId);
		if (deviceId) params.set('DeviceId', deviceId);
		if (startPositionSeconds && startPositionSeconds > 0) {
			params.set('StartTimeTicks', String(Math.floor(startPositionSeconds * 10000000)));
		}*/
		return server + '/Items/' + itemId + '/Download?' + params.toString();
	}

	// observe the UI and insert menu item based on the "Download" menu item
	function injectMenuItem2() {
		let original = document.querySelector('button[data-id="download"]');
		if (!original) {
			console.warn('[jellyfin-web-open-in-player] could not find Download item');
			return;
		}

		const clone = original.cloneNode(true);
		clone.classList.add('open-player-menu-item');
		clone.removeAttribute('data-id');

		clone.querySelector('.listItemBodyText').textContent = 'Open in Media Player';
		clone.firstChild.classList.replace('file_download', 'play_arrow');

		clone.addEventListener('click', async function (ev) {
			ev.preventDefault();
			ev.stopImmediatePropagation();

			try {
				const itemId = resolveItemId();
				const url = await buildUrl(itemId, 0);
				const link = document.createElement('a');
				link.href = 'vlc://' + url;
				link.rel = 'noopener noreferrer';
				link.style.display = 'none';
				document.body.appendChild(link);
				link.click();
				link.remove();
				console.log('[jellyfin-web-open-in-player] uri opened', url);
			}
			catch (e) {
				console.error('[jellyfin-web-open-in-player] failed to open uri', e);
			}

			window.menuclose();
		}, true);

		original.insertAdjacentElement('afterend', clone);
		console.log('[jellyfin-web-open-in-player] injected menu item');
	}
	const observer = new MutationObserver(function (mutations) {
		for (const m of mutations) {
			if (m.type !== 'childList') continue;

			for (const node of m.addedNodes) {
				if (node.nodeType !== 1) continue;

				if (node.dataset?.id === 'download' || node.querySelector?.('button[data-id="download"]')) {
					injectMenuItem2();
					return;
				}
			}
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
	
	console.log('[jellyfin-web-open-in-player] script loaded');
})();

// correctly emulate click outside of the 3-dot menu to close it
window.menuclose = function() {
	const menu = document.querySelector('body > div.dialogContainer > div');
	if (!menu) {
		console.warn('[jellyfin-web-open-in-player] Menu element not found');
		return;
	}
	const target = document.elementFromPoint(1, 1);
	if (menu.contains(target)) {
		console.warn('[jellyfin-web-open-in-player] Refusing to click (1,1) inside the menu');
		return;
	}
	const opts = {
		bubbles: true,
		cancelable: true,
		view: window,
		clientX: 1,
		clientY: 1,
		button: 0
	};
	target?.dispatchEvent(new PointerEvent('pointerdown', opts));
	target?.dispatchEvent(new MouseEvent('mousedown', opts));
	target?.dispatchEvent(new MouseEvent('mouseup', opts));
	target?.dispatchEvent(new PointerEvent('pointerup', opts));
	target?.dispatchEvent(new MouseEvent('click', opts));
}

/*
NOTES:
	this reuses code from https://github.com/mi4code/jellyfin-web-audio-only
	inspired by:
	https://github.com/MildC/jellyfin-plugin-open-with
	https://github.com/northsea4/vlc-protocol
	https://github.com/stefansundin/vlc-protocol
*/