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
			{/* Vertical feedback stack on the right side */}
			
			{/* Form Quality - Top of right stack */}
			{formQuality && (
				<div
					className="fixed top-16 right-3 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-lg font-bold text-sm z-30 animate-bounce"
					style={{
						animation: "bounce 0.6s ease-in-out infinite",
					}}
				>
					Form: {formQuality}
				</div>
			)}

			{/* Accuracy Display - Below Form Quality */}
			{showAccuracy && (
				<div className="fixed top-32 right-3 bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg font-semibold text-sm z-30">
					{accuracyPercentage}%
				</div>
			)}

			{/* Points Display - Below Accuracy */}
			{showPoints && pointsEarned > 0 && (
				<div
					className="fixed top-48 right-3 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg font-bold text-lg z-30 animate-bounce"
					style={{
						animation: "bounce 0.8s ease-in-out infinite",
					}}
				>
					+{pointsEarned}
				</div>
			)}

			{/* Streak Indicator - Bottom of right stack */}
			{currentStreak > 0 && (
				<div className="fixed top-64 right-3 bg-red-500 text-white px-3 py-2 rounded-lg shadow-lg font-semibold text-sm z-30">
					🔥 {currentStreak}d
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
