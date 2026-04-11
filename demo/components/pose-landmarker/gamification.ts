// Gamification system for exercise tracking with motivation mechanics

export interface Achievement {
	id: string;
	name: string;
	description: string;
	icon: string;
	unlockCondition: (stats: GameStats) => boolean;
}

export interface Challenge {
	id: string;
	name: string;
	description: string;
	target: number;
	reward: number;
	completed: boolean;
	progress: number;
	type: "daily" | "weekly";
}

export interface GameStats {
	totalPoints: number;
	level: number;
	currentStreak: number; // consecutive days
	longestStreak: number;
	totalSessions: number;
	totalReps: number;
	averageAccuracy: number;
	achievements: string[]; // achievement IDs unlocked
	lastSessionDate: number;
	createdAt: number;
}

export interface SessionRecord {
	date: number;
	exerciseName: string;
	repsCompleted: number;
	averageAccuracy: number;
	pointsEarned: number;
	duration: number;
	formQuality: string;
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
	{
		id: "first_steps",
		name: "First Steps",
		description: "Complete your first exercise session",
		icon: "👣",
		unlockCondition: (stats) => stats.totalSessions >= 1,
	},
	{
		id: "consistency",
		name: "Consistent Athlete",
		description: "Maintain a 7-day exercise streak",
		icon: "📅",
		unlockCondition: (stats) => stats.currentStreak >= 7,
	},
	{
		id: "accuracy_master",
		name: "Accuracy Master",
		description: "Achieve 95%+ accuracy in a session",
		icon: "🎯",
		unlockCondition: (stats) => stats.averageAccuracy >= 0.95,
	},
	{
		id: "century",
		name: "Century Club",
		description: "Complete 100+ total repetitions",
		icon: "💯",
		unlockCondition: (stats) => stats.totalReps >= 100,
	},
	{
		id: "point_master",
		name: "Point Master",
		description: "Earn 1000+ total points",
		icon: "⭐",
		unlockCondition: (stats) => stats.totalPoints >= 1000,
	},
	{
		id: "level_5",
		name: "Level 5 Reached",
		description: "Reach level 5",
		icon: "🏆",
		unlockCondition: (stats) => stats.level >= 5,
	},
	{
		id: "level_10",
		name: "Level 10 Reached",
		description: "Reach level 10",
		icon: "👑",
		unlockCondition: (stats) => stats.level >= 10,
	},
	{
		id: "rep_warrior",
		name: "Rep Warrior",
		description: "Complete 300+ total repetitions",
		icon: "⚔️",
		unlockCondition: (stats) => stats.totalReps >= 300,
	},
	{
		id: "month_streak",
		name: "Month Master",
		description: "Maintain a 30-day exercise streak",
		icon: "🔥",
		unlockCondition: (stats) => stats.currentStreak >= 30,
	},
	{
		id: "perfect_form",
		name: "Perfect Form",
		description: "Achieve 5 sessions with 98%+ accuracy",
		icon: "✨",
		unlockCondition: (stats) => stats.achievements.includes("accuracy_master"),
	},
];

export function calculateSessionPoints(
	reps: number,
	accuracy: number,
	currentStreak: number,
): number {
	// Base points based on accuracy
	let basePoints = accuracy >= 0.95 ? 100 : accuracy >= 0.9 ? 80 : accuracy >= 0.8 ? 60 : accuracy >= 0.7 ? 40 : 20;

	// Reps bonus (5 points per rep)
	const repsBonus = reps * 5;

	// Streak multiplier (1.0x to 1.5x)
	const streakMultiplier = 1 + Math.min(0.5, currentStreak * 0.1);

	return Math.floor((basePoints + repsBonus) * streakMultiplier);
}

export function getFormQuality(accuracy: number): string {
	if (accuracy >= 0.95) return "Perfect";
	if (accuracy >= 0.9) return "Excellent";
	if (accuracy >= 0.8) return "Good";
	if (accuracy >= 0.7) return "Fair";
	return "Poor";
}

