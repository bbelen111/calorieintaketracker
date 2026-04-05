import React from 'react';
import { formatOne } from '../../../utils/formatting/format';
import {
  FOOD_SOURCE_TYPES,
  getFoodCategoryMeta,
  getFoodSourceBadgeMeta,
  getFoodTagClassByColor,
} from '../../../utils/food/foodTags';

const DEFAULT_CONTAINER_CLASS = 'flex items-center gap-2 flex-wrap';

export const FoodTagBadges = ({
  food,
  showCategory = true,
  showSource = true,
  showPortion = true,
  portionText = null,
  className = '',
}) => {
  if (!food) {
    return null;
  }

  const {
    sourceType,
    label: sourceLabel,
    color: sourceColor,
  } = getFoodSourceBadgeMeta(food);
  const categoryMeta = getFoodCategoryMeta(food.category);

  const shouldShowCategory =
    showCategory &&
    Boolean(categoryMeta) &&
    sourceType !== FOOD_SOURCE_TYPES.CACHED &&
    sourceType !== FOOD_SOURCE_TYPES.MANUAL;

  const shouldShowSource = showSource && sourceType !== FOOD_SOURCE_TYPES.LOCAL;

  const resolvedPortionText =
    portionText ||
    (food?.portionInfo
      ? `${food.portionInfo.portionMultiplier} ${food.portionInfo.portionName}`
      : food?.portions?.length > 0
        ? `${food.portions.length} ${food.portions.length === 1 ? 'portion' : 'portions'}`
        : sourceType !== FOOD_SOURCE_TYPES.MANUAL && food?.grams
          ? `${formatOne(food.grams)}g`
          : null);

  return (
    <div className={`${DEFAULT_CONTAINER_CLASS} ${className}`.trim()}>
      {shouldShowCategory ? (
        <span
          className={`text-xs px-2 py-0.5 rounded ${getFoodTagClassByColor(
            categoryMeta.color
          )}`}
        >
          {categoryMeta.label}
        </span>
      ) : null}

      {shouldShowSource ? (
        <span
          className={`text-xs px-2 py-0.5 rounded ${getFoodTagClassByColor(
            sourceColor
          )}`}
        >
          {sourceLabel}
        </span>
      ) : null}

      {showPortion && resolvedPortionText ? (
        <span className="text-xs text-muted">{resolvedPortionText}</span>
      ) : null}
    </div>
  );
};
