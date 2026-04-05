export const SCROLL_SETTLE_DELAY = 140;

export const findClosestScrollItem = (container) => {
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

export const alignScrollContainerToElement = (
  container,
  element,
  behavior = 'smooth'
) => {
  if (!container || !element) return;

  const targetScrollTop =
    element.offsetTop - container.clientHeight / 2 + element.offsetHeight / 2;
  container.scrollTo({ top: targetScrollTop, behavior });
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
