"use client";

import React, { useState } from "react";
import { GameStats, ACHIEVEMENTS, getAchievementDetails } from "./gamification";

export interface GamificationPanelProps {
	gameStats: GameStats;
	sessionPoints: number;
}

export const GamificationPanel: React.FC<GamificationPanelProps> = ({ gameStats, sessionPoints }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"overview" | "achievements" | "challenges">("overview");

	const sessionPointsDisplay = sessionPoints > 0 ? `+${sessionPoints}` : "";

	return (
		<div className="fixed right-3 top-64 z-40 font-sans">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-lg font-semibold transition-colors"
			>
				⭐ Lv {gameStats.level}
			</button>

			{isOpen && (
				<div className="mt-2 bg-white rounded-lg shadow-2xl border-2 border-amber-400 w-80 max-h-96 overflow-hidden flex flex-col">
					{/* Header */}
					<div className="bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-white">
						<h2 className="text-xl font-bold">Gamification Stats</h2>
					</div>

					{/* Tabs */}
					<div className="flex border-b">
						<button
							onClick={() => setActiveTab("overview")}
							className={`flex-1 px-3 py-2 text-sm font-semibold transition-colors ${
								activeTab === "overview"
									? "bg-amber-100 text-amber-900 border-b-2 border-amber-500"
									: "text-gray-600 hover:bg-gray-50"
							}`}
						>
							📊 Overview
						</button>
						<button
							onClick={() => setActiveTab("achievements")}
							className={`flex-1 px-3 py-2 text-sm font-semibold transition-colors ${
								activeTab === "achievements"
									? "bg-amber-100 text-amber-900 border-b-2 border-amber-500"
									: "text-gray-600 hover:bg-gray-50"
							}`}
						>
							🏆 Achievements
						</button>
						<button
							onClick={() => setActiveTab("challenges")}
							className={`flex-1 px-3 py-2 text-sm font-semibold transition-colors ${
								activeTab === "challenges"
									? "bg-amber-100 text-amber-900 border-b-2 border-amber-500"
									: "text-gray-600 hover:bg-gray-50"
							}`}
						>
							🎯 Challenges
						</button>
					</div>

					{/* Content */}
					<div className="flex-1 overflow-y-auto p-4">
						{activeTab === "overview" && (
							<div className="space-y-4">
								<div>
									<div className="flex justify-between items-center mb-2">
										<span className="font-semibold text-gray-700">Level {gameStats.level}</span>
										<span className="text-sm text-gray-600">{gameStats.totalPoints} points</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
										<div
											className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all"
											style={{
												width: `${Math.min(
													((gameStats.totalPoints % 500) / 500) * 100,
													100,
												)}%`,
											}}
										/>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3 text-sm">
									<div className="bg-blue-50 p-3 rounded-lg">
										<div className="text-gray-600">Current Streak</div>
										<div className="text-2xl font-bold text-blue-600">{gameStats.currentStreak}</div>
										<div className="text-xs text-gray-500">days</div>
									</div>
									<div className="bg-red-50 p-3 rounded-lg">
										<div className="text-gray-600">Longest Streak</div>
										<div className="text-2xl font-bold text-red-600">{gameStats.longestStreak}</div>
										<div className="text-xs text-gray-500">days</div>
									</div>
									<div className="bg-green-50 p-3 rounded-lg">
										<div className="text-gray-600">Total Reps</div>
										<div className="text-2xl font-bold text-green-600">{gameStats.totalReps}</div>
										<div className="text-xs text-gray-500">reps</div>
									</div>
									<div className="bg-purple-50 p-3 rounded-lg">
										<div className="text-gray-600">Accuracy</div>
										<div className="text-2xl font-bold text-purple-600">
											{(gameStats.averageAccuracy * 100).toFixed(0)}%
										</div>
										<div className="text-xs text-gray-500">avg</div>
									</div>
								</div>

								<div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
									Sessions completed: {gameStats.totalSessions}
								</div>
							</div>
						)}

						{activeTab === "achievements" && (
							<div className="space-y-2">
								<div className="grid grid-cols-4 gap-2">
									{ACHIEVEMENTS.map((achievement) => (
										<div
											key={achievement.id}
											className={`aspect-square rounded-lg flex flex-col items-center justify-center text-center p-2 transition-all ${
												gameStats.achievements.includes(achievement.id)
													? "bg-gradient-to-b from-amber-200 to-amber-300 shadow-md"
													: "bg-gray-100 opacity-50"
											}`}
											title={achievement.name}
										>
											<div className="text-2xl mb-1">{achievement.icon}</div>
											<div className="text-xs font-bold line-clamp-2">{achievement.name}</div>
										</div>
									))}
								</div>
								<div className="text-xs text-gray-600 text-center border-t pt-2">
									{gameStats.achievements.length}/{ACHIEVEMENTS.length} unlocked
								</div>
							</div>
						)}

						{activeTab === "challenges" && (
							<div className="space-y-2">
								<div className="text-sm text-gray-600">Daily and weekly challenges coming soon!</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
