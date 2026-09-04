import { SessionContext } from '$lib/sessionContext';
import { RuntimeKernelAdapter } from '$lib/runtimeKernel';

class NotebookSessionRegistry {
  private readonly sessions = new Map<string, SessionContext>();

  get(notebookId: string): SessionContext {
    const existing = this.sessions.get(notebookId);
    if (existing) return existing;

    const session = new SessionContext(new RuntimeKernelAdapter(notebookId));
    this.sessions.set(notebookId, session);
    return session;
  }

  async remove(notebookId: string): Promise<void> {
    const session = this.sessions.get(notebookId);
    this.sessions.delete(notebookId);
    if (session) await session.shutdown();
  }

  async shutdownAll(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(sessions.map((session) => session.shutdown()));
  }
}

export const notebookSessions = new NotebookSessionRegistry();
