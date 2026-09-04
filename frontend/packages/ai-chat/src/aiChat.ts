function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }
export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'lumen-ai-chats-v1';

export function createConversation(): AiConversation {
  const now = new Date().toISOString();
  return {
    id: uid('chat'),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [{ role: 'assistant', content: '你好，我是 Lumen AI。可以帮你解释代码、整理笔记，或规划电路实验。' }]
  };
}

export function getConversations(): AiConversation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveConversation(convo: AiConversation): AiConversation {
  const list = getConversations();
  const next = { ...convo, updatedAt: new Date().toISOString() };
  const index = list.findIndex((item) => item.id === next.id);
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return next;
}

export function deleteConversation(id: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getConversations().filter((item) => item.id !== id)));
}

export function renameConversation(id: string, title: string) {
  const list = getConversations();
  const target = list.find((item) => item.id === id);
  if (!target) return;
  target.title = title.trim() || '新对话';
  target.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
