"use client";

import { useEffect, useRef, useState } from "react";
import {
	GameStats,
	SessionRecord,
	calculateSessionPoints,
	getFormQuality,
	loadGameStats,
	saveGameStats,
	recordSession,
	ACHIEVEMENTS,
} from "./gamification";

export interface UseGameificationReturn {
	gameStats: GameStats;
	sessionPoints: number;
	sessionAccuracy: number;
	sessionReps: number;
	unlockedAchievement: {
		id: string;
		name: string;
		icon: string;
		description: string;
	} | null;
	updateSessionAccuracy: (accuracy: number) => void;
	updateSessionReps: (reps: number) => void;
	recordGameSession: (duration: number) => void;
	setUnlockedAchievement: (achievement: any | null) => void;
}

export function useGameification(): UseGameificationReturn {
	const [gameStats, setGameStats] = useState<GameStats>({
		totalPoints: 0,
		level: 1,
		currentStreak: 0,
		longestStreak: 0,
		totalSessions: 0,
		totalReps: 0,
		averageAccuracy: 0,
		achievements: [],
		lastSessionDate: 0,
		createdAt: Date.now(),
	});

	const [sessionPoints, setSessionPoints] = useState(0);
	const [sessionAccuracy, setSessionAccuracy] = useState(0);
	const [sessionReps, setSessionReps] = useState(0);
	const [unlockedAchievement, setUnlockedAchievement] = useState<any | null>(null);

	const lastSaveTime = useRef(Date.now());
	const sessionStartTimeRef = useRef<number | null>(null);

	// Initialize game stats from localStorage (client-side only)
	useEffect(() => {
		const stats = loadGameStats();
		setGameStats(stats);
		sessionStartTimeRef.current = Date.now();
	}, []);

	// Auto-save to localStorage every 5 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			if (Date.now() - lastSaveTime.current > 5000) {
				saveGameStats(gameStats);
				lastSaveTime.current = Date.now();
			}
		}, 5000);

		return () => clearInterval(interval);
	}, [gameStats]);

	const updateSessionAccuracy = (accuracy: number) => {
		setSessionAccuracy(accuracy);
	};

	const updateSessionReps = (reps: number) => {
		setSessionReps(reps);
	};

	const recordGameSession = (duration: number) => {
		if (sessionReps === 0 || sessionAccuracy === 0) return;

		const pointsEarned = calculateSessionPoints(sessionReps, sessionAccuracy, gameStats.currentStreak);
		const formQuality = getFormQuality(sessionAccuracy);

		const session: SessionRecord = {
			date: Date.now(),
			exerciseName: "Pose Exercise",
			repsCompleted: sessionReps,
			averageAccuracy: sessionAccuracy,
			pointsEarned: pointsEarned,
			duration: duration,
			formQuality: formQuality,
		};

		const updatedStats = recordSession(gameStats, session);

		// Check for newly unlocked achievements
		const newlyUnlocked = ACHIEVEMENTS.find(
			(a) => !gameStats.achievements.includes(a.id) && updatedStats.achievements.includes(a.id),
		);

		setGameStats(updatedStats);
		saveGameStats(updatedStats);

		if (newlyUnlocked) {
			setUnlockedAchievement({
				id: newlyUnlocked.id,
				name: newlyUnlocked.name,
				icon: newlyUnlocked.icon,
				description: newlyUnlocked.description,
			});
		}

		setSessionPoints(pointsEarned);
		setSessionReps(0);
		setSessionAccuracy(0);
	};

	return {
		gameStats,
		sessionPoints,
		sessionAccuracy,
		sessionReps,
		unlockedAchievement,
		updateSessionAccuracy,
		updateSessionReps,
		recordGameSession,
		setUnlockedAchievement,
	};
}
