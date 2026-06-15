restoreChatHistory()

  document.getElementById('closePanel').addEventListener('click', closePanel)
  document.getElementById('panelSend').addEventListener('click', sendChat)
  const panelInputEl = document.getElementById('panelInput')
  panelInputEl.addEventListener('input', function () {
    this.style.height = 'auto'
    this.style.height = Math.min(this.scrollHeight, 140) + 'px'
  })
  panelInputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
    // Shift+Enter = new line
  })


  loadPortalsData().catch(function () {})