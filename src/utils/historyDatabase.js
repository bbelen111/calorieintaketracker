import Dexie from 'dexie';

const DB_NAME = 'energyMapHistory';
const HISTORY_TABLE = 'historyDocuments';
const METADATA_TABLE = 'metadata';
const MIGRATION_STATE_KEY = 'historyMigrationState';

let dbInstance = null;

const canUseIndexedDb =
  typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

const getDatabase = () => {
  if (!canUseIndexedDb) {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  const db = new Dexie(DB_NAME);
  db.version(1).stores({
    [HISTORY_TABLE]: '&id, updatedAt',
    [METADATA_TABLE]: '&key, updatedAt',
  });

  dbInstance = db;
  return db;
};

export const loadHistoryFromDexie = async (historyFieldKeys = []) => {
  const db = getDatabase();
  if (
    !db ||
    !Array.isArray(historyFieldKeys) ||
    historyFieldKeys.length === 0
  ) {
    return {
      available: Boolean(db),
      hasAnyHistory: false,
      historyData: {},
    };
  }

  try {
    const records = await db.table(HISTORY_TABLE).bulkGet(historyFieldKeys);
    const historyData = {};
    let hasAnyHistory = false;

    historyFieldKeys.forEach((fieldKey, index) => {
      const record = records[index];
      if (!record) {
        return;
      }

      historyData[fieldKey] = record.payload;
      hasAnyHistory = true;
    });

    return {
      available: true,
      hasAnyHistory,
      historyData,
    };
  } catch (error) {
    console.warn('Failed to load history from Dexie', error);
    return {
      available: true,
      hasAnyHistory: false,
      historyData: {},
    };
  }
};

export const loadAllHistoryDocuments = async () => {
  const db = getDatabase();
  if (!db) {
    return {
      available: false,
      hasAnyHistory: false,
      documents: [],
    };
  }

  try {
    const documents = await db.table(HISTORY_TABLE).toArray();
    return {
      available: true,
      hasAnyHistory: documents.length > 0,
      documents,
    };
  } catch (error) {
    console.warn('Failed to load all history documents from Dexie', error);
    return {
      available: true,
      hasAnyHistory: false,
      documents: [],
    };
  }
};

export const saveHistoryToDexie = async (historyData = {}) => {
  const db = getDatabase();
  if (!db) {
    return false;
  }

  const historyEntries = Object.entries(historyData);
  if (historyEntries.length === 0) {
    return true;
  }

  const updatedAt = Date.now();

  try {
    await db.transaction('rw', db.table(HISTORY_TABLE), async () => {
      await db.table(HISTORY_TABLE).bulkPut(
        historyEntries.map(([id, payload]) => ({
          id,
          payload,
          updatedAt,
        }))
      );
    });
    return true;
  } catch (error) {
    console.warn('Failed to save history to Dexie', error);
    return false;
  }
};

export const saveHistoryDocumentsToDexie = async (documents = []) => {
  const db = getDatabase();
  if (!db) {
    return false;
  }

  if (!Array.isArray(documents) || documents.length === 0) {
    return true;
  }

  const updatedAt = Date.now();

  try {
    await db.transaction('rw', db.table(HISTORY_TABLE), async () => {
      await db.table(HISTORY_TABLE).bulkPut(
        documents.map((document) => ({
          id: document.id,
          payload: document.payload,
          updatedAt,
        }))
      );
    });
    return true;
  } catch (error) {
    console.warn('Failed to save sharded history documents to Dexie', error);
    return false;
  }
};

export const deleteHistoryDocumentsFromDexie = async (documentIds = []) => {
  const db = getDatabase();
  if (!db) {
    return false;
  }

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return true;
  }

  try {
    await db.transaction('rw', db.table(HISTORY_TABLE), async () => {
      await db.table(HISTORY_TABLE).bulkDelete(documentIds);
    });
    return true;
  } catch (error) {
    console.warn('Failed to delete sharded history documents from Dexie', error);
    return false;
  }
};

export const getDexieHistoryMigrationState = async () => {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    const record = await db.table(METADATA_TABLE).get(MIGRATION_STATE_KEY);
    return record?.value ?? null;
  } catch (error) {
    console.warn('Failed to read Dexie migration state', error);
    return null;
  }
};

export const setDexieHistoryMigrationState = async (value) => {
  const db = getDatabase();
  if (!db) {
    return false;
  }

  try {
    await db.table(METADATA_TABLE).put({
      key: MIGRATION_STATE_KEY,
      value,
      updatedAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn('Failed to persist Dexie migration state', error);
    return false;
  }
};
