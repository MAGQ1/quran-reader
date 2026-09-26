/*
 * Quran Reader recitation fetch service.
 *
 * WHY THIS EXISTS: on this device the HTML5 <audio> element stalls when it
 * fetches a remote https:// URL itself -- readyState stays 0 (HAVE_NOTHING)
 * forever, no error, until the user taps again. Measured: a local file:// mp3
 * played on the first tap, the remote one did not; app-level XHR to the same
 * server works, but XHR cannot hand audio to the element on this WebKit (no
 * arraybuffer responseType, no Blob constructor, no createObjectURL, and
 * data: URLs are rejected as "source not supported").
 *
 * So the audio bytes reach the device by another route: this service curls a
 * verse into local storage and the app plays the resulting file:// URL. The
 * device's own curl (7.88, OpenSSL 1.1.1) reaches everyayah.com fine.
 * Pattern borrowed from SoundCloud Player's SCAudioService.js (which found the
 * same media-pipeline limitation).
 *
 * The files are a transient buffer, not a library: the app keeps the verse it
 * is playing and the next one, releases the rest, and everything is swept at
 * service start.
 *
 * FILES: flat names directly in /media/internal with a dot prefix -- mkdir
 * silently fails inside the service jail (established by SoundCloud Player's
 * service), /media/internal is visible to both the jailed service and the
 * app's WebKit process, and the dot keeps them out of the user's file lists.
 *
 * SECURITY: any app on the public bus can call these commands, so the URL is
 * restricted to everyayah.com verse files and the key to a safe character set.
 */

var cp = IMPORTS.require('child_process');
var fs = IMPORTS.require('fs');

var CURL = '/usr/bin/curl';
var CACHE_DIR = '/media/internal';
var CACHE_PREFIX = '.quranaudio_';
var URL_RE = /^https:\/\/everyayah\.com\/data\/[A-Za-z0-9_.\-]+\/[0-9]{6}\.mp3$/;
var KEY_RE = /^[A-Za-z0-9_\-]{1,64}$/;

function log(msg) {
	try { console.log('[QuranAudio] ' + msg); } catch (e) {}
}

// statSync throwing IS the existence check (SoundCloud's service found
// existsSync + a swallowing catch unreliable inside this jail).
function fileSize(path) {
	try { return fs.statSync(path).size; }
	catch (e) { return -1; }
}

function removeFile(path) {
	try { fs.unlinkSync(path); return true; }
	catch (e) { return false; }
}

function pathFor(key) { return CACHE_DIR + '/' + CACHE_PREFIX + key + '.mp3'; }

function isCacheFile(name) {
	return name.indexOf(CACHE_PREFIX) === 0 && /\.mp3(\.part)?$/.test(name);
}

