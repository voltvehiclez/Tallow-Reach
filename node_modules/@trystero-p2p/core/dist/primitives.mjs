// src/primitives.ts
const encoder = /*@__PURE__*/ new TextEncoder();
const decoder = /*@__PURE__*/ new TextDecoder();
const libName = "Trystero";
const libId = "trystero";
const domainTag = (name, version) => `${libId}:${name}:v${version}`;
const socketInitialFailureSymbol = /*@__PURE__*/ Symbol.for(`${libId}.socketInitialFailure`);
const pluginSlotSymbol = /*@__PURE__*/ Symbol.for(`${libId}.slot`);
const mkErr = (msg) => /* @__PURE__ */ new Error(`${libName}: ${msg}`);
const unreachable = (x) => {
	throw mkErr(x);
};
const toJson = JSON.stringify;
const fromJson = (s) => {
	try {
		return JSON.parse(s);
	} catch {
		throw mkErr(`failed to parse JSON (${s.length} bytes)`);
	}
};
const encodeBytes = (txt) => encoder.encode(txt);
const encodeBytesInto = (txt, dest) => encoder.encodeInto(txt, dest);
const utf8ByteLength = (txt) => {
	let bytes = 0;
	for (let i = 0; i < txt.length; i++) {
		const code = txt.charCodeAt(i);
		if (code < 128) bytes += 1;
		else if (code < 2048) bytes += 2;
		else if (code >= 55296 && code <= 56319 && i + 1 < txt.length && (txt.charCodeAt(i + 1) & 64512) === 56320) {
			bytes += 4;
			i++;
		} else bytes += 3;
	}
	return bytes;
};
const decodeBytes = (buf) => decoder.decode(buf);
const b64UrlEncodeOpts = {
	alphabet: "base64url",
	omitPadding: true
};
const b64UrlDecodeOpts = { alphabet: "base64url" };
const nativeToBase64 = Uint8Array.prototype.toBase64;
const nativeFromBase64 = Uint8Array.fromBase64;
const toBase64Url = typeof nativeToBase64 === "function" ? (bytes) => nativeToBase64.call(bytes, b64UrlEncodeOpts) : (bytes) => {
	let bin = "";
	for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const fromBase64Url = typeof nativeFromBase64 === "function" ? (b64url) => nativeFromBase64(b64url, b64UrlDecodeOpts) : (b64url) => {
	const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
};
const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const base64UrlRe = /^[A-Za-z0-9_-]+$/;
const bytesToBigInt = (bytes) => {
	let res = 0n;
	for (const b of bytes) res = res << 8n | BigInt(b);
	return res;
};
const bytesMatch = (a, b) => {
	if (a.byteLength !== b.byteLength) return false;
	for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
	return true;
};
const hash32 = (str) => {
	const bytes = encodeBytes(str);
	let h = 2166136261;
	for (let i = 0; i < bytes.byteLength; i++) h = Math.imul(h ^ bytes[i], 16777619);
	h ^= h >>> 16;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	h = Math.imul(h, 3266489909);
	return (h ^ h >>> 16) >>> 0;
};
const createBoundedCache = (maxSize = 4096) => {
	const map = /* @__PURE__ */ new Map();
	return {
		get size() {
			return map.size;
		},
		get: (key) => {
			if (!map.has(key)) return;
			const value = map.get(key);
			map.delete(key);
			map.set(key, value);
			return value;
		},
		has: (key) => map.has(key),
		set: (key, value) => {
			if (map.has(key)) map.delete(key);
			else if (map.size >= maxSize) {
				const oldest = map.keys().next().value;
				if (oldest !== void 0) map.delete(oldest);
			}
			map.set(key, value);
		},
		delete: (key) => map.delete(key),
		clear: () => map.clear(),
		keys: () => [...map.keys()],
		entries: () => [...map.entries()]
	};
};
const createBoundedSet = (maxSize = 4096) => {
	const set = /* @__PURE__ */ new Set();
	return {
		has: (value) => set.has(value),
		add: (value) => {
			if (set.has(value)) return false;
			if (set.size >= maxSize) {
				const oldest = set.keys().next().value;
				if (oldest !== void 0) set.delete(oldest);
			}
			set.add(value);
			return true;
		},
		clear: () => set.clear()
	};
};

export { base62Alphabet, base64UrlRe, bytesMatch, bytesToBigInt, createBoundedCache, createBoundedSet, decodeBytes, domainTag, encodeBytes, encodeBytesInto, fromBase64Url, fromJson, hash32, libId, libName, mkErr, pluginSlotSymbol, socketInitialFailureSymbol, toBase64Url, toJson, unreachable, utf8ByteLength };