const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_FILE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_CHARS_PER_FILE = 12000
const MAX_TOTAL_TEXT_CHARS = 50000

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'js',
  'ts',
  'jsx',
  'tsx',
  'html',
  'xml',
  'yaml',
  'yml',
  'log',
  'sql',
  'py',
  'java',
  'go',
  'rs',
  'css',
  'scss',
])

const getExtension = (name = '') => {
  const index = name.lastIndexOf('.')
  if (index === -1) return ''
  return name.slice(index + 1).toLowerCase()
}

const isImageFile = (file) => typeof file?.type === 'string' && file.type.startsWith('image/')

const isTextLikeFile = (file) => {
  if (!file) return false
  if (typeof file.type === 'string' && file.type.startsWith('text/')) return true
  return TEXT_FILE_EXTENSIONS.has(getExtension(file.name))
}

const truncateText = (text, maxChars, suffix) => {
  if (text.length <= maxChars) {
    return { text, truncated: false }
  }
  return {
    text: `${text.slice(0, maxChars)}\n${suffix}`,
    truncated: true,
  }
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`读取图片失败：${file.name}`))
    reader.readAsDataURL(file)
  })

const stripBom = (text = '') => text.replace(/^\uFEFF/, '')

const tryDecodeText = (bytes, encoding, options = {}) => {
  try {
    return new TextDecoder(encoding, options).decode(bytes)
  } catch {
    return null
  }
}

const readTextFile = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer())

  const utf8 = tryDecodeText(bytes, 'utf-8', { fatal: false })
  if (utf8 && !utf8.includes('\uFFFD')) {
    return stripBom(utf8)
  }

  for (const encoding of ['gb18030', 'big5', 'shift_jis']) {
    const decoded = tryDecodeText(bytes, encoding, { fatal: false })
    if (decoded && !decoded.includes('\uFFFD')) {
      return stripBom(decoded)
    }
  }

  if (utf8) {
    return stripBom(utf8)
  }

  if (typeof file.text === 'function') {
    return stripBom(await file.text())
  }

  return ''
}

const readPdfText = async (file) => {
  const pdfjsLib = await import('pdfjs-dist')
  const pdfWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise

  let result = ''
  for (let page = 1; page <= pdf.numPages; page++) {
    const pageObj = await pdf.getPage(page)
    const content = await pageObj.getTextContent()
    const pageText = content.items
      .map((item) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (pageText) {
      result += `\n[PDF 第 ${page} 页]\n${pageText}\n`
    }
  }

  return result.trim()
}

const readDocxText = async (file) => {
  const mammothModule = await import('mammoth/mammoth.browser.js')
  const mammoth = mammothModule.default || mammothModule
  const { value } = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  })
  return (value || '').trim()
}

const buildTextPart = (fileName, text) => ({
  type: 'text',
  text: `附件文件：${fileName}\n${text}`,
})

const buildReportItem = (name, status, detail, extra = {}) => ({
  name,
  status,
  detail,
  ...extra,
})

export const getAttachmentQuickHint = (fileLike = {}) => {
  const name = fileLike.name || '未命名文件'
  const size = Number(fileLike.size || 0)
  const type = fileLike.raw?.type || fileLike.type || ''
  const raw = fileLike.raw || fileLike

  if (typeof type === 'string' && type.startsWith('image/')) {
    return size > MAX_IMAGE_SIZE_BYTES
      ? buildReportItem(name, 'warning', '图片超过 5MB，发送时会被忽略')
      : buildReportItem(name, 'image', '图片会按视觉内容发送给模型')
  }

  const ext = getExtension(name)
  if (size > MAX_TEXT_FILE_SIZE_BYTES) {
    return buildReportItem(name, 'warning', '文件超过 5MB，发送时会被忽略')
  }
  if (ext === 'doc') {
    return buildReportItem(name, 'warning', '.doc 无法稳定提取，建议转为 .docx / .txt')
  }
  if (ext === 'pdf' || ext === 'docx' || isTextLikeFile(raw)) {
    return buildReportItem(name, 'success', '发送时会自动提取文本内容')
  }
  return buildReportItem(name, 'warning', '该类型暂不支持自动提取')
}

