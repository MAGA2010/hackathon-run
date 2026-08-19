/**
 * Mobile-side API client for the Hackathon Surgeon example.
 *
 * Talks to the web-app backend in the canonical 36-hour demo:
 * sign up, list notes, create a note.
 */

export interface Note {
  id: string;
  body: string;
  createdAt: string;
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private token?: string,
  ) {}

  async health(): Promise<{ ok: boolean }> {
    const r = await fetch(`${this.baseUrl}/api/health`);
    return r.json();
  }

  async createNote(body: string): Promise<Note> {
    const r = await fetch(`${this.baseUrl}/api/notes`, {
      method: 'POST',
      body,
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
    });
    if (!r.ok) throw new Error(`createNote failed: ${r.status}`);
    return r.json();
  }

  async listNotes(): Promise<Note[]> {
    const r = await fetch(`${this.baseUrl}/api/notes`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
    });
    if (!r.ok) throw new Error(`listNotes failed: ${r.status}`);
    return r.json();
  }
}
