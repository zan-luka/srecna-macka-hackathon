"use client";

import React from "react";

export interface FormFeedbackOverlayProps {
	accuracy: number;
	pointsEarned: number;
	totalSessionPoints: number;
	currentStreak: number;
	formQuality: string;
	showPoints?: boolean;
	showAccuracy?: boolean;
}

export const FormFeedbackOverlay: React.FC<FormFeedbackOverlayProps> = ({
	accuracy,
	pointsEarned,
	totalSessionPoints,
	currentStreak,
	formQuality,
	showPoints = true,
	showAccuracy = true,
}) => {
	const accuracyPercentage = (accuracy * 100).toFixed(1);

	return (
		<>
			
			{/* Form Quality - Right of center controls */}
			<div
				className="fixed top-12 left-1/2 translate-x-full ml-24 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-lg font-bold text-xs z-30 animate-bounce"
				style={{
					animation: "bounce 0.6s ease-in-out infinite",
					display: formQuality ? "block" : "none",
				}}
				suppressHydrationWarning
			>
				Form: {formQuality}
			</div>

			{/* Vertical feedback stack on the right side */}
			
			{/* Accuracy Display - Top of right stack */}
			<div
				className="fixed top-16 right-3 bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg font-semibold text-sm z-30"
				style={{
					display: showAccuracy ? "block" : "none",
				}}
				suppressHydrationWarning
			>
				{accuracyPercentage}%
			</div>

			{/* Points Display - Below Accuracy */}
			<div
				className="fixed top-32 right-3 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg font-bold text-lg z-30 animate-bounce"
				style={{
					animation: "bounce 0.8s ease-in-out infinite",
					display: showPoints && pointsEarned > 0 ? "block" : "none",
				}}
				suppressHydrationWarning
			>
				+{pointsEarned}
			</div>

			{/* Streak Indicator - Below Points */}
			<div
				className="fixed top-48 right-3 bg-red-500 text-white px-3 py-2 rounded-lg shadow-lg font-semibold text-sm z-30"
				style={{
					display: currentStreak > 0 ? "block" : "none",
				}}
				suppressHydrationWarning
			>
				🔥 {currentStreak}d
			</div>

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
