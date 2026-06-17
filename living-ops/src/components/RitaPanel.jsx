import { useRef, useState } from 'react'
import { useStore, actions } from '../hooks/useStore.js'
import { esc } from '../utils/api.js'
import { useChat } from '../hooks/useChat.js'

export default function RitaPanel() {
  const panelOpen = useStore(s => s.panelOpen)
  const chatHistory = useStore(s => s.chatHistory)
  const { sendChat, typing, setPdf, getPdf, clearPdf } = useChat()

  const [inputVal, setInputVal] = useState('')
  const [pdfName, setPdfName] = useState(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const chatAreaRef = useRef(null)

  function autosize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  async function handleSend() {
    const msg = inputVal.trim()
    if (!msg && !getPdf().data) return
    setInputVal('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendChat(msg)
    // scroll chat
    setTimeout(() => {
      if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight
    }, 50)
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target.result.split(',')[1]
      setPdf(b64, file.name)
      setPdfName(file.name)
    }
    reader.readAsDataURL(file)
  }

  function handleClearPdf() {
    clearPdf()
    setPdfName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const showGreeting = chatHistory.length === 0

  return (
    <div
      className="rita-panel"
      id="ritaPanel"
      style={panelOpen ? {} : {}}
    >
      <div className="panel-head">
        <div className="ptitle">
          <span className="dot" />
          <span className="pname">RITA</span>
        </div>
        <button
          className="close-p"
          id="closePanel"
          type="button"
          onClick={() => actions.closePanel()}
        >×</button>
      </div>

      <div className="chat-area" id="chatArea" ref={chatAreaRef}>
        {showGreeting && (
          <div className="msg-rita">
            <b>Рита:</b> Доброе утро. Открой область слева или задай вопрос — я на связи.
          </div>
        )}
        {chatHistory.map((m, i) => (
          <div key={i} className={m.role === 'rita' ? 'msg-rita' : 'msg-you'}>
            {m.role === 'rita' ? <><b>Рита:</b> {m.content}</> : m.content}
          </div>
        ))}
        {typing && (
          <div className="msg-rita" id="chatTyping">
            <b>Рита:</b> ···
          </div>
        )}
      </div>

      <div className="panel-input">
        <input
          type="file"
          ref={fileInputRef}
          id="panelFile"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div className="inp-wrap">
          <span className="rdot" />
          {pdfName && (
            <span
              className="pdf-badge"
              style={{ display: 'inline-block', cursor: 'pointer' }}
              onClick={handleClearPdf}
              title="Убрать PDF"
            >
              {pdfName.slice(0, 20)}
            </span>
          )}
          <textarea
            ref={textareaRef}
            id="panelInput"
            placeholder="Спросить Риту…"
            autoComplete="off"
            rows={1}
            value={inputVal}
            onChange={e => { setInputVal(e.target.value); autosize() }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            id="panelAttach"
            type="button"
            title="Прикрепить PDF"
            className={`attach${pdfName ? ' has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >📎</button>
          <button
            className="go"
            id="panelSend"
            type="button"
            disabled={typing}
            onClick={handleSend}
          >→</button>
        </div>
      </div>
    </div>
  )
}