var Fetcher = {
	jobs: {},   // key -> {state: downloading|ready|failed, path, child, error}

	fetch: function (args) {
		args = args || {};
		var key = args.key;
		var url = args.url;
		if (!key || !KEY_RE.test(String(key))) {
			return { returnValue: false, errorText: 'fetchVerse needs a valid key' };
		}
		if (!url || !URL_RE.test(String(url))) {
			return { returnValue: false, errorText: 'fetchVerse only fetches everyayah.com verse files' };
		}

		var path = pathFor(key);
		var have = fileSize(path);
		if (have > 0) {
			this.jobs[key] = { state: 'ready', path: path };
			return this.status({ key: key });
		}
		var existing = this.jobs[key];
		if (existing && existing.state === 'downloading') { return this.status({ key: key }); }

		var self = this;
		var job = { state: 'downloading', path: path, child: null, cancelled: false };
		this.jobs[key] = job;

		var tmp = path + '.part';
		removeFile(tmp);
		try {
			// --fail: an HTTP error must not leave an error page on disk that
			// <audio> would then try to play.
			job.child = cp.spawn(CURL, ['-sS', '-L', '--fail', '--max-time', '60', '-o', tmp, url]);
		} catch (e) {
			job.state = 'failed';
			job.error = 'curl spawn failed: ' + e;
			return this.status({ key: key });
		}

		var err = '';
		if (job.child.stderr) { job.child.stderr.on('data', function (d) { err += d; }); }
		job.child.on('error', function (e) { self._fail(key, job, tmp, 'curl error: ' + e); });
		job.child.on('exit', function (code) {
			job.child = null;
			if (self.jobs[key] !== job || job.cancelled) { removeFile(tmp); return; }
			if (code !== 0) { self._fail(key, job, tmp, 'curl exit ' + code + (err ? ': ' + err : '')); return; }
			var size = fileSize(tmp);
			if (size <= 0) { self._fail(key, job, tmp, 'fetched 0 bytes'); return; }
			try {
				fs.renameSync(tmp, path);   // a .part is never mistakable for a finished verse
				job.state = 'ready';
				log('ready ' + key + ' (' + size + ' bytes)');
			} catch (e2) {
				self._fail(key, job, tmp, 'finalise failed: ' + e2);
			}
		});
		return this.status({ key: key });
	},

	_fail: function (key, job, tmp, message) {
		if (job.state === 'failed') { return; }
		job.state = 'failed';
		job.error = message;
		removeFile(tmp);
		log('FAILED ' + key + ': ' + message);
	},

	status: function (args) {
		args = args || {};
		var job = this.jobs[args.key];
		if (!job) {
			// A finished file can outlive the in-memory job (the service exits when idle).
			if (args.key && KEY_RE.test(String(args.key)) && fileSize(pathFor(args.key)) > 0) {
				return { returnValue: true, key: args.key, state: 'ready', url: 'file://' + pathFor(args.key) };
			}
			return { returnValue: true, key: args.key, state: 'none' };
		}
		var out = { returnValue: job.state !== 'failed', key: args.key, state: job.state };
		if (job.state === 'ready') { out.url = 'file://' + job.path; }
		if (job.error) { out.errorText = job.error; }
		return out;
	},

	release: function (args) {
		args = args || {};
		var key = args.key;
		if (!key || !KEY_RE.test(String(key))) { return { returnValue: false, errorText: 'releaseVerse needs a valid key' }; }
		var job = this.jobs[key];
		if (job) {
			job.cancelled = true;
			if (job.child) { try { job.child.kill('SIGKILL'); } catch (e) {} job.child = null; }
			delete this.jobs[key];
		}
		removeFile(pathFor(key) + '.part');
		var removed = removeFile(pathFor(key)) ? 1 : 0;
		return { returnValue: true, key: key, removed: removed };
	},

	clear: function () {
		var removed = 0;
		var k;
		for (k in this.jobs) {
			if (this.jobs.hasOwnProperty(k) && this.jobs[k].child) {
				this.jobs[k].cancelled = true;
				try { this.jobs[k].child.kill('SIGKILL'); } catch (e) {}
			}
		}
		this.jobs = {};
		try {
			var names = fs.readdirSync(CACHE_DIR);
			for (var i = 0; i < names.length; i++) {
				// Only ever our own prefixed files -- /media/internal is the user's storage.
				if (!isCacheFile(names[i])) { continue; }
				if (removeFile(CACHE_DIR + '/' + names[i])) { removed++; }
			}
		} catch (e2) {
			return { returnValue: false, errorText: 'clear failed: ' + e2 };
		}
		if (removed) { log('cleared ' + removed + ' file(s)'); }
		return { returnValue: true, removed: removed };
	}
};

// Sweep anything a previous run left behind (crash, battery pull).
Fetcher.clear();

function readArgs(self, future) {
	if (self && self.controller && self.controller.args) { return self.controller.args; }
	if (future && future.args) { return future.args; }
	return {};
}

var FetchVerseCommandAssistant = function () {};
FetchVerseCommandAssistant.prototype.run = function (future) {
	future.result = Fetcher.fetch(readArgs(this, future));
	return future;
};

var GetFetchStatusCommandAssistant = function () {};
GetFetchStatusCommandAssistant.prototype.run = function (future) {
	future.result = Fetcher.status(readArgs(this, future));
	return future;
};

var ReleaseVerseCommandAssistant = function () {};
ReleaseVerseCommandAssistant.prototype.run = function (future) {
	future.result = Fetcher.release(readArgs(this, future));
	return future;
};

var ClearCacheCommandAssistant = function () {};
ClearCacheCommandAssistant.prototype.run = function (future) {
	future.result = Fetcher.clear();
	return future;
};
