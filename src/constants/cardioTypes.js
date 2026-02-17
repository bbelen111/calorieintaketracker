export const cardioTypes = {
  treadmill_walk: {
    label: 'Treadmill Walk',
    met: { light: 3.5, moderate: 4.0, vigorous: 4.5 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  treadmill_jog: {
    label: 'Treadmill Jog',
    met: { light: 6.0, moderate: 7.0, vigorous: 8.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  treadmill_run: {
    label: 'Treadmill Run',
    met: { light: 8.0, moderate: 9.5, vigorous: 11.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  bike_stationary: {
    label: 'Stationary Bike',
    met: { light: 5.5, moderate: 7.0, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  bike_outdoor: {
    label: 'Outdoor Cycling',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  elliptical: {
    label: 'Elliptical',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  rowing: {
    label: 'Rowing Machine',
    met: { light: 4.8, moderate: 7.0, vigorous: 9.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  swimming: {
    label: 'Swimming',
    met: { light: 5.0, moderate: 7.0, vigorous: 9.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  stairmaster: {
    label: 'Stairmaster',
    met: { light: 6.0, moderate: 8.0, vigorous: 9.0 },
    spm: { light: 65, moderate: 80, vigorous: 95 },
  },
  walking_outdoor: {
    label: 'Outdoor Walk',
    met: { light: 2.8, moderate: 3.5, vigorous: 4.3 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  walking_hilly: {
    label: 'Hilly Walk',
    met: { light: 3.5, moderate: 4.5, vigorous: 5.3 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  hiking_daypack: {
    label: 'Hiking (Daypack)',
    met: { light: 6.0, moderate: 7.3, vigorous: 8.5 },
    spm: { light: 75, moderate: 90, vigorous: 105 },
  },
  hiking_backpacking: {
    label: 'Backpacking',
    met: { light: 6.5, moderate: 8.0, vigorous: 9.5 },
    spm: { light: 75, moderate: 90, vigorous: 105 },
  },
  running_trail: {
    label: 'Trail Running',
    met: { light: 7.8, moderate: 9.3, vigorous: 11.5 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  running_interval: {
    label: 'Interval Running',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  spin_class: {
    label: 'Spin Class',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  bike_commute: {
    label: 'Commuter Cycling',
    met: { light: 4.5, moderate: 6.5, vigorous: 8.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  mountain_bike: {
    label: 'Mountain Biking',
    met: { light: 7.0, moderate: 9.5, vigorous: 11.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  jump_rope_basic: {
    label: 'Jump Rope (Basic)',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.3 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  jump_rope_fast: {
    label: 'Jump Rope (Fast)',
    met: { light: 10.5, moderate: 12.5, vigorous: 14.5 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  rowing_outdoor: {
    label: 'Outdoor Rowing',
    met: { light: 6.0, moderate: 7.8, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  kayaking: {
    label: 'Kayaking',
    met: { light: 3.5, moderate: 5.0, vigorous: 6.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  paddleboarding: {
    label: 'Stand-Up Paddleboarding',
    met: { light: 3.3, moderate: 4.5, vigorous: 6.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  swimming_laps: {
    label: 'Lap Swimming',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  aqua_aerobics: {
    label: 'Aqua Aerobics',
    met: { light: 3.0, moderate: 4.5, vigorous: 5.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  boxing_bag: {
    label: 'Heavy Bag Boxing',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  boxing_sparring: {
    label: 'Boxing Sparring',
    met: { light: 8.0, moderate: 9.5, vigorous: 12.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  kickboxing: {
    label: 'Kickboxing',
    met: { light: 7.5, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  martial_arts: {
    label: 'Martial Arts (Mixed)',
    met: { light: 7.0, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  dance_cardio: {
    label: 'Dance Cardio',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.0 },
    spm: { light: 50, moderate: 70, vigorous: 90 },
  },
  dance_high: {
    label: 'High-Impact Dance',
    met: { light: 6.5, moderate: 8.0, vigorous: 9.5 },
    spm: { light: 50, moderate: 70, vigorous: 90 },
  },
  zumba: {
    label: 'Zumba',
    met: { light: 4.5, moderate: 6.5, vigorous: 7.8 },
    spm: { light: 50, moderate: 70, vigorous: 90 },
  },
  hiit_bodyweight: {
    label: 'Bodyweight HIIT',
    met: { light: 7.5, moderate: 9.5, vigorous: 11.5 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
  hiit_cycling: {
    label: 'HIIT Cycling',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  battle_ropes: {
    label: 'Battle Ropes',
    met: { light: 7.0, moderate: 8.5, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  sled_push: {
    label: 'Sled Push',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  stair_sprints: {
    label: 'Stair Sprints',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.0 },
    spm: { light: 65, moderate: 80, vigorous: 95 },
  },
  versa_climber: {
    label: 'VersaClimber',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  rowing_sprint: {
    label: 'Rowing Sprint',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  ski_machine: {
    label: 'SkiErg',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  cross_country_ski: {
    label: 'Cross-Country Skiing',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  snowshoeing: {
    label: 'Snowshoeing',
    met: { light: 5.3, moderate: 7.0, vigorous: 9.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  speed_skating: {
    label: 'Speed Skating',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  inline_skating: {
    label: 'Inline Skating',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  rowing_crossfit: {
    label: 'CrossFit Rowing',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  cardio_step: {
    label: 'Step Aerobics',
    met: { light: 5.5, moderate: 7.0, vigorous: 8.5 },
    spm: { light: 65, moderate: 80, vigorous: 95 },
  },
  cardio_step_high: {
    label: 'Step Aerobics (High)',
    met: { light: 6.5, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 65, moderate: 80, vigorous: 95 },
  },
  rebounder: {
    label: 'Rebounder Jumping',
    met: { light: 4.0, moderate: 5.5, vigorous: 7.0 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  speed_rope_tricks: {
    label: 'Jump Rope (Tricks)',
    met: { light: 9.0, moderate: 11.0, vigorous: 13.0 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  agility_drills: {
    label: 'Agility Drills',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.0 },
    spm: { light: 50, moderate: 70, vigorous: 90 },
  },
  shuttle_runs: {
    label: 'Shuttle Runs',
    met: { light: 8.5, moderate: 10.5, vigorous: 12.5 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  soccer_drills: {
    label: 'Soccer Drills',
    met: { light: 6.5, moderate: 8.0, vigorous: 9.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  soccer_match: {
    label: 'Soccer Match',
    met: { light: 7.0, moderate: 10.0, vigorous: 12.0 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  futsal: {
    label: 'Futsal',
    met: { light: 6.0, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  basketball_game: {
    label: 'Basketball Game',
    met: { light: 5.5, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  basketball_drills: {
    label: 'Basketball Drills',
    met: { light: 5.0, moderate: 6.5, vigorous: 8.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  rugby_training: {
    label: 'Rugby Training',
    met: { light: 6.0, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  rugby_match: {
    label: 'Rugby Match',
    met: { light: 7.0, moderate: 9.5, vigorous: 12.0 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  american_football: {
    label: 'American Football',
    met: { light: 6.0, moderate: 8.0, vigorous: 9.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  field_hockey: {
    label: 'Field Hockey',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.0 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  lacrosse: {
    label: 'Lacrosse',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  ultimate_frisbee: {
    label: 'Ultimate Frisbee',
    met: { light: 6.0, moderate: 8.3, vigorous: 10.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  tennis_singles: {
    label: 'Tennis (Singles)',
    met: { light: 5.0, moderate: 7.3, vigorous: 10.0 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  tennis_doubles: {
    label: 'Tennis (Doubles)',
    met: { light: 4.5, moderate: 6.0, vigorous: 7.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  volleyball: {
    label: 'Volleyball',
    met: { light: 3.0, moderate: 4.5, vigorous: 6.0 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  handball: {
    label: 'Handball',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.5 },
    spm: { light: 60, moderate: 85, vigorous: 110 },
  },
  hill_sprints: {
    label: 'Hill Sprints',
    met: { light: 8.5, moderate: 10.5, vigorous: 13.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  stadium_stairs: {
    label: 'Stadium Stairs',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 65, moderate: 80, vigorous: 95 },
  },
  fartlek_running: {
    label: 'Fartlek Running',
    met: { light: 7.5, moderate: 9.5, vigorous: 11.5 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  bootcamp_circuit: {
    label: 'Bootcamp Circuit',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
  circuit_training: {
    label: 'Circuit Training',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
  kettlebell_swings: {
    label: 'Kettlebell Swings (High rep)',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  prowler_push: {
    label: 'Prowler Push',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  sled_pull: {
    label: 'Sled Pull',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  sled_sprint: {
    label: 'Sled Sprints',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  tabata_intervals: {
    label: 'Tabata Intervals',
    met: { light: 8.0, moderate: 10.0, vigorous: 13.0 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
  aqua_running: {
    label: 'Aqua Running',
    met: { light: 5.5, moderate: 7.0, vigorous: 9.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  trampoline_jumping: {
    label: 'Trampoline Fitness',
    met: { light: 4.5, moderate: 6.0, vigorous: 7.5 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  boxing_padwork: {
    label: 'Pad Work Boxing',
    met: { light: 6.5, moderate: 8.0, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  speed_walking: {
    label: 'Speed Walking',
    met: { light: 4.3, moderate: 5.0, vigorous: 6.0 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  treadmill_incline_walk: {
    label: 'Treadmill Incline Walk',
    met: { light: 4.5, moderate: 5.5, vigorous: 6.8 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  treadmill_hill_run: {
    label: 'Treadmill Hill Run',
    met: { light: 8.5, moderate: 10.0, vigorous: 12.5 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  tempo_run: {
    label: 'Tempo Run',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  long_run: {
    label: 'Long Slow Distance Run',
    met: { light: 6.5, moderate: 7.5, vigorous: 9.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  beach_running: {
    label: 'Beach Running',
    met: { light: 8.0, moderate: 9.5, vigorous: 12.0 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  sand_running: {
    label: 'Sand Running (Soft Surface)',
    met: { light: 7.5, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  nordic_walking: {
    label: 'Nordic Walking',
    met: { light: 4.8, moderate: 5.8, vigorous: 7.0 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  brisk_walking: {
    label: 'Brisk Walking',
    met: { light: 3.8, moderate: 4.5, vigorous: 5.3 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  power_walking: {
    label: 'Power Walking',
    met: { light: 4.8, moderate: 5.5, vigorous: 6.8 },
    spm: { light: 90, moderate: 105, vigorous: 115 },
  },
  peloton_ride: {
    label: 'Peloton / Indoor Cycling (Program)',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  group_run: {
    label: 'Group Run / Club Run',
    met: { light: 6.0, moderate: 7.5, vigorous: 9.5 },
    spm: { light: 140, moderate: 160, vigorous: 175 },
  },
  obstacle_course: {
    label: 'Obstacle Course / OCR',
    met: { light: 7.5, moderate: 9.5, vigorous: 12.0 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
  parkour: {
    label: 'Parkour / Free Running',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 50, moderate: 70, vigorous: 90 },
  },
  crossfit_wod: {
    label: 'CrossFit WOD / MetCon',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
  canoeing: {
    label: 'Canoeing',
    met: { light: 3.8, moderate: 5.3, vigorous: 7.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  kayak_sprint: {
    label: 'Kayak Sprint',
    met: { light: 6.5, moderate: 8.0, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  rowing_endurance: {
    label: 'Rowing - Endurance',
    met: { light: 5.0, moderate: 7.0, vigorous: 9.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  erg_intervals: {
    label: 'Erg Intervals (Rowing Machine)',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  spin_intervals: {
    label: 'Spin Intervals',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  hill_climb_cycling: {
    label: 'Hill Climb Cycling',
    met: { light: 6.5, moderate: 8.5, vigorous: 11.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  cycling_sprints: {
    label: 'Cycling Sprints',
    met: { light: 8.0, moderate: 10.0, vigorous: 12.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  shadow_boxing: {
    label: 'Shadow Boxing',
    met: { light: 4.5, moderate: 6.5, vigorous: 8.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  mma_training: {
    label: 'MMA Training (Cardio-focused)',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  plyometrics: {
    label: 'Plyometric Training',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  box_jumps: {
    label: 'Box Jumps / Plyo Jumps',
    met: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
    spm: { light: 10, moderate: 15, vigorous: 20 },
  },
  stair_climb_outdoor: {
    label: 'Outdoor Stair Climbing',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 65, moderate: 80, vigorous: 95 },
  },
  incline_hike: {
    label: 'Incline Hike',
    met: { light: 5.8, moderate: 7.5, vigorous: 9.0 },
    spm: { light: 75, moderate: 90, vigorous: 105 },
  },
  power_hike: {
    label: 'Power Hike',
    met: { light: 6.0, moderate: 7.8, vigorous: 9.8 },
    spm: { light: 75, moderate: 90, vigorous: 105 },
  },
  surf_paddling: {
    label: 'Surfing / Paddling',
    met: { light: 4.0, moderate: 5.8, vigorous: 7.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  ice_hockey: {
    label: 'Ice Hockey (Recreational)',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  roller_skiing: {
    label: 'Roller Skiing',
    met: { light: 6.5, moderate: 8.5, vigorous: 10.5 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  downhill_skiing_active: {
    label: 'Downhill Skiing (Active)',
    met: { light: 4.5, moderate: 6.0, vigorous: 8.0 },
    spm: { light: 0, moderate: 0, vigorous: 0 },
  },
  obstacle_run_intervals: {
    label: 'Obstacle Run Intervals',
    met: { light: 7.5, moderate: 9.5, vigorous: 12.0 },
    spm: { light: 40, moderate: 60, vigorous: 80 },
  },
};
