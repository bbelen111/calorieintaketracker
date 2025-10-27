/**
 * Pre-configured phase templates to help users get started quickly
 */

export const PHASE_TEMPLATES = [
  {
    id: 'bulk',
    name: 'Bulk Phase',
    description: 'Gain muscle mass with calorie surplus',
    icon: '💪',
    defaultName: 'Bulk',
    suggestedDuration: 90, // days
    goalType: 'bulk',
    targetWeightChange: +8, // kg
    tips: [
      'Aim for 0.25-0.5 kg weight gain per week',
      'Focus on progressive overload in training',
      'Prioritize protein intake (2g per kg bodyweight)',
      'Track measurements beyond just weight'
    ]
  },
  {
    id: 'cut',
    name: 'Cut Phase',
    description: 'Lose body fat with calorie deficit',
    icon: '🔥',
    defaultName: 'Cut',
    suggestedDuration: 60, // days
    goalType: 'cut',
    targetWeightChange: -5, // kg
    tips: [
      'Aim for 0.5-1% bodyweight loss per week',
      'Maintain high protein to preserve muscle',
      'Consider diet breaks every 4-6 weeks',
      'Focus on strength maintenance'
    ]
  },
  {
    id: 'maintenance',
    name: 'Maintenance Phase',
    description: 'Maintain current weight and build habits',
    icon: '⚖️',
    defaultName: 'Maintenance',
    suggestedDuration: 30, // days
    goalType: 'maintain',
    targetWeightChange: 0, // kg
    tips: [
      'Focus on consistency over perfection',
      'Great for building sustainable habits',
      'Perfect between bulk/cut phases',
      'Monitor energy levels and performance'
    ]
  },
  {
    id: 'lean-bulk',
    name: 'Lean Bulk',
    description: 'Gain muscle with minimal fat gain',
    icon: '📈',
    defaultName: 'Lean Bulk',
    suggestedDuration: 120, // days
    goalType: 'bulk',
    targetWeightChange: +4, // kg
    tips: [
      'Aim for slower gain: 0.25 kg per week',
      'Keep calorie surplus moderate (200-300)',
      'Track body composition regularly',
      'Adjust if gaining too fast'
    ]
  },
  {
    id: 'mini-cut',
    name: 'Mini Cut',
    description: 'Short aggressive cut to reduce body fat',
    icon: '⚡',
    defaultName: 'Mini Cut',
    suggestedDuration: 21, // days
    goalType: 'cut',
    targetWeightChange: -2, // kg
    tips: [
      '2-4 week aggressive deficit',
      'Higher protein to preserve muscle',
      'Reduce training volume if needed',
      'Great for getting lean quickly'
    ]
  },
  {
    id: 'reverse-diet',
    name: 'Reverse Diet',
    description: 'Gradually increase calories after cut',
    icon: '🔄',
    defaultName: 'Reverse Diet',
    suggestedDuration: 45, // days
    goalType: 'maintain',
    targetWeightChange: +1, // kg
    tips: [
      'Increase calories by 50-100 per week',
      'Minimize fat regain post-diet',
      'Monitor weight and measurements',
      'Patience is key for metabolic recovery'
    ]
  }
];

/**
 * Get template by ID
 */
export const getTemplateById = (id) => {
  return PHASE_TEMPLATES.find(t => t.id === id);
};

/**
 * Apply template to phase creation form
 * Returns object with pre-filled form values
 */
export const applyTemplate = (template, currentWeight) => {
  if (!template) return {};
  
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + template.suggestedDuration);
  
  let targetWeight = null;
  if (currentWeight && template.targetWeightChange !== 0) {
    targetWeight = currentWeight + template.targetWeightChange;
    // Clamp to valid range
    targetWeight = Math.max(30, Math.min(210, targetWeight));
  }
  
  return {
    name: template.defaultName,
    startDate,
    endDate: endDate.toISOString().split('T')[0],
    goalType: template.goalType,
    targetWeight
  };
};
