import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MESSAGE_CHANNEL,
  formatMessageForCopy,
  generateSalesMessage,
} from '../utils/messageTemplates.js'

export default function MessageModal({ lead, onClose, onMessageGenerated }) {
  const [channel, setChannel] = useState(MESSAGE_CHANNEL.WHATSAPP)
  const [copied, setCopied] = useState(false)
  const [logged, setLogged] = useState(false)

  function notifyGenerated(ch) {
    if (logged || !onMessageGenerated) return
    setLogged(true)
    onMessageGenerated(ch)
  }

  const preview = useMemo(() => {
    try {
      return formatMessageForCopy({ lead, channel })
    } catch {
      return ''
    }
  }, [lead, channel])

  const waLink = useMemo(() => {
    if (channel !== MESSAGE_CHANNEL.WHATSAPP) return null
    const text = generateSalesMessage({ lead, channel: MESSAGE_CHANNEL.WHATSAPP })
    if (typeof text !== 'string') return null
    const phone = String(lead.phone || '').replace(/\D/g, '')
    if (!phone) return null
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  }, [lead, channel])

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
          <h2 id="message-modal-title">Generated message</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-lead-name">{lead.name}</p>

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

        <label className="field message-modal-preview-label">
          <span>Preview</span>
          <textarea
            className="message-modal-textarea"
            readOnly
            rows={channel === MESSAGE_CHANNEL.WHATSAPP ? 5 : 12}
            value={preview}
          />
        </label>

        <div className="modal-actions message-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {waLink ? (
            <a className="btn btn-secondary" href={waLink} target="_blank" rel="noreferrer">
              Open WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
