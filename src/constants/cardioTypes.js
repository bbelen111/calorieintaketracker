// Base catalog of cardio activities and MET ranges by effort.
const baseCardioTypes = {
  treadmill_walk: {
    label: 'Treadmill Walk',
    met: { light: 3.5, moderate: 4.0, vigorous: 4.5 },
  },
  treadmill_jog: {
    label: 'Treadmill Jog',
    met: { light: 6.0, moderate: 7.0, vigorous: 8.0 },
  },
  treadmill_run: {
    label: 'Treadmill Run',
    met: { light: 8.0, moderate: 9.5, vigorous: 11.0 },
  },
  bike_stationary: {
    label: 'Stationary Bike',
    met: { light: 5.5, moderate: 7.0, vigorous: 10.0 },
  },
  bike_outdoor: {
    label: 'Outdoor Cycling',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
  },
  elliptical: {
    label: 'Elliptical',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.0 },
  },
  rowing: {
    label: 'Rowing Machine',
    met: { light: 4.8, moderate: 7.0, vigorous: 9.5 },
  },
  swimming: {
    label: 'Swimming',
    met: { light: 5.0, moderate: 7.0, vigorous: 9.0 },
  },
  stairmaster: {
    label: 'Stairmaster',
    met: { light: 6.0, moderate: 8.0, vigorous: 9.0 },
  },
  walking_outdoor: {
    label: 'Outdoor Walk',
    met: { light: 2.8, moderate: 3.5, vigorous: 4.3 },
  },
  walking_hilly: {
    label: 'Hilly Walk',
    met: { light: 3.5, moderate: 4.5, vigorous: 5.3 },
  },
  hiking_daypack: {
    label: 'Hiking (Daypack)',
    met: { light: 6.0, moderate: 7.3, vigorous: 8.5 },
  },
  hiking_backpacking: {
    label: 'Backpacking',
    met: { light: 6.5, moderate: 8.0, vigorous: 9.5 },
  },
  running_trail: {
    label: 'Trail Running',
    met: { light: 7.8, moderate: 9.3, vigorous: 11.5 },
  },
  running_interval: {
    label: 'Interval Running',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.0 },
  },
  spin_class: {
    label: 'Spin Class',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  bike_commute: {
    label: 'Commuter Cycling',
    met: { light: 4.5, moderate: 6.5, vigorous: 8.0 },
  },
  mountain_bike: {
    label: 'Mountain Biking',
    met: { light: 7.0, moderate: 9.5, vigorous: 11.0 },
  },
  jump_rope_basic: {
    label: 'Jump Rope (Basic)',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.3 },
  },
  jump_rope_fast: {
    label: 'Jump Rope (Fast)',
    met: { light: 10.5, moderate: 12.5, vigorous: 14.5 },
  },
  rowing_outdoor: {
    label: 'Outdoor Rowing',
    met: { light: 6.0, moderate: 7.8, vigorous: 10.0 },
  },
  kayaking: {
    label: 'Kayaking',
    met: { light: 3.5, moderate: 5.0, vigorous: 6.5 },
  },
  paddleboarding: {
    label: 'Stand-Up Paddleboarding',
    met: { light: 3.3, moderate: 4.5, vigorous: 6.0 },
  },
  swimming_laps: {
    label: 'Lap Swimming',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
  },
  aqua_aerobics: {
    label: 'Aqua Aerobics',
    met: { light: 3.0, moderate: 4.5, vigorous: 5.5 },
  },
  boxing_bag: {
    label: 'Heavy Bag Boxing',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.0 },
  },
  boxing_sparring: {
    label: 'Boxing Sparring',
    met: { light: 8.0, moderate: 9.5, vigorous: 12.0 },
  },
  kickboxing: {
    label: 'Kickboxing',
    met: { light: 7.5, moderate: 9.0, vigorous: 11.5 },
  },
  martial_arts: {
    label: 'Martial Arts (Mixed)',
    met: { light: 7.0, moderate: 8.5, vigorous: 10.5 },
  },
  dance_cardio: {
    label: 'Dance Cardio',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.0 },
  },
  dance_high: {
    label: 'High-Impact Dance',
    met: { light: 6.5, moderate: 8.0, vigorous: 9.5 },
  },
  zumba: {
    label: 'Zumba',
    met: { light: 4.5, moderate: 6.5, vigorous: 7.8 },
  },
  hiit_bodyweight: {
    label: 'Bodyweight HIIT',
    met: { light: 7.5, moderate: 9.5, vigorous: 11.5 },
  },
  hiit_cycling: {
    label: 'HIIT Cycling',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  },
  battle_ropes: {
    label: 'Battle Ropes',
    met: { light: 7.0, moderate: 8.5, vigorous: 10.0 },
  },
  sled_push: {
    label: 'Sled Push',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  stair_sprints: {
    label: 'Stair Sprints',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.0 },
  },
  versa_climber: {
    label: 'VersaClimber',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  rowing_sprint: {
    label: 'Rowing Sprint',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  },
  ski_machine: {
    label: 'SkiErg',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
  },
  cross_country_ski: {
    label: 'Cross-Country Skiing',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  },
  snowshoeing: {
    label: 'Snowshoeing',
    met: { light: 5.3, moderate: 7.0, vigorous: 9.0 },
  },
  speed_skating: {
    label: 'Speed Skating',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.5 },
  },
  inline_skating: {
    label: 'Inline Skating',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.5 },
  },
  rowing_crossfit: {
    label: 'CrossFit Rowing',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.0 },
  },
  cardio_step: {
    label: 'Step Aerobics',
    met: { light: 5.5, moderate: 7.0, vigorous: 8.5 },
  },
  cardio_step_high: {
    label: 'Step Aerobics (High)',
    met: { light: 6.5, moderate: 8.0, vigorous: 10.0 },
  },
  rebounder: {
    label: 'Rebounder Jumping',
    met: { light: 4.0, moderate: 5.5, vigorous: 7.0 },
  },
  speed_rope_tricks: {
    label: 'Jump Rope (Tricks)',
    met: { light: 9.0, moderate: 11.0, vigorous: 13.0 },
  },
  agility_drills: {
    label: 'Agility Drills',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.0 },
  },
  shuttle_runs: {
    label: 'Shuttle Runs',
    met: { light: 8.5, moderate: 10.5, vigorous: 12.5 },
  },
  soccer_drills: {
    label: 'Soccer Drills',
    met: { light: 6.5, moderate: 8.0, vigorous: 9.5 },
  },
  soccer_match: {
    label: 'Soccer Match',
    met: { light: 7.0, moderate: 10.0, vigorous: 12.0 },
  },
  futsal: {
    label: 'Futsal',
    met: { light: 6.0, moderate: 8.5, vigorous: 10.5 },
  },
  basketball_game: {
    label: 'Basketball Game',
    met: { light: 5.5, moderate: 8.0, vigorous: 10.0 },
  },
  basketball_drills: {
    label: 'Basketball Drills',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.5 },
  },
  rugby_training: {
    label: 'Rugby Training',
    met: { light: 6.0, moderate: 8.5, vigorous: 10.5 },
  },
  rugby_match: {
    label: 'Rugby Match',
    met: { light: 7.0, moderate: 9.5, vigorous: 12.0 },
  },
  american_football: {
    label: 'American Football',
    met: { light: 6.0, moderate: 8.0, vigorous: 9.5 },
  },
  field_hockey: {
    label: 'Field Hockey',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.0 },
  },
  lacrosse: {
    label: 'Lacrosse',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  ultimate_frisbee: {
    label: 'Ultimate Frisbee',
    met: { light: 6.0, moderate: 8.3, vigorous: 10.5 },
  },
  tennis_singles: {
    label: 'Tennis (Singles)',
    met: { light: 5.0, moderate: 7.3, vigorous: 10.0 },
  },
  tennis_doubles: {
    label: 'Tennis (Doubles)',
    met: { light: 4.5, moderate: 6.0, vigorous: 7.5 },
  },
  volleyball: {
    label: 'Volleyball',
    met: { light: 3.0, moderate: 4.5, vigorous: 6.0 },
  },
  handball: {
    label: 'Handball',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.5 },
  },
  hill_sprints: {
    label: 'Hill Sprints',
    met: { light: 8.5, moderate: 10.5, vigorous: 13.0 },
  },
  stadium_stairs: {
    label: 'Stadium Stairs',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  fartlek_running: {
    label: 'Fartlek Running',
    met: { light: 7.5, moderate: 9.5, vigorous: 11.5 },
  },
  bootcamp_circuit: {
    label: 'Bootcamp Circuit',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  circuit_training: {
    label: 'Circuit Training',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
  },
  kettlebell_swings: {
    label: 'Kettlebell Swings (High rep)',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  prowler_push: {
    label: 'Prowler Push',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  sled_pull: {
    label: 'Sled Pull',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
  },
  sled_sprint: {
    label: 'Sled Sprints',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  tabata_intervals: {
    label: 'Tabata Intervals',
    met: { light: 8.0, moderate: 10.0, vigorous: 13.0 },
  },
  aqua_running: {
    label: 'Aqua Running',
    met: { light: 5.5, moderate: 7.0, vigorous: 9.0 },
  },
  trampoline_jumping: {
    label: 'Trampoline Fitness',
    met: { light: 4.5, moderate: 6.0, vigorous: 7.5 },
  },
  boxing_padwork: {
    label: 'Pad Work Boxing',
    met: { light: 6.5, moderate: 8.0, vigorous: 10.5 },
  },
  speed_walking: {
    label: 'Speed Walking',
    met: { light: 4.3, moderate: 5.0, vigorous: 6.0 },
  },
  treadmill_incline_walk: {
    label: 'Treadmill Incline Walk',
    met: { light: 4.5, moderate: 5.5, vigorous: 6.8 },
  },
  desk_treadmill_walk: {
    label: 'Desk Treadmill Walk',
    met: { light: 2.0, moderate: 2.8, vigorous: 3.5 },
  },
  race_walking: {
    label: 'Race Walking',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.0 },
  },
  treadmill_hill_run: {
    label: 'Treadmill Hill Run',
    met: { light: 8.5, moderate: 10.0, vigorous: 12.5 },
  },
  jog_outdoor_easy: {
    label: 'Outdoor Jog (Easy)',
    met: { light: 5.8, moderate: 7.0, vigorous: 8.3 },
  },
  road_run: {
    label: 'Road Running',
    met: { light: 7.0, moderate: 8.8, vigorous: 10.8 },
  },
  track_run_intervals: {
    label: 'Track Intervals',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.5 },
  },
  tempo_run: {
    label: 'Tempo Run',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  },
  long_run: {
    label: 'Long Slow Distance Run',
    met: { light: 6.5, moderate: 7.5, vigorous: 9.0 },
  },
  beach_running: {
    label: 'Beach Running',
    met: { light: 8.0, moderate: 9.5, vigorous: 12.0 },
  },
  sand_running: {
    label: 'Sand Running (Soft Surface)',
    met: { light: 7.5, moderate: 9.0, vigorous: 11.5 },
  },
  nordic_walking: {
    label: 'Nordic Walking',
    met: { light: 4.8, moderate: 5.8, vigorous: 7.0 },
  },
  brisk_walking: {
    label: 'Brisk Walking',
    met: { light: 3.8, moderate: 4.5, vigorous: 5.3 },
  },
  power_walking: {
    label: 'Power Walking',
    met: { light: 4.8, moderate: 5.5, vigorous: 6.8 },
  },
  peloton_ride: {
    label: 'Peloton / Indoor Cycling (Program)',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.5 },
  },
  group_run: {
    label: 'Group Run / Club Run',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.5 },
  },
  obstacle_course: {
    label: 'Obstacle Course / OCR',
    met: { light: 7.5, moderate: 9.5, vigorous: 12.0 },
  },
  parkour: {
    label: 'Parkour / Free Running',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  crossfit_wod: {
    label: 'CrossFit WOD / MetCon',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  canoeing: {
    label: 'Canoeing',
    met: { light: 3.8, moderate: 5.3, vigorous: 7.0 },
  },
  kayak_sprint: {
    label: 'Kayak Sprint',
    met: { light: 6.5, moderate: 8.0, vigorous: 10.5 },
  },
  rowing_endurance: {
    label: 'Rowing - Endurance',
    met: { light: 5.0, moderate: 7.0, vigorous: 9.0 },
  },
  erg_intervals: {
    label: 'Erg Intervals (Rowing Machine)',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  spin_intervals: {
    label: 'Spin Intervals',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  hill_climb_cycling: {
    label: 'Hill Climb Cycling',
    met: { light: 6.5, moderate: 8.5, vigorous: 11.0 },
  },
  cycling_sprints: {
    label: 'Cycling Sprints',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.5 },
  },
  shadow_boxing: {
    label: 'Shadow Boxing',
    met: { light: 4.5, moderate: 6.5, vigorous: 8.5 },
  },
  mma_training: {
    label: 'MMA Training (Cardio-focused)',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
  },
  plyometrics: {
    label: 'Plyometric Training',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  box_jumps: {
    label: 'Box Jumps / Plyo Jumps',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  },
  stair_climb_outdoor: {
    label: 'Outdoor Stair Climbing',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  incline_hike: {
    label: 'Incline Hike',
    met: { light: 5.8, moderate: 7.5, vigorous: 9.0 },
  },
  power_hike: {
    label: 'Power Hike',
    met: { light: 6.0, moderate: 7.8, vigorous: 9.8 },
  },
  ruck_march: {
    label: 'Ruck March (Weighted Walk)',
    met: { light: 5.5, moderate: 7.0, vigorous: 8.5 },
  },
  trail_power_hike: {
    label: 'Trail Power Hike',
    met: { light: 6.0, moderate: 7.8, vigorous: 9.5 },
  },
  surf_paddling: {
    label: 'Surfing / Paddling',
    met: { light: 4.0, moderate: 5.8, vigorous: 7.5 },
  },
  ice_hockey: {
    label: 'Ice Hockey (Recreational)',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  roller_skiing: {
    label: 'Roller Skiing',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
  },
  downhill_skiing_active: {
    label: 'Downhill Skiing (Active)',
    met: { light: 4.5, moderate: 6.0, vigorous: 8.0 },
  },
  obstacle_run_intervals: {
    label: 'Obstacle Run Intervals',
    met: { light: 7.5, moderate: 9.5, vigorous: 12.0 },
  },
};

// Explicitly ambulatory activities used for step/cardio overlap deductions.
const AMBULATORY_STEP_PROFILE_OVERRIDES = {
  treadmill_walk: { ambulatory: true, cadence: 118 },
  walking_outdoor: { ambulatory: true, cadence: 112 },
  walking_hilly: { ambulatory: true, cadence: 122 },
  hiking_daypack: { ambulatory: true, cadence: 124 },
  hiking_backpacking: { ambulatory: true, cadence: 120 },
  running_trail: { ambulatory: true, cadence: 164 },
  running_interval: { ambulatory: true, cadence: 174 },
  stair_sprints: { ambulatory: true, cadence: 168 },
  cardio_step: { ambulatory: true, cadence: 132 },
  cardio_step_high: { ambulatory: true, cadence: 142 },
  hill_sprints: { ambulatory: true, cadence: 176 },
  stadium_stairs: { ambulatory: true, cadence: 152 },
  fartlek_running: { ambulatory: true, cadence: 168 },
  speed_walking: { ambulatory: true, cadence: 136 },
  treadmill_incline_walk: { ambulatory: true, cadence: 132 },
  treadmill_hill_run: { ambulatory: true, cadence: 172 },
  tempo_run: { ambulatory: true, cadence: 168 },
  long_run: { ambulatory: true, cadence: 158 },
  beach_running: { ambulatory: true, cadence: 170 },
  sand_running: { ambulatory: true, cadence: 166 },
  nordic_walking: { ambulatory: true, cadence: 130 },
  brisk_walking: { ambulatory: true, cadence: 126 },
  power_walking: { ambulatory: true, cadence: 138 },
  group_run: { ambulatory: true, cadence: 162 },
  obstacle_run_intervals: { ambulatory: true, cadence: 172 },
  incline_hike: { ambulatory: true, cadence: 126 },
  power_hike: { ambulatory: true, cadence: 132 },
  stair_climb_outdoor: { ambulatory: true, cadence: 148 },
  treadmill_jog: { ambulatory: true, cadence: 152 },
  treadmill_run: { ambulatory: true, cadence: 166 },
  desk_treadmill_walk: { ambulatory: true, cadence: 108 },
  race_walking: { ambulatory: true, cadence: 150 },
  jog_outdoor_easy: { ambulatory: true, cadence: 154 },
  road_run: { ambulatory: true, cadence: 164 },
  track_run_intervals: { ambulatory: true, cadence: 176 },
  ruck_march: { ambulatory: true, cadence: 122 },
  trail_power_hike: { ambulatory: true, cadence: 130 },
  shuttle_runs: { ambulatory: true, cadence: 176 },
  agility_drills: { ambulatory: true, cadence: 154 },
  soccer_drills: { ambulatory: true, cadence: 162 },
  soccer_match: { ambulatory: true, cadence: 166 },
  futsal: { ambulatory: true, cadence: 168 },
  basketball_drills: { ambulatory: true, cadence: 156 },
  basketball_game: { ambulatory: true, cadence: 160 },
  rugby_training: { ambulatory: true, cadence: 154 },
  rugby_match: { ambulatory: true, cadence: 162 },
  american_football: { ambulatory: true, cadence: 148 },
  field_hockey: { ambulatory: true, cadence: 160 },
  lacrosse: { ambulatory: true, cadence: 164 },
  ultimate_frisbee: { ambulatory: true, cadence: 158 },
  tennis_singles: { ambulatory: true, cadence: 146 },
  tennis_doubles: { ambulatory: true, cadence: 136 },
  handball: { ambulatory: true, cadence: 156 },
  obstacle_course: { ambulatory: true, cadence: 162 },
  parkour: { ambulatory: true, cadence: 160 },
  bootcamp_circuit: { ambulatory: true, cadence: 148 },
  cross_country_ski: { ambulatory: true, cadence: 138 },
  snowshoeing: { ambulatory: true, cadence: 134 },
  speed_skating: { ambulatory: true, cadence: 160 },
  inline_skating: { ambulatory: true, cadence: 144 },
};

const MIN_CADENCE = 0;
const MAX_CADENCE = 220;

const clampCadence = (value) =>
  Math.min(Math.max(Math.round(value), MIN_CADENCE), MAX_CADENCE);

const deriveCadenceFromModerateMet = (moderateMet) => {
  const safeMet = Number(moderateMet);
  if (!Number.isFinite(safeMet) || safeMet <= 0) {
    return 0;
  }

  // Specialize cadence per type from moderate MET while staying in realistic bounds.
  return clampCadence(80 + safeMet * 9);
};

const resolveStepProfileForType = (typeKey, cardioType) => {
  const override = AMBULATORY_STEP_PROFILE_OVERRIDES[typeKey] ?? null;
  const ambulatory = Boolean(override?.ambulatory);

  if (!ambulatory) {
    return { ambulatory: false, cadence: 0 };
  }

  const cadence =
    override?.cadence ??
    deriveCadenceFromModerateMet(cardioType?.met?.moderate);

  return {
    ambulatory: true,
    cadence: clampCadence(cadence),
  };
};

// Derived table for quick lookup of overlap metadata by cardio type.
export const cardioStepProfiles = Object.fromEntries(
  Object.entries(baseCardioTypes).map(([typeKey, cardioType]) => [
    typeKey,
    resolveStepProfileForType(typeKey, cardioType),
  ])
);

// Public cardio map merged with overlap metadata used throughout the app.
export const cardioTypes = Object.fromEntries(
  Object.entries(baseCardioTypes).map(([typeKey, cardioType]) => {
    const stepProfile = cardioStepProfiles[typeKey] ?? {
      ambulatory: false,
      cadence: 0,
    };

    return [
      typeKey,
      {
        ...cardioType,
        ambulatory: stepProfile.ambulatory,
        cadence: stepProfile.cadence,
      },
    ];
  })
);
