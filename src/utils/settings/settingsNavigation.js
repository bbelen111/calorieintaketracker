import { HERO_SLOTS } from '../../constants/appearance/heroAction.js';

export const SETTINGS_HOME_PAGE = 'home';
export const HOME_LAYOUT_PAGE = 'homeLayout';

const HOME_SLOT_SET = new Set(Object.values(HERO_SLOTS));
const HOME_SLOT_PREFIX = `${HOME_LAYOUT_PAGE}:`;

/** Build the Settings route id for picking a metric for one Home slot. */
export const makeHomeSlotPickerPage = (slot) =>
  HOME_SLOT_SET.has(slot)
    ? `${HOME_SLOT_PREFIX}${slot}`
    : `${HOME_SLOT_PREFIX}${HERO_SLOTS.PILL}`;

/** Extract the active Home slot from a Settings route id, or `null`. */
export const parseHomeSlotPickerPage = (page) => {
  if (typeof page !== 'string' || !page.startsWith(HOME_SLOT_PREFIX)) {
    return null;
  }
  const slot = page.slice(HOME_SLOT_PREFIX.length);
  return HOME_SLOT_SET.has(slot) ? slot : null;
};

/**
 * Parent Settings route for Back / Escape / Android hardware back.
 * Returns `null` from the hub so the caller closes SettingsModal.
 */
export const getSettingsParentPage = (page) => {
  if (parseHomeSlotPickerPage(page)) {
    return HOME_LAYOUT_PAGE;
  }
  if (page && page !== SETTINGS_HOME_PAGE) {
    return SETTINGS_HOME_PAGE;
  }
  return null;
};

/** Route depth for directional Settings transitions (0 = hub, 1 = category, 2 = subpage). */
export const getSettingsPageDepth = (page) => {
  if (!page || page === SETTINGS_HOME_PAGE) {
    return 0;
  }
  if (parseHomeSlotPickerPage(page)) {
    return 2;
  }
  return 1;
};
