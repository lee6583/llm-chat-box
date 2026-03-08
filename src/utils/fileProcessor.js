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
  const ext = getExtension(file.name)
  return TEXT_FILE_EXTENSIONS.has(ext)
}

const truncateText = (text, maxChars, suffix) => {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n${suffix}`
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`读取图片失败：${file.name}`))
    reader.readAsDataURL(file)
  })

const readTextFile = async (file) => {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return ''
}

const readPdfText = async (file) => {
  const pdfjsLib = await import('pdfjs-dist')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    disableWorker: true,
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
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  })
  return (value || '').trim()
}

const buildTextPart = (fileName, text) => ({
  type: 'text',
  text: `附件文件：${fileName}\n${text}`,
})

export const buildApiContentFromAttachments = async (inputText, files = []) => {
  const text = (inputText || '').trim()
  const parts = []
  const warnings = []
  let totalTextChars = 0

  if (text) {
    parts.push({ type: 'text', text })
  }

  for (const item of files) {
    const file = item?.raw
    const fileName = item?.name || file?.name || '未命名文件'
    if (!file) continue

    if (isImageFile(file)) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        warnings.push(`${fileName} 超过 5MB，未发送图片内容`)
        continue
      }
      const imageUrl = await readFileAsDataUrl(file)
      parts.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      })
      continue
    }

    if (file.size > MAX_TEXT_FILE_SIZE_BYTES) {
      warnings.push(`${fileName} 超过 5MB，未提取文本内容`)
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
        warnings.push(`${fileName} 为 .doc 格式，浏览器端无法稳定提取，请转换为 .docx 或 .txt`)
        continue
      } else if (isTextLikeFile(file)) {
        extractedText = await readTextFile(file)
      } else {
        warnings.push(`${fileName} 文件类型暂不支持自动提取`)
        continue
      }
    } catch (error) {
      warnings.push(`${fileName} 提取失败：${error?.message || '未知错误'}`)
      continue
    }

    const normalized = (extractedText || '').trim()
    if (!normalized) {
      warnings.push(`${fileName} 未提取到可读文本`)
      continue
    }

    let finalText = truncateText(
      normalized,
      MAX_TEXT_CHARS_PER_FILE,
      '...[该文件内容过长，已截断]',
    )

    const remaining = MAX_TOTAL_TEXT_CHARS - totalTextChars
    if (remaining <= 0) {
      warnings.push('附件总文本长度超限，后续文件已忽略')
      break
    }

    if (finalText.length > remaining) {
      finalText = truncateText(finalText, remaining, '...[附件总长度超限，已截断]')
      warnings.push('附件总文本长度超限，部分内容被截断')
    }

    totalTextChars += finalText.length
    parts.push(buildTextPart(fileName, finalText))
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

  if (!hasImagePart) {
    const mergedText = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n\n')

    return {
      apiContent: mergedText,
      displayText,
    }
  }

  return {
    apiContent: parts,
    displayText,
  }
}
