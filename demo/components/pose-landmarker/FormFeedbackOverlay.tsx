"use client";

import React from "react";

export interface FormFeedbackOverlayProps {
	accuracy: number;
	pointsEarned: number;
	currentStreak: number;
	formQuality: string;
	showPoints?: boolean;
	showAccuracy?: boolean;
}

export const FormFeedbackOverlay: React.FC<FormFeedbackOverlayProps> = ({
	accuracy,
	pointsEarned,
	currentStreak,
	formQuality,
	showPoints = true,
	showAccuracy = true,
}) => {
	const accuracyPercentage = (accuracy * 100).toFixed(1);

	return (
		<>
			{/* Form Quality - Top Center */}
			{formQuality && (
				<div
					className="fixed top-1 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-lg font-bold text-sm z-30 animate-bounce"
					style={{
						animation: "bounce 0.6s ease-in-out infinite",
					}}
				>
					Form Quality: {formQuality}
				</div>
			)}

			{/* Accuracy Display - Left Side */}
			{showAccuracy && (
				<div className="fixed top-24 left-3 bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg font-semibold text-sm z-30">
					Accuracy: {accuracyPercentage}%
				</div>
			)}

			{/* Points Display - Left Side, Stacked */}
			{showPoints && pointsEarned > 0 && (
				<div
					className="fixed top-40 left-3 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg font-bold text-lg z-30 animate-bounce"
					style={{
						animation: "bounce 0.8s ease-in-out infinite",
					}}
				>
					+{pointsEarned} points!
				</div>
			)}

			{/* Streak Indicator - Left Side, Bottom */}
			{currentStreak > 0 && (
				<div className="fixed bottom-20 left-3 bg-red-500 text-white px-3 py-2 rounded-lg shadow-lg font-semibold text-sm z-30">
					🔥 {currentStreak}-Day Streak!
				</div>
			)}

			<style>{`
				@keyframes bounce {
					0%, 100% {
						transform: translateY(0);
					}
					50% {
						transform: translateY(-10px);
					}
				}
			`}</style>
		</>
	);
};