export const buildApiContentFromAttachments = async (inputText, files = []) => {
  const text = (inputText || '').trim()
  const parts = []
  const warnings = []
  const reportItems = []
  const messageFiles = []
  let totalTextChars = 0
  let extractedCount = 0
  let truncatedCount = 0
  let imageCount = 0

  if (text) {
    parts.push({ type: 'text', text })
  }

  for (const item of files) {
    const file = item?.raw
    const fileName = item?.name || file?.name || '未命名文件'
    if (!file) continue
    const fallbackMessageFile = {
      name: fileName,
      type: 'file',
      size: file.size || 0,
    }

    if (isImageFile(file)) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        const detail = `${fileName} 超过 5MB，未发送图片内容`
        warnings.push(detail)
        reportItems.push(buildReportItem(fileName, 'warning', detail))
        messageFiles.push(fallbackMessageFile)
        continue
      }
      const imageUrl = await readFileAsDataUrl(file)
      parts.push({ type: 'image_url', image_url: { url: imageUrl } })
      messageFiles.push({
        ...fallbackMessageFile,
        type: 'image',
        url: imageUrl,
      })
      imageCount += 1
      reportItems.push(buildReportItem(fileName, 'image', '图片已附带发送'))
      continue
    }

    messageFiles.push(fallbackMessageFile)

    if (file.size > MAX_TEXT_FILE_SIZE_BYTES) {
      const detail = `${fileName} 超过 5MB，未提取文本内容`
      warnings.push(detail)
      reportItems.push(buildReportItem(fileName, 'warning', detail))
      continue
    }

    let extractedText = ''
    const ext = getExtension(fileName)

    try {
      if (ext === 'pdf') {
        extractedText = await readPdfText(file)
      } else if (ext === 'docx') {
        extractedText = await readDocxText(file)
      } else if (ext === 'doc') {
        const detail = `${fileName} 为 .doc 格式，浏览器端无法稳定提取，请转换为 .docx 或 .txt`
        warnings.push(detail)
        reportItems.push(buildReportItem(fileName, 'warning', detail))
        continue
      } else if (isTextLikeFile(file)) {
        extractedText = await readTextFile(file)
      } else {
        const detail = `${fileName} 文件类型暂不支持自动提取`
        warnings.push(detail)
        reportItems.push(buildReportItem(fileName, 'warning', detail))
        continue
      }
    } catch (error) {
      const detail = `${fileName} 提取失败：${error?.message || '未知错误'}`
      warnings.push(detail)
      reportItems.push(buildReportItem(fileName, 'warning', detail))
      continue
    }

    const normalized = (extractedText || '').trim()
    if (!normalized) {
      const detail = `${fileName} 未提取到可读文本`
      warnings.push(detail)
      reportItems.push(buildReportItem(fileName, 'warning', detail))
      continue
    }

    let { text: finalText, truncated } = truncateText(
      normalized,
      MAX_TEXT_CHARS_PER_FILE,
      '...[该文件内容过长，已截断]',
    )

    const remaining = MAX_TOTAL_TEXT_CHARS - totalTextChars
    if (remaining <= 0) {
      const detail = '附件总文本长度超限，后续文件已忽略'
      warnings.push(detail)
      reportItems.push(buildReportItem(fileName, 'warning', detail))
      break
    }

    if (finalText.length > remaining) {
      const truncatedResult = truncateText(finalText, remaining, '...[附件总长度超限，已截断]')
      finalText = truncatedResult.text
      truncated = true
      warnings.push('附件总文本长度超限，部分内容被截断')
    }

    totalTextChars += finalText.length
    extractedCount += 1
    if (truncated) truncatedCount += 1
    parts.push(buildTextPart(fileName, finalText))
    reportItems.push(
      buildReportItem(
        fileName,
        truncated ? 'warning' : 'success',
        truncated ? '文本已提取，内容过长已截断' : '文本提取成功',
        { extractedChars: finalText.length },
      ),
    )
  }

  if (warnings.length > 0) {
    parts.push({
      type: 'text',
      text: `附件处理提示：\n- ${warnings.join('\n- ')}`,
    })
  }

  if (parts.length === 0) {
    return {
      apiContent: '',
      displayText: '',
      attachmentReport: {
        summary: '未检测到可发送的文本或附件内容',
        items: reportItems,
        warnings,
      },
      messageFiles,
    }
  }

  const hasImagePart = parts.some((part) => part.type === 'image_url')
  const hasTextPart = parts.some((part) => part.type === 'text')

  if (hasImagePart && !hasTextPart) {
    parts.unshift({ type: 'text', text: '请结合我上传的图片回答。' })
  } else if (hasImagePart && !text) {
    parts.unshift({ type: 'text', text: '请结合我上传的附件内容回答。' })
  }

  const fileNames = files.map((file) => file.name).filter(Boolean)
  const displayText = text || (fileNames.length > 0 ? `已发送附件：${fileNames.join('、')}` : '')

  const summarySegments = []
  if (extractedCount > 0) summarySegments.push(`已提取 ${extractedCount} 个文本附件`)
  if (imageCount > 0) summarySegments.push(`已发送 ${imageCount} 张图片`)
  if (truncatedCount > 0) summarySegments.push(`${truncatedCount} 个附件被截断`)
  if (warnings.length > 0) summarySegments.push(`${warnings.length} 条处理提醒`)

  const attachmentReport = {
    summary: summarySegments.length > 0 ? summarySegments.join('，') : '附件已准备就绪',
    items: reportItems,
    warnings,
    extractedCount,
    imageCount,
    truncatedCount,
  }

  if (!hasImagePart) {
    const mergedText = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n\n')

    return {
      apiContent: mergedText,
      displayText,
      attachmentReport,
      messageFiles,
    }
  }

  return {
    apiContent: parts,
    displayText,
    attachmentReport,
    messageFiles,
  }
}
