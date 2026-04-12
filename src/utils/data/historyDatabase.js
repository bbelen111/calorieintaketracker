import Dexie from 'dexie';

const DB_NAME = 'energyMapHistory';
const HISTORY_TABLE = 'historyDocuments';

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
  });

  dbInstance = db;
  return db;
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
    console.warn(
      'Failed to delete sharded history documents from Dexie',
      error
    );
    return false;
  }
};
