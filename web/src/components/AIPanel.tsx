import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { aiService } from '@/services/api';
import type { AIConversation, AIMessage } from '@/types';

interface AIPanelProps {
  documentId: string;
  onInsertText?: (text: string) => void;
}

export function AIPanel({ documentId, onInsertText }: AIPanelProps) {
  const { t, i18n } = useTranslation();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [completion, setCompletion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = () => {
    setIsLoadingConversations(true);
    aiService
      .listConversations(documentId)
      .then((convs) => setConversations(convs ?? []))
      .catch(() => setError('Failed to load conversations'))
      .finally(() => setIsLoadingConversations(false));
  };

  useEffect(() => {
    loadConversations();
  }, [documentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = (conversationId: string) => {
    aiService
      .getMessages(conversationId)
      .then((msgs) => setMessages(msgs ?? []))
      .catch(() => setError('Failed to load messages'));
  };

  const handleSelectConversation = (conv: AIConversation) => {
    setSelectedConversation(conv);
    setSummary(null);
    setCompletion(null);
    loadMessages(conv.id);
  };

  const handleNewConversation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const conv = await aiService.createConversation(documentId, '新对话');
      loadConversations();
      setSelectedConversation(conv);
      setMessages([]);
    } catch (e) {
      setError('Failed to create conversation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim() || !selectedConversation) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiService.ask(documentId, selectedConversation.id, question);
      setQuestion('');
      if (result.messages) {
        setMessages(result.messages);
      }
    } catch (e) {
      setError('Failed to get answer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummarize = async () => {
    setIsSummarizing(true);
    setError(null);
    setSummary(null);
    setCompletion(null);
    try {
      const result = await aiService.summarize(documentId);
      setSummary(result.summary);
    } catch (e) {
      setError('Failed to summarize document');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    setError(null);
    setSummary(null);
    setCompletion(null);
    try {
      const result = await aiService.complete(documentId, '');
      setCompletion(result.completion);
      if (result.completion && onInsertText) {
        onInsertText(result.completion);
      }
    } catch (e) {
      setError('Failed to complete text');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await aiService.deleteConversation(convId);
      if (selectedConversation?.id === convId) {
        setSelectedConversation(null);
        setMessages([]);
      }
      loadConversations();
    } catch {
      setError('Failed to delete conversation');
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h3>{t('ai.title') || 'AI Assistant'}</h3>
      </div>

      {error && (
        <div className="ai-panel-error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="ai-panel-toolbar">
        <button onClick={handleNewConversation} disabled={isLoading} className="ai-btn-primary">
          {t('ai.newConversation') || 'New Chat'}
        </button>
        <button onClick={handleSummarize} disabled={isSummarizing} className="ai-btn-secondary">
          {isSummarizing ? t('ai.summarizing') || 'Summarizing...' : t('ai.summarize') || 'Summarize'}
        </button>
        <button onClick={handleComplete} disabled={isCompleting} className="ai-btn-secondary">
          {isCompleting ? t('ai.completing') || 'Completing...' : t('ai.complete') || 'Complete'}
        </button>
      </div>

      {summary && (
        <div className="ai-panel-result">
          <div className="ai-result-header">
            <span>{t('ai.summary') || 'Summary'}</span>
            <button onClick={() => setSummary(null)}>×</button>
          </div>
          <div className="ai-result-content">{summary}</div>
          {onInsertText && (
            <button onClick={() => onInsertText(summary)} className="ai-btn-insert">
              {t('ai.insert') || 'Insert'}
            </button>
          )}
        </div>
      )}

      {completion && (
        <div className="ai-panel-result">
          <div className="ai-result-header">
            <span>{t('ai.completion') || 'Completion'}</span>
            <button onClick={() => setCompletion(null)}>×</button>
          </div>
          <div className="ai-result-content">{completion}</div>
          {onInsertText && (
            <button onClick={() => onInsertText(completion)} className="ai-btn-insert">
              {t('ai.insert') || 'Insert'}
            </button>
          )}
        </div>
      )}

      <div className="ai-panel-content">
        <div className="ai-conversations-list">
          <h4>{t('ai.conversations') || 'Conversations'}</h4>
          {isLoadingConversations ? (
            <p className="ai-loading">{t('ai.loading') || 'Loading...'}</p>
          ) : conversations.length === 0 ? (
            <p className="ai-empty">{t('ai.noConversations') || 'No conversations yet'}</p>
          ) : (
            <ul>
              {conversations.map((conv) => (
                <li
                  key={conv.id}
                  className={`ai-conversation-item ${selectedConversation?.id === conv.id ? 'selected' : ''}`}
                  onClick={() => handleSelectConversation(conv)}
                >
                  <span className="ai-conversation-title">{conv.title}</span>
                  <button
                    className="ai-conversation-delete"
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ai-chat-area">
          {selectedConversation ? (
            <>
              <div className="ai-messages">
                {messages.length === 0 ? (
                  <p className="ai-empty-messages">{t('ai.startConversation') || 'Start the conversation'}</p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`ai-message ai-message-${msg.role}`}>
                      <div className="ai-message-role">{msg.role === 'user' ? t('ai.user') || 'You' : t('ai.assistant') || 'AI'}</div>
                      <div className="ai-message-content">{msg.content}</div>
                      <div className="ai-message-time">
                        {new Date(msg.created_at).toLocaleTimeString(i18n.language)}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="ai-input-area">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t('ai.questionPlaceholder') || 'Ask a question...'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                />
                <button onClick={handleAsk} disabled={isLoading || !question.trim()}>
                  {isLoading ? t('ai.sending') || 'Sending...' : t('ai.send') || 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="ai-no-conversation">
              <p>{t('ai.selectConversation') || 'Select a conversation or start a new one'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
