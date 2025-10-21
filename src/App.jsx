import React, { useState, useEffect, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Settings, Plus, Trash2, Save, Dumbbell, Bike, Heart, Edit3, Info } from 'lucide-react';

const SCROLL_SETTLE_DELAY = 140;

const findClosestScrollItem = (container) => {
  if (!container) return null;

  const containerCenter = container.scrollTop + container.clientHeight / 2;
  let closestItem = null;
  let closestDistance = Infinity;

  container.querySelectorAll('[data-value]').forEach((item) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const distance = Math.abs(containerCenter - itemCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestItem = item;
    }
  });

  return closestItem;
};

const alignScrollContainerToElement = (container, element, behavior = 'smooth') => {
  if (!container || !element) return;

  const targetScrollTop = element.offsetTop - container.clientHeight / 2 + element.offsetHeight / 2;
  container.scrollTo({ top: targetScrollTop, behavior });
};

const alignScrollContainerToValue = (container, value, behavior = 'smooth') => {
  if (!container || value === undefined || value === null) return;

  const selector = `[data-value="${value}"]`;
  const target = container.querySelector(selector);
  if (target) {
    alignScrollContainerToElement(container, target, behavior);
  }
};

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
      trainingType: 'bodybuilding',
      trainingDuration: 2,
      stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
      cardioSessions: [],
      customTrainingName: 'My Training',
      customTrainingCalories: 220,
      customTrainingDescription: 'Custom training style'
    };
  };

  const [userData, setUserData] = useState(loadData());
  const [selectedGoal, setSelectedGoal] = useState('maintenance');
  const [tempSelectedGoal, setTempSelectedGoal] = useState('maintenance');
  const [selectedDay, setSelectedDay] = useState('training');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [closingSettingsModal, setClosingSettingsModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [closingGoalModal, setClosingGoalModal] = useState(false);
  const [showTrainingTypeModal, setShowTrainingTypeModal] = useState(false);
  const [closingTrainingTypeModal, setClosingTrainingTypeModal] = useState(false);
  const [tempTrainingType, setTempTrainingType] = useState('bodybuilding');
  const [showCustomTrainingModal, setShowCustomTrainingModal] = useState(false);
  const [closingCustomTrainingModal, setClosingCustomTrainingModal] = useState(false);
  const [tempCustomName, setTempCustomName] = useState('My Training');
  const [tempCustomCalories, setTempCustomCalories] = useState(220);
  const [tempCustomDescription, setTempCustomDescription] = useState('Custom training style');
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [closingAgeModal, setClosingAgeModal] = useState(false);
  const [tempAge, setTempAge] = useState(21);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [closingWeightModal, setClosingWeightModal] = useState(false);
  const [tempWeight, setTempWeight] = useState(74);
  const [newStepRange, setNewStepRange] = useState('');
  const [showStepRangesModal, setShowStepRangesModal] = useState(false);
  const [closingStepRangesModal, setClosingStepRangesModal] = useState(false);
  const [showQuickTrainingModal, setShowQuickTrainingModal] = useState(false);
  const [closingQuickTrainingModal, setClosingQuickTrainingModal] = useState(false);
  const [trainingDayClickCount, setTrainingDayClickCount] = useState(0);
  const [tempTrainingDuration, setTempTrainingDuration] = useState(1.5);
  const [showBmrInfoModal, setShowBmrInfoModal] = useState(false);
  const [closingBmrInfoModal, setClosingBmrInfoModal] = useState(false);
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [closingCardioModal, setClosingCardioModal] = useState(false);
  const [newCardio, setNewCardio] = useState({
    type: 'treadmill_walk',
    duration: 30,
    intensity: 'moderate'
  });

  const ageScrollRef = useRef(null);
  const weightScrollRef = useRef(null);
  const durationScrollRef = useRef(null);
  const ageScrollTimeout = useRef(null);
  const weightScrollTimeout = useRef(null);
  const durationScrollTimeout = useRef(null);
  
  // Save to localStorage whenever userData changes
  useEffect(() => {
    localStorage.setItem('energyMapData', JSON.stringify(userData));
  }, [userData]);

  useEffect(() => {
    return () => {
      clearTimeout(ageScrollTimeout.current);
      clearTimeout(weightScrollTimeout.current);
      clearTimeout(durationScrollTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!showAgeModal || !ageScrollRef.current) return;

    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(ageScrollRef.current, userData.age, 'instant');
    });

    return () => cancelAnimationFrame(frame);
  }, [showAgeModal, userData.age]);

  useEffect(() => {
    if (!showWeightModal || !weightScrollRef.current) return;

    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(weightScrollRef.current, userData.weight, 'instant');
    });

    return () => cancelAnimationFrame(frame);
  }, [showWeightModal, userData.weight]);

  useEffect(() => {
    if (!showQuickTrainingModal || !durationScrollRef.current) return;

    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(durationScrollRef.current, userData.trainingDuration, 'instant');
    });

    return () => cancelAnimationFrame(frame);
  }, [showQuickTrainingModal, userData.trainingDuration]);

  const handlePickerScroll = (event, containerRef, timeoutRef, parseFn, setter) => {
    const container = event.currentTarget;
    const closestItem = findClosestScrollItem(container);

    if (closestItem) {
      const parsedValue = parseFn(closestItem.dataset.value);
      if (!Number.isNaN(parsedValue)) {
        setter(parsedValue);
      }
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const containerEl = containerRef.current || container;
      if (!containerEl) return;

      const target = findClosestScrollItem(containerEl);
      if (target) {
        alignScrollContainerToElement(containerEl, target, 'smooth');
      }
    }, SCROLL_SETTLE_DELAY);
  };
  
  // Helper function to close modals with animation
  const closeModal = (setClosing, setShow) => {
    setClosing(true);
    setTimeout(() => {
      setShow(false);
      setClosing(false);
    }, 200); // Match animation duration
  };
  
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
    },
    custom: { 
      label: 'Custom', 
      caloriesPerHour: 220,
      description: 'Set your own training style'
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
  const getTrainingCaloriesPerHour = () => {
    if (userData.trainingType === 'custom') {
      return userData.customTrainingCalories;
    }
    return trainingTypes[userData.trainingType].caloriesPerHour;
  };
  const trainingCalories = userData.trainingDuration * getTrainingCaloriesPerHour();
  
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
    closeModal(setClosingCardioModal, setShowCardioModal);
  };
  
  const removeCardioSession = (id) => {
    setUserData(prev => ({
      ...prev,
      cardioSessions: prev.cardioSessions.filter(s => s.id !== id)
    }));
  };
  
  const handleTrainingDayClick = () => {
    if (selectedDay === 'training') {
      // Already on training day - open modal immediately
      setTempTrainingType(userData.trainingType);
      setTempTrainingDuration(userData.trainingDuration);
      setShowQuickTrainingModal(true);
    } else {
      // Switching to training day from rest
      setSelectedDay('training');
    }
  };
  
  // Reset click count when switching away from training day
  const handleRestDayClick = () => {
    setSelectedDay('rest');
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
            <button
              onClick={() => {
                setTempAge(userData.age);
                setShowAgeModal(true);
              }}
              className="bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <p className="text-slate-400">Age</p>
                <Edit3 size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-white font-semibold text-lg">{userData.age} years</p>
            </button>
            <button
              onClick={() => {
                setTempWeight(userData.weight);
                setShowWeightModal(true);
              }}
              className="bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <p className="text-slate-400">Weight</p>
                <Edit3 size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-white font-semibold text-lg">{userData.weight} kg</p>
            </button>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">Height</p>
              <p className="text-white font-semibold text-lg">{userData.height} cm</p>
            </div>
            <button 
              onClick={() => setShowBmrInfoModal(true)}
              className="bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <p className="text-slate-400">BMR</p>
                <Info size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-white font-semibold text-lg">{BMR} cal</p>
            </button>
          </div>
        </div>
        

        
        {/* Goal Selection Modal */}
        {showGoalModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3 md:p-4 ${closingGoalModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-4 md:p-6 w-full md:max-w-2xl border border-slate-700 max-h-[90vh] overflow-y-auto ${closingGoalModal ? 'closing' : ''}`}>
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
                  onClick={() => closeModal(setClosingGoalModal, setShowGoalModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setSelectedGoal(tempSelectedGoal);
                    closeModal(setClosingGoalModal, setShowGoalModal);
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
        
        {/* BMR Info Modal */}
        {showBmrInfoModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 ${closingBmrInfoModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 max-w-lg w-full border border-slate-700 ${closingBmrInfoModal ? 'closing' : ''}`}>
              <div className="flex items-center gap-3 mb-4">
                <Info size={28} className="text-blue-400" />
                <h3 className="text-white font-bold text-xl">What is BMR?</h3>
              </div>
              
              <div className="space-y-4 text-slate-300">
                <p>
                  <span className="font-bold text-white">BMR (Basal Metabolic Rate)</span> is the number of calories your body burns at complete rest to maintain basic life functions like breathing, circulation, and cell production.
                </p>
                
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <p className="font-bold text-white mb-2">How We Calculate Your BMR:</p>
                  <p className="text-sm">
                    We use the <span className="text-blue-400 font-semibold">Mifflin-St Jeor Equation</span>, one of the most accurate formulas:
                  </p>
                  <div className="mt-3 p-3 bg-slate-900/50 rounded font-mono text-xs md:text-sm overflow-x-auto">
                    {userData.gender === 'male' ? (
                      <div>
                        <p className="text-green-400">For Men:</p>
                        <p className="mt-1">BMR = (10 × weight) + (6.25 × height) - (5 × age) + 5</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-pink-400">For Women:</p>
                        <p className="mt-1">BMR = (10 × weight) + (6.25 × height) - (5 × age) - 161</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                  <p className="font-bold text-blue-300 mb-2">Your Current Calculation:</p>
                  <div className="text-sm space-y-1">
                    <p>Weight: <span className="text-white font-semibold">{userData.weight} kg</span></p>
                    <p>Height: <span className="text-white font-semibold">{userData.height} cm</span></p>
                    <p>Age: <span className="text-white font-semibold">{userData.age} years</span></p>
                    <p>Gender: <span className="text-white font-semibold capitalize">{userData.gender}</span></p>
                    <div className="border-t border-blue-700/50 mt-2 pt-2">
                      <p className="text-lg">Your BMR: <span className="text-white font-bold">{BMR} calories/day</span></p>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm italic text-slate-400">
                  Note: Your actual daily calorie needs (TDEE) are higher because they include activity, training, and movement throughout the day.
                </p>
              </div>
              
              <div className="mt-6">
                <button
                  onClick={() => closeModal(setClosingBmrInfoModal, setShowBmrInfoModal)}
                  className="w-full bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Age Picker Modal */}
        {showAgeModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 ${closingAgeModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700 ${closingAgeModal ? 'closing' : ''}`}>
              <h3 className="text-white font-bold text-xl mb-4 text-center">Select Age</h3>
              
              <div className="relative h-48 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none z-10">
                  <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent"></div>
                  <div className="h-16 bg-transparent"></div>
                  <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent"></div>
                </div>
                
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10"></div>
                
                <div
                  ref={ageScrollRef}
                  className="h-full overflow-y-auto scrollbar-hide"
                  onScroll={(e) =>
                    handlePickerScroll(
                      e,
                      ageScrollRef,
                      ageScrollTimeout,
                      (value) => parseInt(value, 10),
                      setTempAge
                    )
                  }
                >
                  <div className="h-16"></div>
                  {Array.from({ length: 83 }, (_, i) => i + 15).map((age) => (
                    <div
                      key={age}
                      data-value={age}
                      onClick={() => {
                        setTempAge(age);
                        if (ageScrollRef.current) {
                          clearTimeout(ageScrollTimeout.current);
                          alignScrollContainerToValue(ageScrollRef.current, age, 'smooth');
                        }
                      }}
                      className={`py-3 px-6 text-2xl font-semibold transition-all snap-center cursor-pointer text-center ${
                        tempAge === age
                          ? 'text-white scale-110'
                          : 'text-slate-500'
                      }`}
                    >
                      {age}
                    </div>
                  ))}
                  <div className="h-16"></div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => closeModal(setClosingAgeModal, setShowAgeModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUserDataChange('age', tempAge);
                    closeModal(setClosingAgeModal, setShowAgeModal);
                  }}
                  className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Weight Picker Modal */}
        {showWeightModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 ${closingWeightModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700 ${closingWeightModal ? 'closing' : ''}`}>
              <h3 className="text-white font-bold text-xl mb-4 text-center">Select Weight (kg)</h3>
              
              <div className="relative h-48 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none z-10">
                  <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent"></div>
                  <div className="h-16 bg-transparent"></div>
                  <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent"></div>
                </div>
                
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10"></div>
                
                <div
                  ref={weightScrollRef}
                  className="h-full overflow-y-auto scrollbar-hide"
                  onScroll={(e) =>
                    handlePickerScroll(
                      e,
                      weightScrollRef,
                      weightScrollTimeout,
                      (value) => parseInt(value, 10),
                      setTempWeight
                    )
                  }
                >
                  <div className="h-16"></div>
                  {Array.from({ length: 181 }, (_, i) => i + 30).map((weight) => (
                    <div
                      key={weight}
                      data-value={weight}
                      onClick={() => {
                        setTempWeight(weight);
                        if (weightScrollRef.current) {
                          clearTimeout(weightScrollTimeout.current);
                          alignScrollContainerToValue(weightScrollRef.current, weight, 'smooth');
                        }
                      }}
                      className={`py-3 px-6 text-2xl font-semibold transition-all snap-center cursor-pointer text-center ${
                        tempWeight === weight
                          ? 'text-white scale-110'
                          : 'text-slate-500'
                      }`}
                    >
                      {weight}
                    </div>
                  ))}
                  <div className="h-16"></div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => closeModal(setClosingWeightModal, setShowWeightModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUserDataChange('weight', tempWeight);
                    closeModal(setClosingWeightModal, setShowWeightModal);
                  }}
                  className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Training Type Selection Modal (Nested) */}
        {showTrainingTypeModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-3 md:p-4 ${closingTrainingTypeModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-4 md:p-6 w-full md:max-w-2xl border border-slate-700 max-h-[90vh] overflow-y-auto ${closingTrainingTypeModal ? 'closing' : ''}`}>
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-white font-bold text-xl md:text-2xl">Select Training Type</h3>
                <Edit3 size={20} className="text-slate-500 opacity-75" />
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(trainingTypes).map(([key, type]) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'custom' && tempTrainingType === 'custom') {
                        // Already selected, open edit modal
                        setTempCustomName(userData.customTrainingName);
                        setTempCustomCalories(userData.customTrainingCalories);
                        setTempCustomDescription(userData.customTrainingDescription);
                        setShowCustomTrainingModal(true);
                      } else {
                        // Select this training type
                        setTempTrainingType(key);
                      }
                    }}
                    className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left relative ${
                      tempTrainingType === key
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                        : 'bg-slate-700 border-slate-600 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Dumbbell size={32} className="flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-bold text-lg">{key === 'custom' ? userData.customTrainingName : type.label}</p>
                        <p className="text-sm opacity-90 mt-1">
                          {key === 'custom' ? userData.customTrainingCalories : type.caloriesPerHour} cal/hr • {key === 'custom' ? userData.customTrainingDescription : type.description}
                        </p>
                      </div>
                      {key === 'custom' && tempTrainingType === 'custom' && (
                        <Edit3 size={18} className="flex-shrink-0 opacity-75" />
                      )}
                      {tempTrainingType === key && key !== 'custom' && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-white"></div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2 md:gap-3 mt-4">
                <button
                  onClick={() => closeModal(setClosingTrainingTypeModal, setShowTrainingTypeModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUserDataChange('trainingType', tempTrainingType);
                    closeModal(setClosingTrainingTypeModal, setShowTrainingTypeModal);
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
        
        {/* Custom Training Modal */}
        {showCustomTrainingModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/90 flex items-center justify-center z-[70] p-4 ${closingCustomTrainingModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 ${closingCustomTrainingModal ? 'closing' : ''}`}>
              <h3 className="text-white font-bold text-xl mb-4 text-center">Custom Training Type</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Training Name</label>
                  <input
                    type="text"
                    value={tempCustomName}
                    onChange={(e) => setTempCustomName(e.target.value)}
                    placeholder="My Training"
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                  />
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Description</label>
                  <input
                    type="text"
                    value={tempCustomDescription}
                    onChange={(e) => setTempCustomDescription(e.target.value)}
                    placeholder="Custom training style"
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                  />
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Calories Per Hour</label>
                  <input
                    type="number"
                    value={tempCustomCalories}
                    onChange={(e) => setTempCustomCalories(parseInt(e.target.value) || 0)}
                    placeholder="220"
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                  />
                  <p className="text-slate-400 text-xs mt-1">
                    Typical range: 180-300 cal/hr
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => closeModal(setClosingCustomTrainingModal, setShowCustomTrainingModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUserDataChange('customTrainingName', tempCustomName);
                    handleUserDataChange('customTrainingCalories', tempCustomCalories);
                    handleUserDataChange('customTrainingDescription', tempCustomDescription);
                    setTempTrainingType('custom');
                    closeModal(setClosingCustomTrainingModal, setShowCustomTrainingModal);
                  }}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Settings Modal */}
        {showSettingsModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3 md:p-4 ${closingSettingsModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-4 md:p-6 w-full md:max-w-2xl border border-slate-700 max-h-[90vh] overflow-y-auto ${closingSettingsModal ? 'closing' : ''}`}>
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
                  <button
                    onClick={() => {
                      setTempTrainingType(userData.trainingType);
                      setShowTrainingTypeModal(true);
                    }}
                    className="w-full text-left p-3 md:p-4 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all active:scale-[0.98]"
                  >
                    <div className="font-semibold text-base">{trainingTypes[userData.trainingType].label}</div>
                    <div className="text-xs md:text-sm opacity-90 mt-0.5">
                      {trainingTypes[userData.trainingType].caloriesPerHour} cal/hr • {trainingTypes[userData.trainingType].description}
                    </div>
                    <div className="text-xs opacity-75 mt-2">Tap to change</div>
                  </button>
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
                  <button
                    onClick={() => setShowStepRangesModal(true)}
                    className="w-full bg-slate-700 active:bg-slate-600 text-white px-4 py-3 rounded-lg border border-slate-600 transition-all active:scale-95 text-left flex items-center justify-between"
                  >
                    <span>{userData.stepRanges.length} range{userData.stepRanges.length !== 1 ? 's' : ''} configured</span>
                    <Edit3 size={16} className="opacity-75" />
                  </button>
                </div>
              </div>
              
              <div className="flex gap-2 md:gap-3 mt-6">
                <button
                  onClick={() => closeModal(setClosingSettingsModal, setShowSettingsModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => closeModal(setClosingSettingsModal, setShowSettingsModal)}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  <span className="hidden sm:inline">Save &</span> Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Step Ranges Modal */}
        {showStepRangesModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 ${closingStepRangesModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700 max-h-[90vh] overflow-y-auto ${closingStepRangesModal ? 'closing' : ''}`}>
              <h3 className="text-white font-bold text-xl mb-4">Edit Step Count Ranges</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Add New Range</label>
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
                </div>
                
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Current Ranges</label>
                  {userData.stepRanges.length === 0 ? (
                    <p className="text-slate-400 text-sm italic">No step ranges configured yet</p>
                  ) : (
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
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 md:gap-3 mt-6">
                <button
                  onClick={() => closeModal(setClosingStepRangesModal, setShowStepRangesModal)}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Quick Training Settings Modal */}
        {showQuickTrainingModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 ${closingQuickTrainingModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 ${closingQuickTrainingModal ? 'closing' : ''}`}>
              <h3 className="text-white font-bold text-xl mb-4 text-center">Training Settings</h3>
              
              <div className="space-y-6">
                {/* Training Type Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-300 text-sm">Training Type</label>
                    <Edit3 size={14} className="text-slate-500 opacity-75" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(trainingTypes).map(([key, type]) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === 'custom' && tempTrainingType === 'custom') {
                            // Already selected, open edit modal
                            setTempCustomName(userData.customTrainingName);
                            setTempCustomCalories(userData.customTrainingCalories);
                            setTempCustomDescription(userData.customTrainingDescription);
                            setShowCustomTrainingModal(true);
                          } else {
                            // Select this training type
                            setTempTrainingType(key);
                          }
                        }}
                        className={`p-3 rounded-lg border-2 transition-all text-sm relative ${
                          tempTrainingType === key
                            ? 'bg-purple-600 border-purple-400 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600'
                        }`}
                      >
                        {key === 'custom' && tempTrainingType === 'custom' && <Edit3 size={12} className="absolute top-2 right-2 opacity-75" />}
                        <div className="font-bold">{key === 'custom' ? userData.customTrainingName : type.label}</div>
                        <div className="text-xs opacity-75">{key === 'custom' ? userData.customTrainingCalories : type.caloriesPerHour} cal/hr</div>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Training Duration Scroll Picker */}
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Training Duration (hours)</label>
                  <div className="relative h-48 overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none z-10">
                      <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent"></div>
                      <div className="h-16 bg-transparent"></div>
                      <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent"></div>
                    </div>
                    
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10"></div>
                    
                    <div
                      ref={durationScrollRef}
                      className="h-full overflow-y-auto scrollbar-hide"
                      onScroll={(e) =>
                        handlePickerScroll(
                          e,
                          durationScrollRef,
                          durationScrollTimeout,
                          (value) => parseFloat(value),
                          setTempTrainingDuration
                        )
                      }
                    >
                      <div className="h-16"></div>
                      {Array.from({ length: 61 }, (_, i) => i * 0.5).slice(1).map((duration) => (
                        <div
                          key={duration}
                          data-value={duration}
                          className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center ${
                            Math.abs(tempTrainingDuration - duration) < 0.01
                              ? 'text-white scale-110'
                              : 'text-slate-500'
                          }`}
                        >
                          {duration.toFixed(1)}
                        </div>
                      ))}
                      <div className="h-16"></div>
                    </div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 mt-3">
                    <p className="text-slate-400 text-xs text-center mb-1">Estimated Burn:</p>
                    <p className="text-white font-bold text-xl text-center">
                      ~{Math.round((tempTrainingType === 'custom' ? userData.customTrainingCalories : trainingTypes[tempTrainingType].caloriesPerHour) * tempTrainingDuration)} calories
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => closeModal(setClosingQuickTrainingModal, setShowQuickTrainingModal)}
                  className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUserDataChange('trainingType', tempTrainingType);
                    handleUserDataChange('trainingDuration', tempTrainingDuration);
                    closeModal(setClosingQuickTrainingModal, setShowQuickTrainingModal);
                  }}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
                >
                  <Save size={20} />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Cardio Modal */}
        {showCardioModal && (
          <div className={`modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 ${closingCardioModal ? 'closing' : ''}`}>
            <div className={`modal-content bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700 ${closingCardioModal ? 'closing' : ''}`}>
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
                  onClick={() => closeModal(setClosingCardioModal, setShowCardioModal)}
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
            className={`w-full p-4 rounded-xl border-2 transition-all relative ${goals[selectedGoal].color} border-white text-white shadow-lg hover:scale-[1.02] active:scale-[0.98]`}
          >
            <Edit3 size={16} className="absolute top-3 right-3 opacity-75" />
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
              onClick={handleTrainingDayClick}
              className={`p-4 rounded-xl border-2 transition-all relative ${
                selectedDay === 'training'
                  ? 'bg-purple-600 border-white text-white shadow-lg transform scale-105'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              <Edit3 size={14} className="absolute top-2 right-2 opacity-75" />
              <Dumbbell className="mx-auto mb-2" size={28} />
              <p className="font-bold text-lg">Training Day</p>
              <p className="text-sm opacity-90">
                {userData.trainingDuration}hrs {trainingTypes[userData.trainingType].label}
              </p>
              <p className="text-xs opacity-75 mt-1">~{Math.round(trainingCalories)} cal burn</p>
            </button>
            <button
              onClick={handleRestDayClick}
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
