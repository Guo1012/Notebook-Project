import {
  createConversation,
  deleteConversation,
  getConversations,
  renameConversation,
  saveConversation,
  type AiConversation
} from './aiChat';

export interface AgentContext {
  notebookId?: string;
  notebookTitle?: string;
  selectedCell?: {
    id: string;
    type: 'code' | 'markdown' | 'raw' | 'circuit';
    source: string;
  };
}

export interface AgentProvider {
  reply(input: {
    message: string;
    conversation: AiConversation;
    context?: AgentContext;
  }): Promise<string>;
}

export interface ConversationRepository {
  list(): AiConversation[];
  save(conversation: AiConversation): AiConversation;
  remove(id: string): void;
  rename(id: string, title: string): void;
}

export const localConversationRepository: ConversationRepository = {
  list: getConversations,
  save: saveConversation,
  remove: deleteConversation,
  rename: renameConversation
};

export const localAgentProvider: AgentProvider = {
  async reply({ message, context }) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const q = message.toLowerCase();
    const notebookHint = context?.notebookTitle ? `（当前 Notebook：${context.notebookTitle}）` : '';
    if (q.includes('代码') || q.includes('code') || q.includes('python')) {
      return `可以${notebookHint}。把代码粘贴进来，我会逐行解释逻辑，并指出可以优化的地方。`;
    }
    if (q.includes('电路') || q.includes('量子') || q.includes('circuit')) {
      return `没问题${notebookHint}。告诉我你想实现什么（比如叠加态、量子门组合），我可以帮你规划电路结构。`;
    }
    if (q.includes('markdown') || q.includes('笔记') || q.includes('大纲')) {
      return `好的${notebookHint}，我可以帮你搭一个结构清晰的 Markdown 大纲，包含标题、公式与代码块。`;
    }
    return `收到：「${message}」${notebookHint}。这是本地模拟回复——后续可通过 AgentProvider 接入真实 Agent。`;
  }
};

/** Framework-independent conversation controller used by AgentChat. */
export class AgentChatModel {
  constructor(
    readonly repository: ConversationRepository = localConversationRepository,
    readonly provider: AgentProvider = localAgentProvider
  ) {}

  list(): AiConversation[] {
    return this.repository.list();
  }

  create(): AiConversation {
    return this.repository.save(createConversation());
  }

  rename(id: string, title: string): AiConversation[] {
    this.repository.rename(id, title);
    return this.list();
  }

  remove(id: string): AiConversation[] {
    this.repository.remove(id);
    return this.list();
  }

  appendUserMessage(conversation: AiConversation, content: string): AiConversation {
    const current = this.list().find((item) => item.id === conversation.id) ?? conversation;
    return this.repository.save({
      ...current,
      messages: [...current.messages, { role: 'user', content }]
    });
  }

  async appendAssistantReply(
    conversation: AiConversation,
    message: string,
    context?: AgentContext
  ): Promise<AiConversation> {
    const content = await this.provider.reply({ message, conversation, context });
    const current = this.list().find((item) => item.id === conversation.id) ?? conversation;
    return this.repository.save({
      ...current,
      messages: [...current.messages, { role: 'assistant', content }]
    });
  }
}
