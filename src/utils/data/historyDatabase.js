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

/**
 * Loads only the named history documents instead of the whole table.
 *
 * Telemetry hydration (and any other reader that needs a couple of specific
 * documents) must use this instead of `loadAllHistoryDocuments()`: the full
 * `toArray()` read deserializes every nutrition day, snapshot and session in
 * the database, which used to sit on the RAG critical path whenever telemetry
 * recorded its first event of a session.
 */
export const loadHistoryDocumentsByIds = async (documentIds = []) => {
  const db = getDatabase();
  const safeIds = (Array.isArray(documentIds) ? documentIds : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);

  if (!db) {
    return {
      available: false,
      hasAnyHistory: false,
      documents: [],
    };
  }

  if (safeIds.length === 0) {
    return {
      available: true,
      hasAnyHistory: false,
      documents: [],
    };
  }

  try {
    const documents = await db
      .table(HISTORY_TABLE)
      .where('id')
      .anyOf(safeIds)
      .toArray();
    return {
      available: true,
      hasAnyHistory: documents.length > 0,
      documents,
    };
  } catch (error) {
    console.warn('Failed to load history documents by id from Dexie', error);
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
