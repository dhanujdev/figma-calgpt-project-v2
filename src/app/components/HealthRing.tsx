import React from 'react';

interface MacroData {
  current: number;
  goal: number;
  color: string;
}

interface HealthRingProps {
  calories: MacroData;
  protein: MacroData;
  carbs: MacroData;
  fats: MacroData;
}

export function HealthRing({ calories, protein, carbs, fats }: HealthRingProps) {
  const calculateProgress = (current: number, goal: number) => {
    return Math.min((current / goal) * 100, 100);
  };

  const calculateStrokeDasharray = (progress: number, radius: number) => {
    const circumference = 2 * Math.PI * radius;
    const filled = (progress / 100) * circumference;
    return `${filled} ${circumference}`;
  };

  const calorieProgress = calculateProgress(calories.current, calories.goal);
  const proteinProgress = calculateProgress(protein.current, protein.goal);
  const carbsProgress = calculateProgress(carbs.current, carbs.goal);
  const fatsProgress = calculateProgress(fats.current, fats.goal);

  // Determine main ring color based on calorie progress
  const mainColor = calorieProgress <= 100 ? '#10b981' : '#ef4444'; // emerald-500 or red-500

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* Main Calorie Ring */}
      <div className="relative w-64 h-64">
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="128"
            cy="128"
            r="110"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="20"
          />
          {/* Progress circle */}
          <circle
            cx="128"
            cy="128"
            r="110"
            fill="none"
            stroke={mainColor}
            strokeWidth="20"
            strokeDasharray={calculateStrokeDasharray(calorieProgress, 110)}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-5xl font-bold" style={{ color: mainColor }}>
            {calories.current}
          </div>
          <div className="text-sm text-gray-500 mt-1">of {calories.goal}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">
            calories
          </div>
        </div>
      </div>

      {/* Macro breakdown */}
      <div className="grid grid-cols-3 gap-6 w-full max-w-md">
        {/* Protein */}
        <MacroRingSmall
          label="Protein"
          current={protein.current}
          goal={protein.goal}
          color={protein.color}
          progress={proteinProgress}
        />

        {/* Carbs */}
        <MacroRingSmall
          label="Carbs"
          current={carbs.current}
          goal={carbs.goal}
          color={carbs.color}
          progress={carbsProgress}
        />

        {/* Fats */}
        <MacroRingSmall
          label="Fats"
          current={fats.current}
          goal={fats.goal}
          color={fats.color}
          progress={fatsProgress}
        />
      </div>
    </div>
  );
}

interface MacroRingSmallProps {
  label: string;
  current: number;
  goal: number;
  color: string;
  progress: number;
}

function MacroRingSmall({ label, current, goal, color, progress }: MacroRingSmallProps) {
  const calculateStrokeDasharray = (progress: number, radius: number) => {
    const circumference = 2 * Math.PI * radius;
    const filled = (progress / 100) * circumference;
    return `${filled} ${circumference}`;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20 mb-2">
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={calculateStrokeDasharray(progress, 32)}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-lg font-bold" style={{ color }}>
            {current}
          </div>
        </div>
      </div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xs text-gray-400">{goal}g</div>
    </div>
  );
}
