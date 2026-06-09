// ==========================================
// SCRCPY OCR Monitor — Vue 3 Application v2
// ==========================================

const { createApp, ref, computed, nextTick } = Vue

createApp({
  setup() {
    // ---------- State ----------
    const previewImage = ref(null)
    const isSelecting = ref(false)
    const hasRegion = ref(false)
    const region = ref({ x: 0, y: 0, width: 0, height: 0 })
    const displayInfo = ref({ width: 1920, height: 1080, scaleFactor: 1 })

    const ocrRunning = ref(false)
    const ocrResult = ref(null)

    const isMonitoring = ref(false)
    const interval = ref(2000)
    let monitorTimer = null

    const messages = ref([])
    const lastCaptureTime = ref('')

    // 選取用
    const selectCanvas = ref(null)
    const viewerContainer = ref(null)
    const selectRect = ref(null)
    const dragStart = ref(null)
    let bgImage = null          // HTML Image element
    let canvasImgW = 0          // canvas 上的圖片寬度
    let canvasImgH = 0
    let canvasOffsetX = 0
    let canvasOffsetY = 0

    const messagesContainer = ref(null)

    // ---------- Computed ----------
    const regionText = computed(() => {
      if (!hasRegion.value) return '未設定'
      const r = region.value
      return `(${r.x}, ${r.y}) ${r.width}×${r.height}`
    })

    const selectRectStyle = computed(() => {
      if (!selectRect.value) return { display: 'none' }
      return {
        left: selectRect.value.left + 'px',
        top: selectRect.value.top + 'px',
        width: selectRect.value.width + 'px',
        height: selectRect.value.height + 'px'
      }
    })

    // ---------- 1. 範圍選取 ----------
    async function startRangeSelect() {
      try {
        const info = await window.electronAPI.getDisplayInfo()
        displayInfo.value = info

        const result = await window.electronAPI.captureFullscreen()
        if (!result.success) {
          alert('無法擷取螢幕: ' + result.error)
          return
        }

        // 預先載入圖片，等待 onload
        const img = new Image()
        img.src = result.image

        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = () => reject(new Error('圖片載入失敗'))
        })

        bgImage = img
        isSelecting.value = true
        selectRect.value = null
        dragStart.value = null

        await nextTick()
        drawCanvas()
      } catch (err) {
        alert('初始化失敗: ' + err.message)
      }
    }

    function drawCanvas() {
      const canvas = selectCanvas.value
      const container = viewerContainer.value
      if (!canvas || !container || !bgImage) return

      canvas.width = container.clientWidth
      canvas.height = container.clientHeight

      const scale = Math.min(
        canvas.width / bgImage.naturalWidth,
        canvas.height / bgImage.naturalHeight
      )
      canvasImgW = bgImage.naturalWidth * scale
      canvasImgH = bgImage.naturalHeight * scale
      canvasOffsetX = (canvas.width - canvasImgW) / 2
      canvasOffsetY = (canvas.height - canvasImgH) / 2

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bgImage, canvasOffsetX, canvasOffsetY, canvasImgW, canvasImgH)
    }

    function onMouseDown(e) {
      const rect = selectCanvas.value.getBoundingClientRect()
      dragStart.value = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
      selectRect.value = { left: dragStart.value.x, top: dragStart.value.y, width: 0, height: 0 }
    }

    function onMouseMove(e) {
      if (!dragStart.value) return
      const rect = selectCanvas.value.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      selectRect.value = {
        left: Math.min(dragStart.value.x, cx),
        top: Math.min(dragStart.value.y, cy),
        width: Math.abs(cx - dragStart.value.x),
        height: Math.abs(cy - dragStart.value.y)
      }
    }

    function onMouseUp() {
      if (!dragStart.value || !selectRect.value || selectRect.value.width < 5) {
        dragStart.value = null
        selectRect.value = null
        return
      }

      // canvas 座標 → 原始螢幕座標
      const scaleX = bgImage.naturalWidth / canvasImgW
      const scaleY = bgImage.naturalHeight / canvasImgH

      const rawX = (selectRect.value.left - canvasOffsetX) * scaleX
      const rawY = (selectRect.value.top - canvasOffsetY) * scaleY
      const rawW = selectRect.value.width * scaleX
      const rawH = selectRect.value.height * scaleY

      region.value = {
        x: Math.max(0, Math.round(rawX)),
        y: Math.max(0, Math.round(rawY)),
        width: Math.max(1, Math.round(rawW)),
        height: Math.max(1, Math.round(rawH))
      }

      hasRegion.value = true
      isSelecting.value = false
      dragStart.value = null
      bgImage = null

      capturePreview()
    }

    function cancelSelect() {
      isSelecting.value = false
      selectRect.value = null
      dragStart.value = null
      bgImage = null
    }

    // ---------- 2. 預覽 ----------
    async function capturePreview() {
      try {
        const result = await window.electronAPI.captureRegion(region.value)
        if (result.success) {
          previewImage.value = result.image
        } else {
          alert('預覽失敗: ' + result.error)
        }
      } catch (err) {
        alert('預覽錯誤: ' + err.message)
      }
    }

    // ---------- 3. OCR ----------
    let ocrWorker = null

    async function getWorker() {
      if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker('chi_tra')
      }
      return ocrWorker
    }

    async function runOCR() {
      if (!hasRegion.value) return
      ocrRunning.value = true
      ocrResult.value = null

      try {
        const cap = await window.electronAPI.captureRegion(region.value)
        if (!cap.success) {
          ocrResult.value = { text: '', confidence: 0, words: [], error: cap.error }
          ocrRunning.value = false
          return
        }
        previewImage.value = cap.image

        const worker = await getWorker()
        const { data } = await worker.recognize(cap.image)

        ocrResult.value = {
          text: data.text.trim(),
          confidence: Math.round(data.confidence),
          words: (data.words || [])
            .filter(w => w.text.trim())
            .map(w => ({ text: w.text.trim(), confidence: Math.round(w.confidence) }))
        }

        if (data.text.trim()) {
          const ts = new Date().toLocaleTimeString('zh-TW', { hour12: false })
          messages.value.push({ time: ts, text: data.text.trim(), confidence: Math.round(data.confidence) })
          lastCaptureTime.value = ts
          await nextTick()
          scrollMessages()
        }
      } catch (err) {
        ocrResult.value = { text: '', confidence: 0, words: [], error: err.message }
      } finally {
        ocrRunning.value = false
      }
    }

    // ---------- 4. 監控 ----------
    function toggleMonitor() {
      isMonitoring.value ? stopMonitor() : startMonitor()
    }

    function startMonitor() {
      isMonitoring.value = true
      doCapture()
    }

    function stopMonitor() {
      isMonitoring.value = false
      if (monitorTimer) { clearTimeout(monitorTimer); monitorTimer = null }
    }

    async function doCapture() {
      if (!isMonitoring.value || !hasRegion.value) return
      try {
        const cap = await window.electronAPI.captureRegion(region.value)
        if (!cap.success) { scheduleNext(); return }
        previewImage.value = cap.image

        const worker = await getWorker()
        const { data } = await worker.recognize(cap.image)

        const text = data.text.trim()
        if (text) {
          const ts = new Date().toLocaleTimeString('zh-TW', { hour12: false })
          lastCaptureTime.value = ts
          messages.value.push({ time: ts, text, confidence: Math.round(data.confidence) })
          ocrResult.value = {
            text,
            confidence: Math.round(data.confidence),
            words: (data.words || []).filter(w => w.text.trim()).map(w => ({ text: w.text.trim(), confidence: Math.round(w.confidence) }))
          }
          await nextTick()
          scrollMessages()
        }
      } catch (err) {
        console.error('監控錯誤:', err)
      }
      scheduleNext()
    }

    function scheduleNext() {
      if (!isMonitoring.value) return
      monitorTimer = setTimeout(doCapture, interval.value)
    }

    function scrollMessages() {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    }

    // ---------- 5. 匯出 ----------
    function exportMessages() {
      if (messages.value.length === 0) return
      const header = '時間,留言內容,信心度'
      const rows = messages.value.map(m => `"${m.time}","${m.text}","${m.confidence}"`)
      const csv = '\uFEFF' + [header, ...rows].join('\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `ocr-messages-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    function clearMessages() {
      messages.value = []
      ocrResult.value = null
    }

    // 清理
    window.addEventListener('beforeunload', async () => {
      stopMonitor()
      if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null }
    })

    return {
      previewImage, isSelecting, hasRegion, region,
      ocrRunning, ocrResult, isMonitoring, interval,
      messages, lastCaptureTime,
      selectCanvas, viewerContainer, messagesContainer,
      regionText, selectRectStyle,
      startRangeSelect, cancelSelect, onMouseDown, onMouseMove, onMouseUp,
      capturePreview, runOCR, toggleMonitor,
      exportMessages, clearMessages
    }
  }
}).mount('#app')