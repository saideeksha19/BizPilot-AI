import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  History,
  Info,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { copilotApi } from '../services/copilotApi';
import {
  generateCopilotResponse,
  SUGGESTED_COPILOT_QUESTIONS,
} from '../services/copilotEngine';
import {
  ApiConfidenceLevel,
  ApiCopilotConversationSummary,
  ApiCopilotMessage,
  ApiCopilotStructuredResponse,
} from '../types/api';
import { CopilotMessage } from '../types/financial';
import { DataOriginTag } from '../components/common/DataOriginTag';

type RenderMessage =
  | {
      kind: 'backend';
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
      structured: ApiCopilotStructuredResponse | null;
    }
  | {
      kind: 'fallback';
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
      modeLabel: string;
      legacy: CopilotMessage;
    };

function formatMsgTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function confidenceBadgeMeta(conf: ApiConfidenceLevel): {
  label: string;
  className: string;
} {
  switch (conf) {
    case 'high':
      return {
        label: 'High Confidence',
        className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      };
    case 'medium':
      return {
        label: 'Medium Confidence',
        className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      };
    case 'low':
      return {
        label: 'Low Confidence',
        className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      };
    case 'insufficient_data':
    default:
      return {
        label: 'Insufficient Data',
        className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      };
  }
}

function mapApiMessages(items: ApiCopilotMessage[]): RenderMessage[] {
  return items.map((m) => ({
    kind: 'backend',
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: formatMsgTime(m.created_at),
    structured: m.structured_payload,
  }));
}

