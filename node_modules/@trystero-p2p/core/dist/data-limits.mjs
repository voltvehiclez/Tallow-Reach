// src/data-limits.ts
const maxActionFrameBytes = 16384;
const maxBulkFrameBytes = 65536;
const maxOverlayHeaderBytes = 1024;
const maxRoomFrameBytes = 17408;
const pendingDataTimeoutMs = 1e4;
const transferTimeoutMs = 12e4;

export { maxActionFrameBytes, maxBulkFrameBytes, maxOverlayHeaderBytes, maxRoomFrameBytes, pendingDataTimeoutMs, transferTimeoutMs };