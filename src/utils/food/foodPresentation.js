export const formatFoodDisplayName = ({ name, brand }) => {
  const safeName = String(name ?? '').trim();
  const safeBrand = String(brand ?? '').trim();

  if (!safeName) {
    return safeBrand;
  }

  if (!safeBrand) {
    return safeName;
  }

  const normalizedName = safeName.toLowerCase();
  const normalizedBrand = safeBrand.toLowerCase();

  if (
    normalizedName.startsWith(`${normalizedBrand} - `) ||
    normalizedName.startsWith(`${normalizedBrand}-`) ||
    normalizedName.startsWith(`${normalizedBrand} `)
  ) {
    return safeName;
  }

  return `${safeBrand} - ${safeName}`;
};