export function getLevelFromPoints(points: number): number {
	if (points < 500) return 1;
	if (points < 1000) return 2;
	if (points < 1500) return 3;
	if (points < 2000) return 4;
	if (points < 2500) return 5;
	if (points < 3500) return 6;
	if (points < 4500) return 7;
	if (points < 5500) return 8;
	if (points < 6500) return 9;
	return 10 + Math.floor((points - 6500) / 1500);
}

export function getLevelProgress(points: number): { current: number; needed: number; percentage: number } {
	const currentLevel = getLevelFromPoints(points);
	const thresholds = [0, 500, 1000, 1500, 2000, 2500, 3500, 4500, 5500, 6500];

	const currentThreshold = thresholds[Math.min(currentLevel - 1, 9)] || 0;
	const nextThreshold = thresholds[Math.min(currentLevel, 9)] || currentThreshold + 1500;

	const current = Math.max(0, points - currentThreshold);
	const needed = nextThreshold - currentThreshold;
	const percentage = (current / needed) * 100;

	return { current, needed, percentage: Math.min(100, percentage) };
}

export function updateStreak(lastDate: number, currentDate: number): { streak: number; isNewDay: boolean } {
	const msPerDay = 24 * 60 * 60 * 1000;
	const daysDiff = Math.floor((currentDate - lastDate) / msPerDay);

	if (daysDiff === 0) return { streak: 0, isNewDay: false };
	if (daysDiff === 1) return { streak: 1, isNewDay: true };
	return { streak: 0, isNewDay: true };
}

export function recordSession(stats: GameStats, session: SessionRecord): GameStats {
	const newStats = { ...stats };

	// Add points
	newStats.totalPoints += session.pointsEarned;

	// Update level
	newStats.level = getLevelFromPoints(newStats.totalPoints);

	// Track reps and accuracy
	newStats.totalSessions += 1;
	newStats.totalReps += session.repsCompleted;
	newStats.averageAccuracy =
		(newStats.averageAccuracy * (newStats.totalSessions - 1) + session.averageAccuracy) / newStats.totalSessions;

	// Update streak
	const streakUpdate = updateStreak(stats.lastSessionDate, session.date);
	if (streakUpdate.isNewDay) {
		newStats.currentStreak = streakUpdate.streak + 1;
		newStats.longestStreak = Math.max(newStats.longestStreak, newStats.currentStreak);
	}
	newStats.lastSessionDate = session.date;

	// Check for new achievements
	const newAchievementIds = ACHIEVEMENTS.filter(
		(achievement) =>
			!newStats.achievements.includes(achievement.id) && achievement.unlockCondition(newStats),
	).map((a) => a.id);

	newStats.achievements = [...newStats.achievements, ...newAchievementIds];

	return newStats;
}

export function getAchievementDetails(id: string): Achievement | undefined {
	return ACHIEVEMENTS.find((a) => a.id === id);
}

export function getActiveChallenges(): Challenge[] {
	const today = new Date();
	const dayOfWeek = today.getDay();

	return [
		{
			id: "daily_50_reps",
			name: "Daily 50",
			description: "Complete 50 reps today",
			target: 50,
			reward: 100,
			completed: false,
			progress: 0,
			type: "daily",
		},
		{
			id: "daily_95_accuracy",
			name: "Accuracy Challenge",
			description: "Maintain 95% accuracy",
			target: 95,
			reward: 150,
			completed: false,
			progress: 0,
			type: "daily",
		},
		{
			id: "weekly_300_reps",
			name: "Weekly Warrior",
			description: "Complete 300 reps this week",
			target: 300,
			reward: 500,
			completed: false,
			progress: 0,
			type: "weekly",
		},
	];
}

export function loadGameStats(): GameStats {
	if (typeof window === "undefined") {
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
	}

	const saved = localStorage.getItem("gameStats");
	if (saved) {
		try {
			return JSON.parse(saved);
		} catch {
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
}

export function saveGameStats(stats: GameStats): void {
	if (typeof window !== "undefined") {
		localStorage.setItem("gameStats", JSON.stringify(stats));
	}
}
