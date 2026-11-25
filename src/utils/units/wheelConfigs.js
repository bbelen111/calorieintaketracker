// `DualWheel` configurations for the unit-aware pickers. Each describes how one
// picker value splits across two wheels.
import { INCHES_PER_FOOT, LB_PER_STONE, roundTo } from './unitFormatter.js';

const range = (from, to, step = 1) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, index) =>
    roundTo(from + index * step, 2)
  );

/** Whole number + one decimal (kg, lb, oz). */
export const buildTenthsWheel = ({ min, max, majorLabel = 'Whole' }) => ({
  min,
  max,
  majorValues: range(Math.floor(min), Math.floor(max)),
  minorValues: range(0, 9),
  split: (value) => {
    const tenths = Math.round(value * 10);
    return { major: Math.floor(tenths / 10), minor: tenths % 10 };
  },
  join: (whole, tenth) => (whole * 10 + tenth) / 10,
  formatMinor: (tenth) => `.${tenth}`,
  majorLabel,
  minorLabel: 'Decimal',
});

/** Stone + pounds in half steps; the value is total pounds. */
const buildStoneWheel = ({ min, max }) => ({
  min,
  max,
  majorValues: range(
    Math.floor(min / LB_PER_STONE),
    Math.floor(max / LB_PER_STONE)
  ),
  minorValues: range(0, LB_PER_STONE - 0.5, 0.5),
  split: (value) => {
    const stone = Math.floor(value / LB_PER_STONE);
    return { major: stone, minor: value - stone * LB_PER_STONE };
  },
  join: (stone, pounds) => stone * LB_PER_STONE + pounds,
  formatMajor: (stone) => `${stone} st`,
  formatMinor: (pounds) => `${pounds} lb`,
  majorLabel: 'Stone',
  minorLabel: 'Pounds',
  minorWide: true,
});

/** For `units.bodyWeight`: the value is `bodyWeight.toPicker(kg)`. */
export const buildBodyWeightWheel = (bodyWeight) =>
  bodyWeight.isStone
    ? buildStoneWheel(bodyWeight.pickerRange)
    : buildTenthsWheel(bodyWeight.pickerRange);

/** Feet + inches; the value is total inches. */
export const buildHeightWheel = ({ min, max }) => ({
  min,
  max,
  majorValues: range(
    Math.floor(min / INCHES_PER_FOOT),
    Math.floor(max / INCHES_PER_FOOT)
  ),
  minorValues: range(0, INCHES_PER_FOOT - 1),
  split: (value) => ({
    major: Math.floor(value / INCHES_PER_FOOT),
    minor: value % INCHES_PER_FOOT,
  }),
  join: (feet, inches) => feet * INCHES_PER_FOOT + inches,
  formatMajor: (feet) => `${feet} ft`,
  formatMinor: (inches) => `${inches} in`,
  majorLabel: 'Feet',
  minorLabel: 'Inches',
  minorWide: true,
});

/** Hundreds + units, for large whole numbers such as food energy in kJ. */
export const buildHundredsWheel = ({ max }) => ({
  min: 0,
  max,
  majorValues: range(0, Math.floor(max / 100)),
  minorValues: range(0, 99),
  split: (value) => {
    const whole = Math.round(value);
    return { major: Math.floor(whole / 100), minor: whole % 100 };
  },
  join: (hundreds, units) => hundreds * 100 + units,
  formatMinor: (units) => String(units).padStart(2, '0'),
  majorLabel: 'Hundreds',
  minorLabel: 'Units',
  minorWide: true,
});
