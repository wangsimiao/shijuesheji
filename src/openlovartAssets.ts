import { OpenLovartProject } from './types';

const OPENLOVART_ASSET_DB = 'ecommerce_ai_openlovart_assets_db';
const OPENLOVART_ASSET_STORE = 'assets';
const ASSET_REF_PREFIX = 'asset://';

type OpenLovartAssetRecord = {
  id: string;
  data: string;
  updatedAt: number;
};

const canUseIndexedDb =
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const generateAssetId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function isAssetRef(value: string) {
  return value.startsWith(ASSET_REF_PREFIX);
}

function toAssetRef(assetId: string) {
  return `${ASSET_REF_PREFIX}${assetId}`;
}

function toAssetId(ref: string) {
  return ref.slice(ASSET_REF_PREFIX.length);
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  });
}

function openAssetsDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(OPENLOVART_ASSET_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPENLOVART_ASSET_STORE)) {
        db.createObjectStore(OPENLOVART_ASSET_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

async function fetchUrlAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image source: ${response.status}`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function saveAssetData(data: string) {
  const db = await openAssetsDb();
  try {
    const assetId = generateAssetId();
    const transaction = db.transaction(OPENLOVART_ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(OPENLOVART_ASSET_STORE);
    const record: OpenLovartAssetRecord = {
      id: assetId,
      data,
      updatedAt: Date.now(),
    };
    store.put(record);
    await transactionDone(transaction);
    return toAssetRef(assetId);
  } finally {
    db.close();
  }
}

async function readAssetData(ref: string) {
  const db = await openAssetsDb();
  try {
    const transaction = db.transaction(OPENLOVART_ASSET_STORE, 'readonly');
    const store = transaction.objectStore(OPENLOVART_ASSET_STORE);
    const result = await requestToPromise<OpenLovartAssetRecord | undefined>(
      store.get(toAssetId(ref))
    );
    return result?.data || null;
  } finally {
    db.close();
  }
}

async function removeAssetData(ref: string) {
  const db = await openAssetsDb();
  try {
    const transaction = db.transaction(OPENLOVART_ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(OPENLOVART_ASSET_STORE);
    store.delete(toAssetId(ref));
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

async function normalizeSourceForPersist(source?: string) {
  if (!source) return undefined;
  if (!canUseIndexedDb) return source;

  const value = source.trim();
  if (!value) return undefined;
  if (isAssetRef(value)) return value;

  if (value.startsWith('data:')) {
    return saveAssetData(value);
  }

  if (value.startsWith('blob:') || value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const dataUrl = await fetchUrlAsDataUrl(value);
      return saveAssetData(dataUrl);
    } catch {
      return value;
    }
  }

  return value;
}

async function restoreSource(source?: string) {
  if (!source) return undefined;
  const value = source.trim();
  if (!value) return undefined;
  if (!isAssetRef(value)) return value;
  if (!canUseIndexedDb) return value;

  try {
    const data = await readAssetData(value);
    return data || value;
  } catch {
    return value;
  }
}

export function isOpenLovartAssetRef(value: string) {
  return isAssetRef(value);
}

export async function persistOpenLovartAssetSource(source?: string) {
  return normalizeSourceForPersist(source);
}

export async function hydrateOpenLovartAssetSource(source?: string) {
  return restoreSource(source);
}

function collectProjectAssetRefs(project: OpenLovartProject) {
  const refs = new Set<string>();

  for (const element of project.elements) {
    if (element.type === 'image' && element.content && isAssetRef(element.content)) {
      refs.add(element.content);
    }
  }

  for (const session of project.sessions) {
    for (const message of session.messages) {
      if (message.imageUrl && isAssetRef(message.imageUrl)) {
        refs.add(message.imageUrl);
      }
      for (const item of message.attachedImages || []) {
        if (isAssetRef(item)) {
          refs.add(item);
        }
      }
    }
  }

  return Array.from(refs);
}

export async function serializeOpenLovartProjectsForStorage(projects: OpenLovartProject[]) {
  const serialized = await Promise.all(
    projects.map(async (project) => {
      const elements = await Promise.all(
        project.elements.map(async (element) => {
          if (element.type !== 'image') return element;
          const content = await normalizeSourceForPersist(element.content);
          return {
            ...element,
            content,
          };
        })
      );

      const sessions = await Promise.all(
        project.sessions.map(async (session) => {
          const messages = await Promise.all(
            session.messages.map(async (message) => {
              const imageUrl = await normalizeSourceForPersist(message.imageUrl);
              const attachedImages = await Promise.all(
                (message.attachedImages || []).map((item) => normalizeSourceForPersist(item))
              );
              const cleanedAttachedImages = attachedImages.filter(
                (item): item is string => Boolean(item)
              );
              return {
                ...message,
                imageUrl,
                attachedImages: cleanedAttachedImages.length ? cleanedAttachedImages : undefined,
              };
            })
          );

          return {
            ...session,
            messages,
          };
        })
      );

      return {
        ...project,
        elements,
        sessions,
      };
    })
  );

  return serialized;
}

export async function hydrateOpenLovartProjectsFromStorage(projects: OpenLovartProject[]) {
  const hydrated = await Promise.all(
    projects.map(async (project) => {
      const elements = await Promise.all(
        project.elements.map(async (element) => {
          if (element.type !== 'image') return element;
          const content = await restoreSource(element.content);
          return {
            ...element,
            content,
          };
        })
      );

      const sessions = await Promise.all(
        project.sessions.map(async (session) => {
          const messages = await Promise.all(
            session.messages.map(async (message) => {
              const imageUrl = await restoreSource(message.imageUrl);
              const attachedImages = await Promise.all(
                (message.attachedImages || []).map((item) => restoreSource(item))
              );
              const cleanedAttachedImages = attachedImages.filter(
                (item): item is string => Boolean(item)
              );
              return {
                ...message,
                imageUrl,
                attachedImages: cleanedAttachedImages.length ? cleanedAttachedImages : undefined,
              };
            })
          );
          return {
            ...session,
            messages,
          };
        })
      );

      return {
        ...project,
        elements,
        sessions,
      };
    })
  );

  return hydrated;
}

export async function removeOpenLovartProjectAssets(project: OpenLovartProject) {
  if (!canUseIndexedDb) return;
  const refs = collectProjectAssetRefs(project);
  await Promise.all(refs.map((ref) => removeAssetData(ref)));
}
