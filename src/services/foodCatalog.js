import initSqlJs from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import foodDatabaseSqliteUrl from '../constants/food/foodDatabase.sqlite?url';

const DEFAULT_LIMIT = 300;
const SORTABLE_COLUMNS = {
  name: 'name',
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbs',
  fats: 'fats',
};

let dbPromise = null;
let foodsTableColumnsPromise = null;

const escapeSqlLike = (value) => String(value ?? '').replace(/[\\%_]/g, '\\$&');

const parsePortions = (rawPortions) => {
  if (!rawPortions) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawPortions);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapFoodRow = (row) => ({
  id: String(row.id ?? ''),
  name: String(row.name ?? ''),
  brand: row.brand ? String(row.brand) : null,
  category: row.category ? String(row.category) : 'uncategorized',
  subcategory: row.subcategory ? String(row.subcategory) : null,
  per100g: {
    calories: Number(row.calories ?? 0),
    protein: Number(row.protein ?? 0),
    carbs: Number(row.carbs ?? 0),
    fats: Number(row.fats ?? 0),
  },
  portions: parsePortions(row.portions),
});

const runSelect = (db, sql, params = {}) => {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);

    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }

    return rows;
  } finally {
    statement.free();
  }
};

const getFoodsTableColumns = async () => {
  if (foodsTableColumnsPromise) {
    return foodsTableColumnsPromise;
  }

  foodsTableColumnsPromise = (async () => {
    const db = await getDatabase();
    const rows = runSelect(db, "PRAGMA table_info('foods')");

    return new Set(
      rows
        .map((row) => String(row.name ?? '').trim())
        .filter(Boolean)
        .map((columnName) => columnName.toLowerCase())
    );
  })().catch((error) => {
    foodsTableColumnsPromise = null;
    throw error;
  });

  return foodsTableColumnsPromise;
};

const getDatabase = async () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: () => sqliteWasmUrl,
    });

    const fetchFn = globalThis.fetch?.bind(globalThis);
    if (!fetchFn) {
      throw new Error('Fetch API unavailable for loading food database.');
    }

    const sqliteResponse = await fetchFn(foodDatabaseSqliteUrl);
    if (!sqliteResponse.ok) {
      throw new Error(
        `Failed to load food database (${sqliteResponse.status})`
      );
    }

    const databaseBuffer = await sqliteResponse.arrayBuffer();
    return new SQL.Database(new Uint8Array(databaseBuffer));
  })().catch((error) => {
    dbPromise = null;
    foodsTableColumnsPromise = null;
    throw error;
  });

  return dbPromise;
};

const getSortColumn = (sortBy) => SORTABLE_COLUMNS[sortBy] ?? 'name';

const getSortDirection = (sortOrder) =>
  String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

