import { type Exchange } from "../shared/exchange";
export type Settings = {
  price: boolean;
  owner: boolean;
  status: boolean;
  autoPrice: boolean;
};
export type Audit = {
  at: string;
  action: string;
  before: Exchange;
  after: Exchange;
};
export type LocalState = {
  data: Exchange;
  image: string | null;
  settings: Settings;
  audits: Audit[];
  sequence: number;
  classroom?: { groupNames: string[]; seatCount: 27 | 30; animated: boolean };
  periodViews: Record<
    string,
    { image: string | null; properties: Exchange["properties"]; mode: string }
  >;
};
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("classroom-property-v1", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("state");
      r.result.createObjectStore("backups", { autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function readState() {
  const db = await open();
  return new Promise<LocalState | undefined>((resolve, reject) => {
    const tx = db.transaction("state", "readonly");
    const r = tx.objectStore("state").get("current");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeState(state: LocalState, backup = false) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["state", "backups"], "readwrite");
    const store = tx.objectStore("state");
    const r = store.get("current");
    let failure = "저장에 실패했습니다";
    r.onsuccess = () => {
      const old = r.result as LocalState | undefined;
      if (old && old.sequence !== state.sequence - 1) {
        failure =
          "다른 탭에서 자료가 변경되었습니다. 새로고침 후 다시 시도하세요.";
        tx.abort();
        return;
      }
      if (backup && old)
        tx.objectStore("backups").add({
          ...old,
          backedUpAt: new Date().toISOString(),
        });
      store.put(state, "current");
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error(failure));
    };
  });
}
export async function lastBackup() {
  const db = await open();
  return new Promise<LocalState | undefined>((resolve, reject) => {
    const tx = db.transaction("backups");
    const r = tx.objectStore("backups").openCursor(null, "prev");
    r.onsuccess = () => resolve(r.result?.value);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
