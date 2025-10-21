import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Settings, Plus, Trash2, Save, Dumbbell, Bike, Heart } from 'lucide-react';

const EnergyMapCalculator = () => {
  // Load from localStorage or use defaults
  const loadData = () => {
    const saved = localStorage.getItem('energyMapData');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      age: 21,
      weight: 74,
      height: 168,
      gender: 'male',
      trainingType: 'powerbuilding',
      trainingDuration: 2,
      stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
      cardioSessions: []
    };
  };

  const [userData, setUserData] = useState(loadData());
  const [selectedGoal, setSelectedGoal] = useState('maintenance');
  const [tempSelectedGoal, setTempSelectedGoal] = useState('maintenance');
  const [selectedDay, setSelectedDay] = useState('training');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [newStepRange, setNewStepRange] = useState('');
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [newCardio, setNewCardio] = useState({
    type: 'treadmill_walk',
    duration: 30,
    intensity: 'moderate'
  });
  
  // Save to localStorage whenever userData changes
  useEffect(() => {
    localStorage.setItem('energyMapData', JSON.stringify(userData));
  }, [userData]);
  
  // Training types with calorie burn rates (per hour)
  const trainingTypes = {
    bodybuilding: { 
      label: 'Bodybuilding', 
      caloriesPerHour: 220,
      description: 'Hypertrophy focus, moderate rest periods'
    },
    powerlifting: { 
      label: 'Powerlifting', 
      caloriesPerHour: 180,
      description: 'Heavy compounds, longer rest periods'
    },
    powerbuilding: { 
      label: 'Powerbuilding', 
      caloriesPerHour: 225,
      description: 'Mix of strength and hypertrophy'
    },
    strongman: { 
      label: 'Strongman', 
      caloriesPerHour: 280,
      description: 'High intensity events, carries, pushes'
    },
    crossfit: { 
      label: 'CrossFit', 
      caloriesPerHour: 300,
      description: 'High intensity, metabolic conditioning'
    },
    calisthenics: { 
      label: 'Calisthenics', 
      caloriesPerHour: 240,
      description: 'Bodyweight movements, skill work'
    }
  };
  
  // Cardio types with MET values (Metabolic Equivalent of Task)
  const cardioTypes = {
    treadmill_walk: { label: 'Treadmill Walk', met: { light: 3.5, moderate: 4.0, vigorous: 4.5 } },
    treadmill_jog: { label: 'Treadmill Jog', met: { light: 6.0, moderate: 7.0, vigorous: 8.0 } },
    treadmill_run: { label: 'Treadmill Run', met: { light: 8.0, moderate: 9.5, vigorous: 11.0 } },
    bike_stationary: { label: 'Stationary Bike', met: { light: 5.5, moderate: 7.0, vigorous: 10.0 } },
    bike_outdoor: { label: 'Outdoor Cycling', met: { light: 6.0, moderate: 8.0, vigorous: 10.0 } },
    elliptical: { label: 'Elliptical', met: { light: 5.0, moderate: 6.5, vigorous: 8.0 } },
    rowing: { label: 'Rowing Machine', met: { light: 4.8, moderate: 7.0, vigorous: 9.5 } },
    swimming: { label: 'Swimming', met: { light: 5.0, moderate: 7.0, vigorous: 9.0 } },
    stairmaster: { label: 'Stairmaster', met: { light: 6.0, moderate: 8.0, vigorous: 9.0 } }
  };
  
  // Calculate BMR using Mifflin-St Jeor Equation
  const calculateBMR = () => {
    const { age, weight, height, gender } = userData;
    if (gender === 'male') {
      return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
    } else {
      return Math.round(10 * weight + 6.25 * height - 5 * age - 161);
    }
  };
  
  const BMR = calculateBMR();
  
  // Calculate cardio calories burned using MET formula
  const calculateCardioCalories = (cardioSession) => {
    const met = cardioTypes[cardioSession.type].met[cardioSession.intensity];
    const hours = cardioSession.duration / 60;
    // MET formula: (MET * weight in kg * hours)
    return Math.round(met * userData.weight * hours);
  };
  
  // Calculate total cardio burn for the day
  const getTotalCardioBurn = () => {
    return userData.cardioSessions.reduce((total, session) => {
      return total + calculateCardioCalories(session);
    }, 0);
  };
  
  // Training calories based on type
  const trainingCalories = userData.trainingDuration * trainingTypes[userData.trainingType].caloriesPerHour;
  
  // Step-based calorie burns
  const getStepCalories = (stepRange) => {
    const stepValue = stepRange.replace(/[^0-9]/g, '');
    if (stepRange.includes('<')) {
      return 150;
    } else if (stepRange.includes('>')) {
      return Math.round((parseInt(stepValue) / 10000) * 250 + 100);
    } else {
      return Math.round((parseInt(stepValue) / 10000) * 250);
    }
  };
  
  // Calculate TDEE for different scenarios
  const calculateTDEE = (steps, isTrainingDay) => {
    const baseActivity = BMR * 0.3;
    const stepBurn = getStepCalories(steps);
    const trainingBurn = isTrainingDay ? trainingCalories : 0;
    const cardioBurn = getTotalCardioBurn();
    return Math.round(BMR + baseActivity + stepBurn + trainingBurn + cardioBurn);
  };
  
  // Calculate goal-based calories
  const calculateGoalCalories = (tdee, goal) => {
    switch(goal) {
      case 'aggressive_bulk':
        return Math.round(tdee + 500);
      case 'bulking':
        return Math.round(tdee + 350);
      case 'cutting':
        return Math.round(tdee - 300);
      case 'aggressive_cut':
        return Math.round(tdee - 500);
      case 'maintenance':
      default:
        return tdee;
    }
  };
  
  const goals = {
    aggressive_bulk: { 
      color: 'bg-purple-500', 
      icon: TrendingUp, 
      label: 'Aggressive Bulk', 
      desc: '+500 cal surplus',
      warning: '⚠️ May lead to increased fat gain. Monitor weekly weight.' 
    },
    bulking: { 
      color: 'bg-green-500', 
      icon: TrendingUp, 
      label: 'Lean Bulk', 
      desc: '+350 cal surplus',
      warning: null
    },
    maintenance: { 
      color: 'bg-blue-500', 
      icon: Minus, 
      label: 'Maintenance', 
      desc: 'At TDEE',
      warning: null
    },
    cutting: { 
      color: 'bg-orange-500', 
      icon: TrendingDown, 
      label: 'Moderate Cut', 
      desc: '-300 cal deficit',
      warning: null
    },
    aggressive_cut: { 
      color: 'bg-red-600', 
      icon: TrendingDown, 
      label: 'Aggressive Cut', 
      desc: '-500 cal deficit',
      warning: '⚠️ Risk of muscle loss and fatigue. Ensure high protein intake.' 
    }
  };
  
  const handleUserDataChange = (field, value) => {
    setUserData(prev => ({ ...prev, [field]: value }));
  };
  
  const addStepRange = () => {
    if (newStepRange && !userData.stepRanges.includes(newStepRange)) {
      setUserData(prev => ({
        ...prev,
        stepRanges: [...prev.stepRanges, newStepRange].sort((a, b) => {
          const aVal = parseInt(a.replace(/[^0-9]/g, '')) || 0;
          const bVal = parseInt(b.replace(/[^0-9]/g, '')) || 0;
          return aVal - bVal;
        })
      }));
      setNewStepRange('');
    }
  };
  
  const removeStepRange = (stepRange) => {
    setUserData(prev => ({
      ...prev,
      stepRanges: prev.stepRanges.filter(s => s !== stepRange)
    }));
  };
  
  const addCardioSession = () => {
    setUserData(prev => ({
      ...prev,
      cardioSessions: [...prev.cardioSessions, { ...newCardio, id: Date.now() }]
    }));
    setNewCardio({ type: 'treadmill_walk', duration: 30, intensity: 'moderate' });
    setShowCardioModal(false);
  };
  
  const removeCardioSession = (id) => {
    setUserData(prev => ({
      ...prev,
      cardioSessions: prev.cardioSessions.filter(s => s.id !== id)
    }));
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800 rounded-2xl p-6 md:p-8 mb-6 border border-slate-700 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Activity className="text-blue-400" size={32} />
              <h1 className="text-2xl md:text-3xl font-bold text-white">Your Energy Map</h1>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all"
            >
              <Settings size={20} />
              <span className="hidden md:inline">Settings</span>
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">Age</p>
              <p className="text-white font-semibold text-lg">{userData.age} years</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">Weight</p>
              <p className="text-white font-semibold text-lg">{userData.weight} kg</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">Height</p>
              <p className="text-white font-semibold text-lg">{userData.height} cm</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">BMR</p>
              <p className="text-white font-semibold text-lg">{BMR} cal</p>
            </div>
          </div>
        </div>
        

        
        {/* Goal Selection Modal */}
        {showGoalModal && (
          <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-3 md:p-4 overflow-y-auto">
            <div className="bg-slate-800 rounded-2xl p-4 md:p-6 w-full md:max-w-2xl border border-slate-700 my-3 md:my-8 max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
              <h3 className="text-white font-bold text-xl md:text-2xl mb-4 md:mb-6">Select Your Goal</h3>
              
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(goals).map(([key, goal]) => {
                  const Icon = goal.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setTempSelectedGoal(key)}
                      className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${
                        tempSelectedGoal === key
                          ? `${goal.color} border-white text-white shadow-lg`
                          : 'bg-slate-700 border-slate-600 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <Icon size={32} className="flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold text-lg">{goal.label}</p>
                          <p className="text-sm opacity-90 mt-1">{goal.desc}</p>
                          {goal.warning && (
                            <p className="text-xs opacity-75 mt-2 line-clamp-2">
                              {goal.warning}
                            </p>
                          )}
                        </div>
                        {tempSelectedGoal === key && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full bg-white"></div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <div className="flex gap-2 md:gap-3 mt-4">
                <button
                  onClick={() => setShowGoalModal(false)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setSelectedGoal(tempSelectedGoal);
                    setShowGoalModal(false);
                  }}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  <span className="hidden sm:inline">Save &</span> Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-3 md:p-4 overflow-y-auto">
            <div className="bg-slate-800 rounded-2xl p-4 md:p-6 w-full md:max-w-2xl border border-slate-700 my-3 md:my-8 max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
              <h3 className="text-white font-bold text-xl md:text-2xl mb-4 md:mb-6">Personal Settings</h3>
              
              <div className="space-y-4 md:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="text-slate-300 text-sm block mb-2">Age</label>
                    <input
                      type="number"
                      value={userData.age}
                      onChange={(e) => handleUserDataChange('age', parseInt(e.target.value))}
                      className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="text-slate-300 text-sm block mb-2">Gender</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleUserDataChange('gender', 'male')}
                        className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold ${
                          userData.gender === 'male'
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 active:scale-95'
                        }`}
                      >
                        Male
                      </button>
                      <button
                        onClick={() => handleUserDataChange('gender', 'female')}
                        className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold ${
                          userData.gender === 'female'
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 active:scale-95'
                        }`}
                      >
                        Female
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-slate-300 text-sm block mb-2">Weight (kg)</label>
                    <input
                      type="number"
                      value={userData.weight}
                      onChange={(e) => handleUserDataChange('weight', parseFloat(e.target.value))}
                      className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="text-slate-300 text-sm block mb-2">Height (cm)</label>
                    <input
                      type="number"
                      value={userData.height}
                      onChange={(e) => handleUserDataChange('height', parseFloat(e.target.value))}
                      className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Training Type</label>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(trainingTypes).map(([key, type]) => (
                      <button
                        key={key}
                        onClick={() => handleUserDataChange('trainingType', key)}
                        className={`text-left p-3 md:p-4 rounded-lg border-2 transition-all active:scale-[0.98] ${
                          userData.trainingType === key
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300'
                        }`}
                      >
                        <div className="font-semibold text-base">{type.label}</div>
                        <div className="text-xs md:text-sm opacity-90 mt-0.5">
                          {type.caloriesPerHour} cal/hr • {type.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Training Duration (hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={userData.trainingDuration}
                    onChange={(e) => handleUserDataChange('trainingDuration', parseFloat(e.target.value))}
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
                  />
                  <p className="text-slate-400 text-xs mt-1">
                    Total burn: ~{Math.round(trainingCalories)} calories
                  </p>
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Step Count Ranges</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newStepRange}
                      onChange={(e) => setNewStepRange(e.target.value)}
                      placeholder="e.g., 15k or >25k"
                      className="flex-1 bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                    />
                    <button
                      onClick={addStepRange}
                      className="bg-blue-600 active:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
                    >
                      <Plus size={20} />
                      <span className="hidden sm:inline">Add</span>
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {userData.stepRanges.map((step) => (
                      <div key={step} className="bg-slate-700 text-white px-3 py-2 rounded-lg flex items-center gap-2">
                        <span className="text-sm">{step}</span>
                        <button
                          onClick={() => removeStepRange(step)}
                          className="text-red-400 active:text-red-300 transition-all p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 md:gap-3 mt-6">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  <span className="hidden sm:inline">Save &</span> Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Cardio Modal */}
        {showCardioModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700">
              <h3 className="text-white font-bold text-xl mb-4">Add Cardio Session</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Cardio Type</label>
                  <select
                    value={newCardio.type}
                    onChange={(e) => setNewCardio(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
                  >
                    {Object.entries(cardioTypes).map(([key, type]) => (
                      <option key={key} value={key}>{type.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Duration (minutes)</label>
                  <input
                    type="number"
                    value={newCardio.duration}
                    onChange={(e) => setNewCardio(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                    className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Intensity</label>
                  <select
                    value={newCardio.intensity}
                    onChange={(e) => setNewCardio(prev => ({ ...prev, intensity: e.target.value }))}
                    className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
                  >
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="vigorous">Vigorous</option>
                  </select>
                </div>
                
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-300 text-sm">Estimated Burn:</p>
                  <p className="text-white font-bold text-xl">
                    ~{Math.round(cardioTypes[newCardio.type].met[newCardio.intensity] * userData.weight * (newCardio.duration / 60))} calories
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCardioModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={addCardioSession}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-all"
                >
                  Add Session
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Goal Selector */}
        <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4">Your Goal</h2>
          <button
            onClick={() => {
              setTempSelectedGoal(selectedGoal);
              setShowGoalModal(true);
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all ${goals[selectedGoal].color} border-white text-white shadow-lg hover:scale-[1.02] active:scale-[0.98]`}
          >
            {(() => {
              const Icon = goals[selectedGoal].icon;
              return <Icon className="mx-auto mb-2" size={32} />;
            })()}
            <p className="font-bold text-xl">{goals[selectedGoal].label}</p>
            <p className="text-sm opacity-90 mt-1">{goals[selectedGoal].desc}</p>
            <p className="text-xs opacity-75 mt-2">Tap to change</p>
          </button>
          
          {goals[selectedGoal].warning && (
            <div className="mt-4 bg-yellow-900/30 border-2 border-yellow-600 rounded-xl p-4">
              <p className="text-yellow-300 text-sm font-medium">
                {goals[selectedGoal].warning}
              </p>
            </div>
          )}
        </div>
        
        {/* Day Type Selector */}
        <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4">Day Type</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setSelectedDay('training')}
              className={`p-4 rounded-xl border-2 transition-all ${
                selectedDay === 'training'
                  ? 'bg-purple-600 border-white text-white shadow-lg transform scale-105'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              <Dumbbell className="mx-auto mb-2" size={28} />
              <p className="font-bold text-lg">Training Day</p>
              <p className="text-sm opacity-90">
                {userData.trainingDuration}hrs {trainingTypes[userData.trainingType].label}
              </p>
              <p className="text-xs opacity-75 mt-1">~{Math.round(trainingCalories)} cal burn</p>
            </button>
            <button
              onClick={() => setSelectedDay('rest')}
              className={`p-4 rounded-xl border-2 transition-all ${
                selectedDay === 'rest'
                  ? 'bg-indigo-600 border-white text-white shadow-lg transform scale-105'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              <Activity className="mx-auto mb-2" size={28} />
              <p className="font-bold text-lg">Rest Day</p>
              <p className="text-sm opacity-90">No training</p>
            </button>
          </div>
        </div>
        
        {/* Cardio Sessions Manager */}
        <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 shadow-2xl">
          {userData.cardioSessions.length === 0 ? (
            <button
              onClick={() => setShowCardioModal(true)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 rounded-xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <Heart className="text-red-400" size={24} />
                <div className="text-left">
                  <h2 className="text-lg font-bold text-white">Add Cardio Session</h2>
                  <p className="text-slate-400 text-sm">Track your cardio activities</p>
                </div>
              </div>
              <Plus className="text-slate-400 group-hover:text-red-400 transition-colors" size={24} />
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Heart className="text-red-400" size={24} />
                  <h2 className="text-xl font-bold text-white">Cardio Sessions</h2>
                </div>
                <button
                  onClick={() => setShowCardioModal(true)}
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                >
                  <Plus size={20} />
                  Add
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {userData.cardioSessions.map((session) => (
                  <div key={session.id} className="bg-slate-700 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <p className="text-white font-semibold">{cardioTypes[session.type].label}</p>
                      <p className="text-slate-400 text-sm">
                        {session.duration} min • {session.intensity} • ~{calculateCardioCalories(session)} cal
                      </p>
                    </div>
                    <button
                      onClick={() => removeCardioSession(session.id)}
                      className="text-red-400 hover:text-red-300 transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                <p className="text-red-300 font-semibold">
                  Total Cardio Burn: {getTotalCardioBurn()} calories
                </p>
              </div>
            </>
          )}
        </div>
        
        {/* Calorie Map */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4">
            Your Calorie Targets: {goals[selectedGoal].label} - {selectedDay === 'training' ? 'Training' : 'Rest'} Day
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {userData.stepRanges.map((steps) => {
              const tdee = calculateTDEE(steps, selectedDay === 'training');
              const targetCalories = calculateGoalCalories(tdee, selectedGoal);
              const difference = targetCalories - tdee;
              
              return (
                <div key={steps} className="bg-slate-700 rounded-xl p-4 hover:bg-slate-600 transition-all">
                  <div className="text-center">
                    <p className="text-slate-400 text-sm mb-1">Steps</p>
                    <p className="text-white font-bold text-lg mb-3">{steps}</p>
                    <div className={`${goals[selectedGoal].color} rounded-lg p-3 mb-2`}>
                      <p className="text-white text-2xl font-bold">{targetCalories}</p>
                      <p className="text-white text-xs opacity-90">calories</p>
                    </div>
                    <p className="text-slate-400 text-xs">TDEE: {tdee}</p>
                    {difference !== 0 && (
                      <p className={`text-xs font-semibold mt-1 ${difference > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {difference > 0 ? '+' : ''}{difference} cal
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Macro Recommendations */}
        <div className="bg-slate-800 rounded-2xl p-6 mt-6 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4">Macro Recommendations</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
              <p className="text-red-400 font-bold mb-2">Protein</p>
              <p className="text-white text-2xl font-bold">{Math.round(userData.weight * 2.2)}g</p>
              <p className="text-slate-400 text-sm">2.2g per kg bodyweight</p>
            </div>
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
              <p className="text-yellow-400 font-bold mb-2">Fats</p>
              <p className="text-white text-2xl font-bold">{Math.round(userData.weight * 0.8)}-{Math.round(userData.weight * 1.0)}g</p>
              <p className="text-slate-400 text-sm">0.8-1.0g per kg bodyweight</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
              <p className="text-blue-400 font-bold mb-2">Carbs</p>
              <p className="text-white text-lg font-bold">Remaining calories</p>
              <p className="text-slate-400 text-sm">Adjust based on energy needs</p>
            </div>
          </div>
        </div>
        
        {/* Tips */}
        <div className="bg-slate-800 rounded-2xl p-6 mt-6 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4">Tips for Success</h2>
          <ul className="space-y-2 text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Track your steps daily to use the accurate calorie target</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>On training days, fuel your sessions properly with higher carbs pre-workout</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Cardio burns are calculated using MET values based on your weight</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Different training types burn calories at different rates - adjust accordingly</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Weigh yourself weekly and adjust if progress stalls for 2+ weeks</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>For lean bulk: aim for 0.25-0.5kg gain per week. For aggressive bulk: 0.5-1kg per week</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>For moderate cut: aim for 0.5kg loss per week. For aggressive cut: 0.75-1kg per week</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Your data is saved automatically in your browser</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default EnergyMapCalculator;