export const searchFoods = async ({
  query = '',
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
  preferBrandMatches = false,
  limit = DEFAULT_LIMIT,
  offset = 0,
} = {}) => {
  const db = await getDatabase();
  const foodsTableColumns = await getFoodsTableColumns();
  const hasBrandColumn = foodsTableColumns.has('brand');

  const normalizedQuery = String(query ?? '')
    .trim()
    .toLowerCase();
  const normalizedCategory = String(category ?? '').trim();
  const normalizedSubcategory = String(subcategory ?? '').trim();
  const escapedQuery = escapeSqlLike(normalizedQuery);

  const normalizedLimit = Math.max(
    1,
    Math.min(Number(limit) || DEFAULT_LIMIT, 1000)
  );
  const normalizedOffset = Math.max(0, Math.floor(Number(offset) || 0));

  const clauses = ['1 = 1'];
  const params = {
    ':limit': normalizedLimit,
    ':offset': normalizedOffset,
  };

  if (normalizedQuery) {
    const searchableColumns = [
      'LOWER(name) LIKE :query',
      'LOWER(category) LIKE :query',
      'LOWER(subcategory) LIKE :query',
    ];

    if (hasBrandColumn) {
      searchableColumns.splice(1, 0, "LOWER(COALESCE(brand, '')) LIKE :query");
    }

    clauses.push(`(${searchableColumns.join(' OR ')})`);
    params[':query'] = `%${escapedQuery}%`;
  }

  if (normalizedCategory) {
    clauses.push('category = :category');
    params[':category'] = normalizedCategory;
  }

  if (normalizedSubcategory) {
    clauses.push('subcategory = :subcategory');
    params[':subcategory'] = normalizedSubcategory;
  }

  const sortColumn = getSortColumn(sortBy);
  const sortDirection = getSortDirection(sortOrder);
  const useRelevanceSort = normalizedQuery.length > 0 && sortBy === 'name';

  if (useRelevanceSort) {
    params[':queryExact'] = normalizedQuery;
    params[':queryPrefix'] = `${escapedQuery}%`;
    params[':queryWholeWord'] = `% ${escapedQuery} %`;
    params[':queryContains'] = `%${escapedQuery}%`;
  }

  const brandRelevanceCase =
    preferBrandMatches && hasBrandColumn
      ? `
          WHEN LOWER(COALESCE(brand, '')) = :queryExact THEN 820
          WHEN LOWER(COALESCE(brand, '')) LIKE :queryPrefix ESCAPE '\\' THEN 610
          WHEN LOWER(COALESCE(brand, '')) LIKE :queryContains ESCAPE '\\' THEN 300`
      : '';

  const selectBrandColumn = hasBrandColumn ? 'brand' : 'NULL AS brand';

  const relevanceSelect = useRelevanceSort
    ? `,
      (
        CASE
          WHEN LOWER(name) = :queryExact THEN 1000
          WHEN LOWER(name) LIKE :queryPrefix ESCAPE '\\' THEN 700
          ${brandRelevanceCase}
          WHEN (' ' || LOWER(name) || ' ') LIKE :queryWholeWord ESCAPE '\\' THEN 450
          WHEN LOWER(name) LIKE :queryContains ESCAPE '\\' THEN 250
          WHEN LOWER(subcategory) = :queryExact THEN 60
          WHEN LOWER(category) = :queryExact THEN 40
          ELSE 0
        END
      ) AS relevanceScore`
    : '';

  let orderByClause = `${sortColumn} ${sortDirection}, name ASC`;

  if (useRelevanceSort) {
    // Note: relevanceScore is a computed CASE expression. This intentionally
    // favors search quality over pure index-only ordering for name queries.
    orderByClause = 'relevanceScore DESC, LENGTH(name) ASC, name ASC';
  }

  const rows = runSelect(
    db,
    `
      SELECT id, name, ${selectBrandColumn}, category, subcategory, calories, protein, carbs, fats, portions${relevanceSelect}
      FROM foods
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${orderByClause}
      LIMIT :limit
      OFFSET :offset
    `,
    params
  );

  return rows.map(mapFoodRow);
};

export const getFoodById = async (id) => {
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) {
    return null;
  }

  const db = await getDatabase();
  const foodsTableColumns = await getFoodsTableColumns();
  const selectBrandColumn = foodsTableColumns.has('brand')
    ? 'brand'
    : 'NULL AS brand';
  const rows = runSelect(
    db,
    `
      SELECT id, name, ${selectBrandColumn}, category, subcategory, calories, protein, carbs, fats, portions
      FROM foods
      WHERE id = :id
      LIMIT 1
    `,
    { ':id': normalizedId }
  );

  if (rows.length === 0) {
    return null;
  }

  return mapFoodRow(rows[0]);
};

export const getFoodsByIds = async (ids = []) => {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  ).slice(0, 250);

  if (normalizedIds.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const foodsTableColumns = await getFoodsTableColumns();
  const selectBrandColumn = foodsTableColumns.has('brand')
    ? 'brand'
    : 'NULL AS brand';
  const placeholders = normalizedIds.map((_, index) => `:id_${index}`);
  const params = normalizedIds.reduce((acc, id, index) => {
    acc[`:id_${index}`] = id;
    return acc;
  }, {});

  const rows = runSelect(
    db,
    `
      SELECT id, name, ${selectBrandColumn}, category, subcategory, calories, protein, carbs, fats, portions
      FROM foods
      WHERE id IN (${placeholders.join(', ')})
    `,
    params
  );

  const rowById = new Map(rows.map((row) => [String(row.id ?? ''), row]));

  return normalizedIds
    .map((id) => rowById.get(id))
    .filter(Boolean)
    .map(mapFoodRow);
};

export const getDistinctSubcategories = async (category) => {
  const normalizedCategory = String(category ?? '').trim();
  if (!normalizedCategory) {
    return [];
  }

  const db = await getDatabase();
  const rows = runSelect(
    db,
    `
      SELECT DISTINCT subcategory
      FROM foods
      WHERE category = :category
        AND subcategory IS NOT NULL
        AND subcategory != ''
      ORDER BY subcategory ASC
    `,
    { ':category': normalizedCategory }
  );

  return rows
    .map((row) => String(row.subcategory ?? '').trim())
    .filter(Boolean);
};
