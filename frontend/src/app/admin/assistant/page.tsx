'use client'
import { useState, useRef, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { assistantApi } from '@/lib/api'
import { Send, Bot, User as UserIcon } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Why did tickets increase this week?',
  'Which department has the most tickets?',
  'How is our SLA performance?',
  'How effective is self-help at deflecting tickets?',
]

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! Ask me anything about your ticket data — I'll answer using your real metrics, not guesses." },
  ])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (question: string) => {
    if (!question.trim() || loading) return
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await assistantApi.ask(question)
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that question right now." }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout title="AI Assistant" subtitle="Ask questions about your operational data">
      <div className="flex flex-col" style={{ maxWidth: 720, height: 'calc(100vh - 160px)' }}>
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)' }}>
                  <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
              )}
              <div
                className="rounded-xl px-3.5 py-2.5 text-sm max-w-[80%]"
                style={{
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-card)',
                  color: m.role === 'user' ? 'white' : 'var(--text)',
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                }}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <UserIcon className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)' }}>
                <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
              <div className="rounded-xl px-3.5 py-2.5 text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full transition"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Ask about ticket trends, SLA performance, agent workload…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
          />
          <button onClick={() => send(input)} disabled={loading} className="btn-primary flex items-center justify-center" style={{ width: 40, height: 40, padding: 0 }}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
