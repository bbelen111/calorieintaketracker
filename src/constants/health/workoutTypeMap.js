/**
 * Health-store workout types (`@capgo/capacitor-health` `WorkoutType`) mapped
 * onto the app's cardio type keys (constants/cardio/cardioTypes.js; verified
 * by tests/utils/sessionHeartRate.test.js). Imported sessions are priced from
 * HEART RATE, so the type mainly drives the label, step-overlap and the EPOC
 * label multiplier.
 *
 * Deliberately unmapped (the user picks): types with no honest equivalent —
 * notably plain outdoor `running`, which would otherwise be mislabelled as a
 * treadmill or trail run.
 */
export const WORKOUT_TYPE_TO_CARDIO_TYPE = Object.freeze({
  walking: 'walking_outdoor',
  runningTreadmill: 'treadmill_run',
  hiking: 'hiking_daypack',
  cycling: 'bike_outdoor',
  bikingStationary: 'bike_stationary',
  elliptical: 'elliptical',
  rowing: 'rowing_outdoor',
  rowingMachine: 'rowing',
  swimming: 'swimming_laps',
  swimmingPool: 'swimming_laps',
  swimmingOpenWater: 'swimming',
  stairClimbing: 'stairmaster',
  stairClimbingMachine: 'stairmaster',
  stairs: 'stairmaster',
  jumpRope: 'jump_rope_basic',
  paddleSports: 'kayaking',
  paddling: 'kayaking',
  boxing: 'boxing_bag',
  kickboxing: 'kickboxing',
  martialArts: 'martial_arts',
  dance: 'dance_cardio',
  dancing: 'dance_cardio',
  cardioDance: 'dance_cardio',
  socialDance: 'dance_cardio',
  highIntensityIntervalTraining: 'hiit_bodyweight',
  crossCountrySkiing: 'cross_country_ski',
  snowshoeing: 'snowshoeing',
  skating: 'inline_skating',
  soccer: 'soccer_match',
  basketball: 'basketball_game',
  rugby: 'rugby_match',
  americanFootball: 'american_football',
  lacrosse: 'lacrosse',
  discSports: 'ultimate_frisbee',
  tennis: 'tennis_singles',
  volleyball: 'volleyball',
  handball: 'handball',
  bootCamp: 'bootcamp_circuit',
  mixedCardio: 'circuit_training',
  crossTraining: 'circuit_training',
  waterFitness: 'aqua_aerobics',
});

/** Workout types that are resistance training (better logged as Training). */
export const STRENGTH_WORKOUT_TYPES = Object.freeze(
  new Set([
    'strengthTraining',
    'traditionalStrengthTraining',
    'functionalStrengthTraining',
    'weightlifting',
    'calisthenics',
    'coreTraining',
    'backExtension',
    'barbellShoulderPress',
    'benchPress',
    'benchSitUp',
    'crunch',
    'deadlift',
    'dumbbellCurlLeftArm',
    'dumbbellCurlRightArm',
    'dumbbellFrontRaise',
    'dumbbellLateralRaise',
    'dumbbellTricepsExtensionLeftArm',
    'dumbbellTricepsExtensionRightArm',
    'dumbbellTricepsExtensionTwoArm',
    'latPullDown',
    'lunge',
    'plank',
    'upperTwist',
    'forwardTwist',
  ])
);

/** "highIntensityIntervalTraining" -> "High intensity interval training". */
export const formatWorkoutTypeLabel = (workoutType) => {
  const spaced = String(workoutType ?? 'other')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
