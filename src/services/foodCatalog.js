import initSqlJs from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import foodDatabaseSqliteUrl from '../constants/foodDatabase.sqlite?url';

const DEFAULT_LIMIT = 300;
const SORTABLE_COLUMNS = {
  name: 'name',
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbs',
  fats: 'fats',
};

let dbPromise = null;

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
  category: String(row.category ?? 'supplements'),
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
  statement.bind(params);

  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }

  statement.free();
  return rows;
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
  })();

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
  limit = DEFAULT_LIMIT,
} = {}) => {
  const db = await getDatabase();

  const normalizedQuery = String(query ?? '')
    .trim()
    .toLowerCase();
  const normalizedCategory = String(category ?? '').trim();
  const normalizedSubcategory = String(subcategory ?? '').trim();

  const normalizedLimit = Math.max(
    1,
    Math.min(Number(limit) || DEFAULT_LIMIT, 1000)
  );

  const clauses = ['1 = 1'];
  const params = {
    ':limit': normalizedLimit,
  };

  if (normalizedQuery) {
    clauses.push(
      '(LOWER(name) LIKE :query OR LOWER(category) LIKE :query OR LOWER(subcategory) LIKE :query)'
    );
    params[':query'] = `%${normalizedQuery}%`;
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

  const rows = runSelect(
    db,
    `
      SELECT id, name, category, subcategory, calories, protein, carbs, fats, portions
      FROM foods
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDirection}, name ASC
      LIMIT :limit
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
  const rows = runSelect(
    db,
    `
      SELECT id, name, category, subcategory, calories, protein, carbs, fats, portions
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
