import { encodeBytes, toJson } from "@trystero-p2p/core";
import { schnorr } from "@noble/secp256k1";

// src/protocol.ts
const tag = "x";
const eventMsgType = "EVENT";
const subscribeClockSkewSeconds = 60;
const nativeToHex = Uint8Array.prototype.toHex;
const toHex = typeof nativeToHex === "function" ? (bytes) => nativeToHex.call(bytes) : (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const now = () => Math.floor(Date.now() / 1e3);
const subscribeSince = () => Math.max(0, now() - subscribeClockSkewSeconds);
const createSigner = () => {
	const { secretKey, publicKey } = schnorr.keygen();
	return {
		secretKey,
		pubkey: toHex(publicKey)
	};
};
const topicToKind = (topic) => {
	let h = 2166136261;
	for (let i = 0; i < topic.length; i++) h = Math.imul(h ^ topic.charCodeAt(i), 16777619);
	return (h >>> 0) % 1e4 + 2e4;
};
const createEvent = async (topic, content, signer) => {
	const payload = {
		kind: topicToKind(topic),
		tags: [["x", topic]],
		created_at: now(),
		content,
		pubkey: signer.pubkey
	};
	const id = new Uint8Array(await crypto.subtle.digest("SHA-256", encodeBytes(toJson([
		0,
		payload.pubkey,
		payload.created_at,
		payload.kind,
		payload.tags,
		payload.content
	]))));
	return toJson([eventMsgType, {
		...payload,
		id: toHex(id),
		sig: toHex(await schnorr.signAsync(id, signer.secretKey))
	}]);
};

export { createEvent, createSigner, eventMsgType, subscribeSince, topicToKind };