export function CopilotPage() {
  const {
    activeBusiness,
    businessInvoices,
    businessTransactions,
    businessInventory,
    businessRisks,
    datePreset,
    navigate,
  } = useApp();
  const { kpi, health, isBackendMode } = useFilteredMetrics();

  const [conversations, setConversations] = useState<ApiCopilotConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [backendMessages, setBackendMessages] = useState<RenderMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [demoMessages, setDemoMessages] = useState<RenderMessage[]>([]);
  const [input, setInput] = useState('');
  const threadBottomRef = useRef<HTMLDivElement | null>(null);

  const resolvedPreset: '7d' | '30d' | '90d' = useMemo(() => {
    if (datePreset === '7d' || datePreset === '90d') return datePreset;
    return '30d';
  }, [datePreset]);

  // Initialize demo thread when in unauthenticated demo workspace
  useEffect(() => {
    if (isBackendMode) return;
    const starter = generateCopilotResponse(
      'What is my current cash runway and liquidity position?',
      activeBusiness,
      kpi,
      health,
      businessInvoices,
      businessTransactions,
      businessInventory,
      businessRisks
    );
    setDemoMessages([
      {
        kind: 'fallback',
        id: starter.id,
        role: 'assistant',
        content: starter.content,
        timestamp: starter.timestamp,
        modeLabel: 'Illustrative Demo Mode (Deterministic Fallback)',
        legacy: starter,
      },
    ]);
    setError(null);
    setLastFailedQuestion(null);
  }, [
    isBackendMode,
    activeBusiness.id,
    activeBusiness,
    kpi,
    health,
    businessInvoices,
    businessTransactions,
    businessInventory,
    businessRisks,
  ]);

  // Load persisted conversations in backend mode
  const loadConversations = useCallback(
    async (selectMostRecent: boolean) => {
      if (!isBackendMode) return;
      setHistoryLoading(true);
      setError(null);
      try {
        const listRes = await copilotApi.listConversations(activeBusiness.id, 1, 20);
        setConversations(listRes.items);
        if (selectMostRecent && listRes.items.length > 0) {
          const firstId = listRes.items[0].id;
          const detail = await copilotApi.getConversation(activeBusiness.id, firstId);
          setActiveConversationId(detail.id);
          setBackendMessages(mapApiMessages(detail.messages));
        } else if (selectMostRecent) {
          setActiveConversationId(null);
          setBackendMessages([]);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Unable to load Copilot conversation history.';
        setError(msg);
      } finally {
        setHistoryLoading(false);
      }
    },
    [isBackendMode, activeBusiness.id]
  );

  useEffect(() => {
    if (!isBackendMode) {
      setConversations([]);
      setActiveConversationId(null);
      setBackendMessages([]);
      return;
    }
    loadConversations(true);
  }, [isBackendMode, activeBusiness.id, loadConversations]);

  useEffect(() => {
    threadBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [backendMessages.length, demoMessages.length, sending]);

  const handleSelectConversation = async (conversationId: string) => {
    if (!isBackendMode || sending) return;
    setHistoryLoading(true);
    setError(null);
    setLastFailedQuestion(null);
    try {
      const detail = await copilotApi.getConversation(activeBusiness.id, conversationId);
      setActiveConversationId(detail.id);
      setBackendMessages(mapApiMessages(detail.messages));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleNewConversation = () => {
    if (sending) return;
    setError(null);
    setLastFailedQuestion(null);
    if (isBackendMode) {
      setActiveConversationId(null);
      setBackendMessages([]);
    } else {
      const starter = generateCopilotResponse(
        'What is my current cash runway and liquidity position?',
        activeBusiness,
        kpi,
        health,
        businessInvoices,
        businessTransactions,
        businessInventory,
        businessRisks
      );
      setDemoMessages([
        {
          kind: 'fallback',
          id: starter.id,
          role: 'assistant',
          content: starter.content,
          timestamp: starter.timestamp,
          modeLabel: 'Illustrative Demo Mode (Deterministic Fallback)',
          legacy: starter,
        },
      ]);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!isBackendMode || deletingId) return;
    setDeletingId(conversationId);
    setError(null);
    try {
      await copilotApi.deleteConversation(activeBusiness.id, conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setBackendMessages([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete conversation.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUseDeterministicFallback = (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed) return;
    const nowTime = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const reply = generateCopilotResponse(
      trimmed,
      activeBusiness,
      kpi,
      health,
      businessInvoices,
      businessTransactions,
      businessInventory,
      businessRisks
    );

    const fallbackItems: RenderMessage[] = [
      {
        kind: 'fallback',
        id: `usr-fb-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: nowTime,
        modeLabel: 'Deterministic Local Fallback (Gemini Unavailable)',
        legacy: {
          id: `usr-fb-${Date.now()}`,
          role: 'user',
          content: trimmed,
          timestamp: nowTime,
        },
      },
      {
        kind: 'fallback',
        id: reply.id,
        role: 'assistant',
        content: reply.content,
        timestamp: reply.timestamp,
        modeLabel: 'Deterministic Local Fallback (Gemini Unavailable)',
        legacy: reply,
      },
    ];

    setBackendMessages((prev) => [...prev, ...fallbackItems]);
    setError(null);
    setLastFailedQuestion(null);
  };

  const handleAsk = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;

    if (!isBackendMode) {
      const nowTime = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const reply = generateCopilotResponse(
        trimmed,
        activeBusiness,
        kpi,
        health,
        businessInvoices,
        businessTransactions,
        businessInventory,
        businessRisks
      );
      setDemoMessages((prev) => [
        ...prev,
        {
          kind: 'fallback',
          id: `usr-${Date.now()}`,
          role: 'user',
          content: trimmed,
          timestamp: nowTime,
          modeLabel: 'Illustrative Demo Mode (Deterministic Fallback)',
          legacy: {
            id: `usr-${Date.now()}`,
            role: 'user',
            content: trimmed,
            timestamp: nowTime,
          },
        },
        {
          kind: 'fallback',
          id: reply.id,
          role: 'assistant',
          content: reply.content,
          timestamp: reply.timestamp,
          modeLabel: 'Illustrative Demo Mode (Deterministic Fallback)',
          legacy: reply,
        },
      ]);
      setInput('');
      return;
    }

    setSending(true);
    setError(null);
    setLastFailedQuestion(null);

    const optimisticId = `pending-${Date.now()}`;
    const optimisticUserMsg: RenderMessage = {
      kind: 'backend',
      id: optimisticId,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      structured: null,
    };
    setBackendMessages((prev) => [...prev, optimisticUserMsg]);
    setInput('');

    try {
      const res = await copilotApi.chat(activeBusiness.id, {
        question: trimmed,
        conversation_id: activeConversationId,
        preset: resolvedPreset,
      });

      setActiveConversationId(res.conversation.id);
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== res.conversation.id);
        return [res.conversation, ...filtered];
      });
      setBackendMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        ...mapApiMessages([res.user_message, res.assistant_message]),
      ]);
    } catch (err: unknown) {
      setBackendMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach Gemini Financial Decision Copilot.';
      setError(msg);
      setLastFailedQuestion(trimmed);
    } finally {
      setSending(false);
    }
  };

  const visibleMessages = isBackendMode ? backendMessages : demoMessages;
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Suggested Prompts, Conversation History & Deep Analysis Links */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Financial Copilot
              </h2>
            </div>
            <DataOriginTag kind={isBackendMode ? 'ACTUAL' : 'demo'} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {isBackendMode
              ? `Explainable Gemini decision-support grounded strictly in ${activeBusiness.name}'s verified Decimal ledger metrics, Digital Twin, forecasts, and Risk Radar.`
              : `Demo mode is active for ${activeBusiness.name}. Sign in with a real business workspace to persist Gemini-powered briefings.`}
          </p>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
            <div className="text-[11px] font-medium text-slate-400">
              Suggested Financial Questions
            </div>
            {SUGGESTED_COPILOT_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => handleAsk(q)}
                className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-white/8 hover:border-violet-500/40 hover:bg-violet-500/[0.04] disabled:opacity-50 text-xs text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between gap-2"
              >
                <span>{q}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {isBackendMode && (
          <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <History className="w-3.5 h-3.5 text-violet-500" />
                <span>Recent Briefings</span>
              </div>
              <button
                type="button"
                onClick={handleNewConversation}
                disabled={sending}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-600/10 text-violet-600 dark:text-violet-300 hover:bg-violet-600/20 disabled:opacity-50"
              >
                <MessageSquarePlus className="w-3 h-3" />
                <span>New Chat</span>
              </button>
            </div>

            {historyLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                <span>Loading saved threads...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-[11px] text-slate-400 py-1">
                No saved conversations yet for this workspace. Ask a question to start one.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${
                        isActive
                          ? 'border-violet-500/40 bg-violet-500/[0.06] text-slate-900 dark:text-slate-100'
                          : 'border-slate-200 dark:border-white/8 hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectConversation(conv.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="truncate font-medium">{conv.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono-num">
                          {conv.message_count} messages · {new Date(conv.last_message_at).toLocaleDateString()}
                        </div>
                      </button>
                      <button
                        type="button"
                        title="Delete conversation (ledger untouched)"
                        disabled={deletingId === conv.id}
                        onClick={() => handleDeleteConversation(conv.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 shrink-0"
                      >
                        {deletingId === conv.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 text-xs space-y-2">
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            Jump to Deep Analysis
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('simulator')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              What-If Simulator
            </button>
            <button
              type="button"
              onClick={() => navigate('financial-twin')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              Financial Twin
            </button>
            <button
              type="button"
              onClick={() => navigate('risk-radar')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              Risk Radar
            </button>
          </div>
        </div>
      </div>

      {/* Right: Conversational Thread */}
      <div className="lg:col-span-8 rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 flex flex-col min-h-[580px] max-h-[78vh]">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/8 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeConversation
                ? activeConversation.title
                : `Active Briefing · ${activeBusiness.name}`}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {isBackendMode
                ? `Gemini AI Decision Copilot · ${resolvedPreset.toUpperCase()} window · Advisory only`
                : 'Illustrative Demo Mode (Deterministic Fallback) · Local workspace data'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono-num text-slate-400">
              Score {health.overallScore}/100
            </span>
            {isBackendMode && activeConversationId && (
              <button
                type="button"
                onClick={() => handleDeleteConversation(activeConversationId)}
                disabled={deletingId === activeConversationId || sending}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] text-slate-500 hover:text-rose-500 hover:border-rose-500/30 disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-xl p-4 bg-rose-500/10 border border-rose-500/25 space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {lastFailedQuestion && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAsk(lastFailedQuestion)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/10 font-medium"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Gemini</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseDeterministicFallback(lastFailedQuestion)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] font-medium"
                  >
                    <span>Use Deterministic Local Fallback</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {isBackendMode && visibleMessages.length === 0 && !sending && !historyLoading && (
            <div className="rounded-xl p-6 border border-dashed border-slate-200 dark:border-white/10 text-center space-y-2">
              <Sparkles className="w-5 h-5 text-violet-500 mx-auto" />
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ask BizPilot AI Copilot
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                Ask about cash runway, overdue receivables, expense drivers, hiring feasibility, or inventory restocking. Computed facts come directly from your verified backend Decimal ledger.
              </p>
            </div>
          )}

          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-lg px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs leading-relaxed">
                  {msg.content}
                </div>
              ) : msg.kind === 'backend' && msg.structured ? (
                <BackendAssistantCard
                  structured={msg.structured}
                  timestamp={msg.timestamp}
                  onFollowUp={(q) => handleAsk(q)}
                  disabled={sending}
                />
              ) : msg.kind === 'fallback' ? (
                <div className="w-full space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {msg.modeLabel}
                      </span>
                      <DataOriginTag kind={isBackendMode ? 'ESTIMATED' : 'demo'} />
                    </div>
                    <span className="font-mono-num">{msg.timestamp}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {msg.legacy.content}
                  </p>

                  {msg.legacy.metrics && msg.legacy.metrics.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      {msg.legacy.metrics.map((m) => (
                        <div
                          key={m.label}
                          className="p-3 rounded-lg bg-white dark:bg-[#20303d] border border-slate-200 dark:border-white/8"
                        >
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {m.label}
                          </div>
                          <div className="mt-1 text-sm font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                            {m.value}
                          </div>
                          {m.delta && (
                            <div
                              className={`text-[11px] font-mono-num mt-0.5 ${
                                m.tone === 'positive'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : m.tone === 'negative'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {m.delta}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.legacy.recommendations && msg.legacy.recommendations.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-white/8 space-y-1">
                      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        Recommended Next Moves
                      </div>
                      <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                        {msg.legacy.recommendations.map((rec, i) => (
                          <li key={i}>• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.legacy.disclaimer && (
                    <div className="text-[11px] text-slate-400">
                      {msg.legacy.disclaimer}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 text-xs text-slate-700 dark:text-slate-300">
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500 shrink-0" />
              <span>
                Assembling verified Decimal metrics and generating Gemini decision briefing...
              </span>
            </div>
          )}
          <div ref={threadBottomRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(input);
          }}
          className="p-4 border-t border-slate-200 dark:border-white/8 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            maxLength={1500}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about cash runway, overdue invoices, expense drivers, or hiring..."
            className="flex-1 px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-medium transition-colors"
          >
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{sending ? 'Thinking...' : 'Ask'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

interface BackendAssistantCardProps {
  structured: ApiCopilotStructuredResponse;
  timestamp: string;
  onFollowUp: (question: string) => void;
  disabled: boolean;
}

function BackendAssistantCard({
  structured,
  timestamp,
  onFollowUp,
  disabled,
}: BackendAssistantCardProps) {
  const confMeta = confidenceBadgeMeta(structured.confidence);

  return (
    <div className="w-full space-y-4 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-violet-600 dark:text-violet-400">
            Gemini Financial Decision Copilot ({structured.model_used})
          </span>
          <DataOriginTag kind={structured.primary_data_label} />
          <span
            className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${confMeta.className}`}
          >
            {confMeta.label}
          </span>
        </div>
        <span className="font-mono-num text-slate-400">
          {timestamp ? `${timestamp} · ` : ''}As of {structured.context_as_of_date}
        </span>
      </div>

      {/* Insufficient-Data Guardrail Notice */}
      {structured.insufficient_data && (
        <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Limited Historical Data: </span>
            <span>
              {structured.insufficient_data_reason ||
                'Underlying ledger history is sparse; confidence is capped accordingly.'}
            </span>
          </div>
        </div>
      )}

      {/* Summary & AI Interpretation */}
      <div className="space-y-2">
        <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
          {structured.summary}
        </p>
        <div className="p-3 rounded-lg bg-white/80 dark:bg-[#20303d]/70 border border-slate-200/80 dark:border-white/[0.06] space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            AI Interpretation
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {structured.ai_interpretation}
          </p>
        </div>
      </div>

      {/* Authoritative Computed Facts */}
      {structured.computed_facts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              Verified Computed Facts (Backend Decimal Engine)
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {structured.computed_facts.map((fact) => (
              <div
                key={fact.key}
                className="p-2.5 rounded-lg bg-white dark:bg-[#20303d] border border-slate-200 dark:border-white/8"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {fact.label}
                  </span>
                  <DataOriginTag kind={fact.data_label} className="!text-[9px]" />
                </div>
                <div className="mt-1 text-xs font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actionable Recommendations */}
      {structured.recommendations.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/8">
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Explainable Recommendations
          </div>
          <div className="space-y-2.5">
            {structured.recommendations.map((rec, idx) => {
              const recConf = confidenceBadgeMeta(rec.confidence);
              return (
                <div
                  key={`${rec.title}-${idx}`}
                  className="p-3.5 rounded-lg bg-white dark:bg-[#20303d] border border-slate-200 dark:border-white/8 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span>{rec.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {rec.relevant_amount_or_pct && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[10px] font-mono-num text-slate-700 dark:text-slate-200">
                          {rec.relevant_amount_or_pct}
                        </span>
                      )}
                      <DataOriginTag kind={rec.data_label} className="!text-[10px]" />
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${recConf.className}`}
                      >
                        {recConf.label}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {rec.explanation}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="p-2 rounded bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.05]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        Evidence:{' '}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {rec.supporting_evidence}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.05]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        Potential Impact:{' '}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {rec.potential_impact}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-700 dark:text-slate-200">
                    <span className="font-semibold text-violet-600 dark:text-violet-400">
                      Next Step:{' '}
                    </span>
                    {rec.recommended_next_step}
                  </div>

                  <div className="text-[10px] text-slate-400">
                    Assumptions & limits: {rec.assumptions_and_limitations}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hypothetical Scenarios */}
      {structured.hypothetical_notes.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              Hypothetical Scenarios
            </span>
            <DataOriginTag kind="HYPOTHETICAL" className="!text-[10px]" />
          </div>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {structured.hypothetical_notes.map((note, idx) => (
              <li key={idx}>• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Follow-up Questions */}
      {structured.follow_up_questions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Suggested Follow-Ups
          </div>
          <div className="flex flex-wrap gap-1.5">
            {structured.follow_up_questions.map((fq) => (
              <button
                key={fq}
                type="button"
                disabled={disabled}
                onClick={() => onFollowUp(fq)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:border-violet-500/40 hover:bg-violet-500/[0.05] disabled:opacity-40 text-[11px] text-slate-700 dark:text-slate-200 transition-colors"
              >
                {fq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assumptions & Safety Footer */}
      <div className="pt-2 border-t border-slate-200 dark:border-white/8 space-y-1 text-[11px] text-slate-400">
        {structured.assumptions_and_limitations.length > 0 && (
          <div>
            Assumptions: {structured.assumptions_and_limitations.join(' ')}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <Info className="w-3 h-3 shrink-0" />
          <span>{structured.safety_notice}</span>
        </div>
      </div>
    </div>
  );
}
