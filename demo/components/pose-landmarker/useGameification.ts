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
	addSessionPoints: (points: number) => void;
	updateSessionReps: (reps: number) => void;
	recordGameSession: (duration: number) => void;
	setUnlockedAchievement: (achievement: { id: string; name: string; icon: string; description: string } | null) => void;
}

export function useGameification(): UseGameificationReturn {
	const [gameStats, setGameStats] = useState<GameStats>(() => {
		// Load from localStorage on client-side initialization
		if (typeof window !== "undefined") {
			const saved = loadGameStats();
			if (saved.totalSessions > 0 || saved.totalPoints > 0) {
				return saved;
			}
		}
		return {
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
		};
	});

	const [sessionPoints, setSessionPoints] = useState(0);
	const [sessionAccuracy, setSessionAccuracy] = useState(0);
	const [sessionReps, setSessionReps] = useState(0);
	const [unlockedAchievement, setUnlockedAchievement] = useState<{
		id: string;
		name: string;
		icon: string;
		description: string;
	} | null>(null);

	const lastSaveTime = useRef(0);
	const sessionStartTimeRef = useRef<number | null>(null);
	const gameStatsRef = useRef(gameStats);

	// Initialize refs on mount
	useEffect(() => {
		gameStatsRef.current = gameStats;
		sessionStartTimeRef.current = Date.now();
		lastSaveTime.current = Date.now();
	}, []);

	// Keep gameStatsRef in sync with gameStats
	useEffect(() => {
		gameStatsRef.current = gameStats;
	}, [gameStats]);

	// Auto-save to localStorage every 5 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			if (Date.now() - lastSaveTime.current > 5000) {
				saveGameStats(gameStatsRef.current);
				lastSaveTime.current = Date.now();
			}
		}, 5000);

		return () => clearInterval(interval);
	}, []);

	const updateSessionAccuracy = (accuracy: number) => {
		setSessionAccuracy(accuracy);
	};

	const addSessionPoints = (points: number) => {
		const safePoints = Math.max(0, Math.floor(points));
		if (safePoints <= 0) {
			return;
		}

		setSessionPoints((previousPoints) => previousPoints + safePoints);
	};

	const updateSessionReps = (reps: number) => {
		const previousReps = sessionReps;
		setSessionReps(reps);
		// Only calculate and award points if reps actually increased
		if (reps > previousReps && sessionAccuracy > 0) {
			const points = calculateSessionPoints(reps, sessionAccuracy, gameStats.currentStreak);
			setSessionPoints(points);
		}
	};

	const recordGameSession = (duration: number) => {
		if (sessionReps === 0 || sessionAccuracy === 0) return;

		const pointsEarned = sessionPoints;
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
		addSessionPoints,
		updateSessionReps,
		recordGameSession,
		setUnlockedAchievement,
	};
}
