import React from 'react';
import { Trash2, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  timestamp: string;
}

interface MealLogProps {
  meals: Meal[];
  onDeleteMeal?: (id: string) => void;
}

export function MealLog({ meals, onDeleteMeal }: MealLogProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  if (meals.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-gray-400">No meals logged yet. Start by saying what you ate!</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
        Today's Meals
      </h3>
      {meals.map((meal) => (
        <Card key={meal.id} className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-gray-900">{meal.name}</h4>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(meal.timestamp)}
                </span>
              </div>
              
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">Cal</span>
                  <div className="font-semibold text-gray-900">{meal.calories}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Protein</span>
                  <div className="font-semibold text-blue-600">{meal.protein}g</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Carbs</span>
                  <div className="font-semibold text-orange-600">{meal.carbs}g</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Fats</span>
                  <div className="font-semibold text-purple-600">{meal.fats}g</div>
                </div>
              </div>
            </div>

            {onDeleteMeal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteMeal(meal.id)}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
