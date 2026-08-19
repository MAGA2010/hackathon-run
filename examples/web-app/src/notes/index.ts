/**
 * Notes CRUD — create / read / list. The 3-second sync promise from the demo
 * script is implemented here as an in-memory pub/sub for the example.
 */

export interface Note {
  id: string;
  ownerId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

const notes = new Map<string, Note[]>();
const listeners = new Map<string, Set<(notes: Note[]) => void>>();

export function createNote(ownerId: string, body: string): Note {
  if (body.length === 0) throw new Error('body must not be empty');
  if (body.length > 5000) throw new Error('body too long');
  const now = new Date().toISOString();
  const note: Note = {
    id: crypto.randomUUID(),
    ownerId,
    body,
    createdAt: now,
    updatedAt: now,
  };
  const list = notes.get(ownerId) ?? [];
  list.unshift(note);
  notes.set(ownerId, list);
  listeners.get(ownerId)?.forEach((cb) => cb(list));
  return note;
}

export function listNotes(ownerId: string): Note[] {
  return notes.get(ownerId) ?? [];
}

export function subscribe(ownerId: string, cb: (notes: Note[]) => void): () => void {
  let set = listeners.get(ownerId);
  if (!set) {
    set = new Set();
    listeners.set(ownerId, set);
  }
  set.add(cb);
  return () => set!.delete(cb);
}
