type PoseLandmarksPayload = {
	type: "landmarks";
	frameIndex: number;
	timestamp: number;
	landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number; presence?: number }>>;
};

self.addEventListener("message", (event: MessageEvent<PoseLandmarksPayload>) => {
	const message = event.data;

	if (message.type !== "landmarks") {
		return;
	}

	console.log("Pose landmarks received by worker:", {
		frameIndex: message.frameIndex,
		timestamp: message.timestamp,
		landmarks: message.landmarks,
	});
});

export {};
