// ==========================================
// SCRCPY OCR Monitor - Vue 3 Application
// ==========================================

const { createApp, ref, computed, nextTick, watch } = Vue

createApp({
  setup() {
    // ---- State ----
    const previewImage = ref(null)       // base64 預覽圖
    const isSelecting = ref(false)       // 是否在範圍選取模式
    const hasRegion = ref(false)         // 是否已選取範圍
    const region = ref({ x: 0, y: 0, width: 0, height: 0 })  // 選取範圍

    const ocrRunning = ref(false)
    const ocrResult = ref(null)          // { text, confidence, words[] }

    const isMonitoring = ref(false)
    const interval = ref(2000)           // 監控間隔 ms
    let monitorTimer = null

    const messages = ref([])             // 留言記錄
    const lastCaptureTime = ref('')

    // 範圍選取相關
    const selectCanvas = ref(null)
    const viewerContainer = ref(null)
    const selectRect = ref(null)         // { left, top, width, height }
    const dragStart = ref(null)
    let selectOverlayImage = null        // 選取時的背景截圖

    const messagesContainer = ref(null)

    // ---- Computed ----
    const regionText = computed(() => {
      if (!hasRegion.value) return '未設定'
      const r = region.value
      return `(${r.x}, ${r.y}) ${r.width}×${r.height}`
    })

    const selectRectStyle = computed(() => {
      if (!selectRect.value) return {}
      return {
        left: selectRect.value.left + 'px',
        top: selectRect.value.top + 'px',
        width: selectRect.value.width + 'px',
        height: selectRect.value.height + 'px'
      }
    })

    // ---- Methods ----

    // 1. 開始選取範圍
    async function startRangeSelect() {
      try {
        // 先擷取全螢幕作為選取背景
        const result = await window.electronAPI.captureScreen({ x: 0, y: 0, width: 0, height: 0 })
        if (!result.success) {
          alert('無法擷取螢幕: ' + result.error)
          return
        }
        selectOverlayImage = result.image
        isSelecting.value = true
        selectRect.value = null
        dragStart.value = null

        // 等 DOM 更新後繪製 canvas
        await nextTick()
        drawSelectBackground()
      } catch (err) {
        alert('初始化範圍選取失敗: ' + err.message)
      }
    }

    function drawSelectBackground() {
      const canvas = selectCanvas.value
      if (!canvas || !selectOverlayImage) return

      const container = viewerContainer.value
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight

      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.onload = () => {
        // 等比例縮放
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height
        )
        const w = img.width * scale
        const h = img.height * scale
        const x = (canvas.width - w) / 2
        const y = (canvas.height - h) / 2
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, x, y, w, h)
      }
      img.src = selectOverlayImage
    }

    function getCanvasScale() {
      const canvas = selectCanvas.value
      if (!canvas || !selectOverlayImage) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, imgW: 0, imgH: 0 }

      const img = new Image()
      img.src = selectOverlayImage
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const offsetX = (canvas.width - w) / 2
      const offsetY = (canvas.height - h) / 2

      return {
        scaleX: scale,
        scaleY: scale,
        offsetX,
        offsetY,
        imgW: img.width,
        imgH: img.height
      }
    }

    function onMouseDown(e) {
      const rect = selectCanvas.value.getBoundingClientRect()
      dragStart.value = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
      selectRect.value = {
        left: dragStart.value.x,
        top: dragStart.value.y,
        width: 0,
        height: 0
      }
    }

    function onMouseMove(e) {
      if (!dragStart.value) return
      const rect = selectCanvas.value.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top

      const left = Math.min(dragStart.value.x, currentX)
      const top = Math.min(dragStart.value.y, currentY)
      const width = Math.abs(currentX - dragStart.value.x)
      const height = Math.abs(currentY - dragStart.value.y)

      selectRect.value = { left, top, width, height }
    }

    function onMouseUp() {
      if (!dragStart.value || !selectRect.value) return

      // 將 canvas 座標轉換為原始圖片的座標
      const { scaleX, scaleY, offsetX, offsetY, imgW, imgH } = getCanvasScale()

      const rawX = (selectRect.value.left - offsetX) / scaleX
      const rawY = (selectRect.value.top - offsetY) / scaleY
      const rawW = selectRect.value.width / scaleX
      const rawH = selectRect.value.height / scaleY

      region.value = {
        x: Math.max(0, Math.round(rawX)),
        y: Math.max(0, Math.round(rawY)),
        width: Math.round(rawW),
        height: Math.round(rawH)
      }

      hasRegion.value = true
      isSelecting.value = false
      dragStart.value = null

      // 自動預覽
      capturePreview()
    }

    function cancelSelect() {
      isSelecting.value = false
      selectRect.value = null
      dragStart.value = null
    }

    // 2. 預覽監視畫面
    async function capturePreview() {
      try {
        const result = await window.electronAPI.captureScreen(region.value)
        if (result.success) {
          previewImage.value = result.image
        }
      } catch (err) {
        console.error('預覽失敗:', err)
      }
    }

    // 3. OCR 測試
    async function runOCR() {
      if (!hasRegion.value) return

      ocrRunning.value = true
      ocrResult.value = null

      try {
        // 先擷取畫面
        const captureResult = await window.electronAPI.captureScreen(region.value)
        if (!captureResult.success) {
          ocrResult.value = { text: '', confidence: 0, words: [], error: captureResult.error }
          ocrRunning.value = false
          return
        }

        previewImage.value = captureResult.image

        // 用 Tesseract 辨識中文 (UMD global)
        const worker = await Tesseract.createWorker('chi_tra+chi_sim')

        const { data } = await worker.recognize(captureResult.image)
        await worker.terminate()

        ocrResult.value = {
          text: data.text.trim(),
          confidence: Math.round(data.confidence),
          words: data.words
            .filter(w => w.text.trim())
            .map(w => ({
              text: w.text.trim(),
              confidence: Math.round(w.confidence)
            }))
        }
      } catch (err) {
        ocrResult.value = { text: '', confidence: 0, words: [], error: err.message }
      } finally {
        ocrRunning.value = false
      }
    }

    // 4. 開始/停止監控
    async function toggleMonitor() {
      if (isMonitoring.value) {
        stopMonitor()
      } else {
        startMonitor()
      }
    }

    function startMonitor() {
      isMonitoring.value = true
      doCapture()
    }

    function stopMonitor() {
      isMonitoring.value = false
      if (monitorTimer) {
        clearTimeout(monitorTimer)
        monitorTimer = null
      }
    }

    async function doCapture() {
      if (!isMonitoring.value || !hasRegion.value) return

      try {
        const result = await window.electronAPI.captureScreen(region.value)
        if (!result.success) return

        previewImage.value = result.image

        // OCR (UMD global)
        const worker = await Tesseract.createWorker('chi_tra+chi_sim')
        const { data } = await worker.recognize(result.image)
        await worker.terminate()

        const text = data.text.trim()
        if (text) {
          const now = new Date()
          const timeStr = now.toLocaleTimeString('zh-TW', { hour12: false })
          lastCaptureTime.value = timeStr

          messages.value.push({
            time: timeStr,
            text: text,
            confidence: Math.round(data.confidence)
          })

          // 保持最新在視野內
          await nextTick()
          if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
          }

          ocrResult.value = {
            text: text,
            confidence: Math.round(data.confidence),
            words: data.words
              .filter(w => w.text.trim())
              .map(w => ({
                text: w.text.trim(),
                confidence: Math.round(w.confidence)
              }))
          }
        }
      } catch (err) {
        console.error('監控 OCR 錯誤:', err)
      }

      // 排程下一次
      if (isMonitoring.value) {
        monitorTimer = setTimeout(doCapture, interval.value)
      }
    }

    // 匯出 CSV
    function exportMessages() {
      const header = '時間,留言內容,信心度'
      const rows = messages.value.map(m => `"${m.time}","${m.text}","${m.confidence}"`)
      const csv = [header, ...rows].join('\n')

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ocr-messages-${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    // 清除訊息
    function clearMessages() {
      messages.value = []
      ocrResult.value = null
    }

    // 清理
    window.addEventListener('beforeunload', () => {
      stopMonitor()
    })

    return {
      previewImage, isSelecting, hasRegion, region,
      ocrRunning, ocrResult, isMonitoring, interval,
      messages, lastCaptureTime,
      selectCanvas, viewerContainer, messagesContainer,
      regionText, selectRectStyle, selectRect,
      startRangeSelect, cancelSelect, onMouseDown, onMouseMove, onMouseUp,
      capturePreview, runOCR, toggleMonitor,
      exportMessages, clearMessages
    }
  }
}).mount('#app')