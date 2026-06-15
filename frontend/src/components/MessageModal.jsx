import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../hooks/useAuth.js'
import { sendWhatsAppMessage } from '../services/whatsappService.js'
import {
  MESSAGE_CHANNEL,
  formatMessageForCopy,
  generateSalesMessage,
} from '../utils/messageTemplates.js'

export default function MessageModal({
  lead,
  onClose,
  onMessageGenerated,
  onSent,
  mode = 'compose',
}) {
  const { session } = useAuth()
  const isWhatsAppSend = mode === 'whatsapp-send'

  const [channel, setChannel] = useState(MESSAGE_CHANNEL.WHATSAPP)
  const [copied, setCopied] = useState(false)
  const [logged, setLogged] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  const generatedWhatsApp = useMemo(() => {
    try {
      return generateSalesMessage({ lead, channel: MESSAGE_CHANNEL.WHATSAPP })
    } catch {
      return ''
    }
  }, [lead])

  useEffect(() => {
    if (isWhatsAppSend) {
      setChannel(MESSAGE_CHANNEL.WHATSAPP)
      setMessageText(typeof generatedWhatsApp === 'string' ? generatedWhatsApp : '')
      setSendError(null)
    }
  }, [isWhatsAppSend, generatedWhatsApp, lead.id])

  function notifyGenerated(ch) {
    if (logged || !onMessageGenerated) return
    setLogged(true)
    onMessageGenerated(ch)
  }

  const preview = useMemo(() => {
    if (isWhatsAppSend) return messageText
    try {
      return formatMessageForCopy({ lead, channel })
    } catch {
      return ''
    }
  }, [lead, channel, isWhatsAppSend, messageText])

  const waLink = useMemo(() => {
    if (isWhatsAppSend || channel !== MESSAGE_CHANNEL.WHATSAPP) return null
    const text = generateSalesMessage({ lead, channel: MESSAGE_CHANNEL.WHATSAPP })
    if (typeof text !== 'string') return null
    const phone = String(lead.phone || '').replace(/\D/g, '')
    if (!phone) return null
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  }, [lead, channel, isWhatsAppSend])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(preview)
      setCopied(true)
      notifyGenerated(channel)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function handleSendWhatsApp() {
    setSendError(null)
    const text = messageText.trim()
    if (!text) {
      setSendError('Message cannot be empty.')
      return
    }

    const token = session?.access_token
    if (!token) {
      setSendError('Sign in again to send WhatsApp messages.')
      return
    }

    setSending(true)
    try {
      const result = await sendWhatsAppMessage({
        accessToken: token,
        leadId: lead.id,
        message: text,
      })

      if (!result.ok) {
        setSendError(result.error || 'Failed to send WhatsApp message.')
        return
      }

      onSent?.(result.data)
      onClose()
    } catch (err) {
      setSendError(err?.message || 'Failed to send WhatsApp message.')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal message-modal" role="dialog" aria-labelledby="message-modal-title">
        <div className="modal-header">
          <h2 id="message-modal-title">
            {isWhatsAppSend ? 'Send WhatsApp' : 'Generated message'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-lead-name">{lead.name}</p>

        {isWhatsAppSend ? (
          <p className="muted message-modal-hint">
            Edit the message below, then send via Twilio WhatsApp Sandbox.
          </p>
        ) : (
          <div className="message-modal-types" role="tablist" aria-label="Message type">
            <button
              type="button"
              className={`message-type-btn ${channel === MESSAGE_CHANNEL.WHATSAPP ? 'is-active' : ''}`}
              role="tab"
              aria-selected={channel === MESSAGE_CHANNEL.WHATSAPP}
              onClick={() => setChannel(MESSAGE_CHANNEL.WHATSAPP)}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className={`message-type-btn ${channel === MESSAGE_CHANNEL.EMAIL ? 'is-active' : ''}`}
              role="tab"
              aria-selected={channel === MESSAGE_CHANNEL.EMAIL}
              onClick={() => setChannel(MESSAGE_CHANNEL.EMAIL)}
            >
              Email
            </button>
            <button
              type="button"
              className={`message-type-btn ${channel === MESSAGE_CHANNEL.FOLLOW_UP ? 'is-active' : ''}`}
              role="tab"
              aria-selected={channel === MESSAGE_CHANNEL.FOLLOW_UP}
              onClick={() => setChannel(MESSAGE_CHANNEL.FOLLOW_UP)}
            >
              Follow-up
            </button>
          </div>
        )}

        <label className="field message-modal-preview-label">
          <span>{isWhatsAppSend ? 'Message' : 'Preview'}</span>
          <textarea
            className="message-modal-textarea"
            readOnly={!isWhatsAppSend}
            rows={isWhatsAppSend || channel === MESSAGE_CHANNEL.WHATSAPP ? 5 : 12}
            value={isWhatsAppSend ? messageText : preview}
            onChange={
              isWhatsAppSend
                ? (e) => {
                    setMessageText(e.target.value)
                    setSendError(null)
                  }
                : undefined
            }
          />
        </label>

        {sendError ? (
          <div className="banner banner-error message-modal-error" role="alert">
            {sendError}
          </div>
        ) : null}

        <div className="modal-actions message-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
            Close
          </button>
          {isWhatsAppSend ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendWhatsApp}
              disabled={sending || !messageText.trim()}
            >
              {sending ? 'Sending…' : 'Send WhatsApp'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              {waLink ? (
                <a className="btn btn-secondary" href={waLink} target="_blank" rel="noreferrer">
                  Open WhatsApp
                </a>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
