"use client";

import React, { useEffect, useState } from "react";

export interface AchievementUnlockProps {
	achievement?: {
		id: string;
		name: string;
		icon: string;
		description: string;
	} | null;
	onDismiss?: () => void;
}

export const AchievementUnlock: React.FC<AchievementUnlockProps> = ({ achievement, onDismiss }) => {
	const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

	useEffect(() => {
		if (!achievement) return;

		// Create particle burst effect
		const newParticles = Array.from({ length: 8 }, (_, i) => ({
			id: i,
			x: Math.cos((i / 8) * Math.PI * 2) * 100,
			y: Math.sin((i / 8) * Math.PI * 2) * 100,
		}));
		setParticles(newParticles);

		// Auto-dismiss after 4 seconds
		const timer = setTimeout(() => {
			onDismiss?.();
		}, 4000);

		return () => clearTimeout(timer);
	}, [achievement, onDismiss]);

	if (!achievement) return null;

	return (
		<div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
			{/* Celebration Modal */}
			<div
				className="bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-2xl shadow-2xl p-8 text-center transform animate-celebration-pop"
				style={{
					animation: "celebrationPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
				}}
			>
				<div className="text-6xl mb-4 animate-bounce">{achievement.icon}</div>
				<h2 className="text-3xl font-bold mb-2">Achievement Unlocked!</h2>
				<h3 className="text-2xl font-semibold mb-1">{achievement.name}</h3>
				<p className="text-sm opacity-90">{achievement.description}</p>
			</div>

			{/* Particle Burst */}
			{particles.map((particle) => (
				<div
					key={particle.id}
					className="absolute text-3xl"
					style={{
						animation: `particleBurst 1s ease-out forwards`,
						left: "50%",
						top: "50%",
						marginLeft: "-1.5rem",
						marginTop: "-1.5rem",
						transform: `translate(${particle.x * 1.5}px, ${particle.y * 1.5}px)`,
						opacity: 0,
						pointerEvents: "none",
					}}
				>
					✨
				</div>
			))}

			<style>{`
				@keyframes celebrationPop {
					0% {
						transform: scale(0) rotate(-10deg);
						opacity: 0;
					}
					50% {
						transform: scale(1.1) rotate(5deg);
					}
					100% {
						transform: scale(1) rotate(0deg);
						opacity: 1;
					}
				}

				@keyframes particleBurst {
					0% {
						opacity: 1;
						transform: translate(0, 0) scale(1);
					}
					100% {
						opacity: 0;
						transform: translate(var(--tx), var(--ty)) scale(0);
					}
				}

				.animate-celebration-pop {
					animation: celebrationPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
				}
			`}</style>
		</div>
	);
};
