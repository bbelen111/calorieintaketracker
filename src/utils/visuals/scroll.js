import { resolveScrollBehavior } from './motionPreference';

export const SCROLL_SETTLE_DELAY = 140;

// Per-container cache of the `[data-value]` item list. The wheels render a
// fixed value list, so re-querying per scroll event (~60/s during a flick,
// ~191 items for the weight wheel) allocated a fresh NodeList every frame
// for a list that only changes when the picker re-renders its rows. The
// child-count stamp invalidates the cache whenever the row set changes;
// POSITIONS are still read live (offsetTop/offsetHeight) so density/text
// scale changes are picked up immediately.
const scrollItemsCache = new WeakMap();

const getScrollItems = (container) => {
  const stamp = container.childElementCount;
  const cached = scrollItemsCache.get(container);

  if (cached && cached.stamp === stamp) {
    return cached.items;
  }

  const items = Array.from(container.querySelectorAll('[data-value]'));
  scrollItemsCache.set(container, { stamp, items });
  return items;
};

export const findClosestScrollItem = (container) => {
  if (!container) return null;

  const containerCenter = container.scrollTop + container.clientHeight / 2;
  let closestItem = null;
  let closestDistance = Infinity;

  getScrollItems(container).forEach((item) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const distance = Math.abs(containerCenter - itemCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestItem = item;
    }
  });

  return closestItem;
};

export const alignScrollContainerToElement = (
  container,
  element,
  behavior = 'smooth'
) => {
  if (!container || !element) return;

  const targetScrollTop =
    element.offsetTop - container.clientHeight / 2 + element.offsetHeight / 2;
  container.scrollTo({
    top: targetScrollTop,
    behavior: resolveScrollBehavior(behavior),
  });
};

export const alignScrollContainerToValue = (
  container,
  value,
  behavior = 'smooth'
) => {
  if (!container || value === undefined || value === null) return;

  const selector = `[data-value="${value}"]`;
  const target = container.querySelector(selector);
  if (target) {
    alignScrollContainerToElement(container, target, behavior);
  }
};

export const createPickerScrollHandler =
  (containerRef, timeoutRef, parseFn, setter) => (event) => {
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
