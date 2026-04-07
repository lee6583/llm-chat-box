import { createChatCompletion } from '@/utils/api'
import { messageHandler } from '@/utils/messageHandler'

const STREAM_RETRY_CONFIG = {
  MAX_RETRIES: 2,
  INITIAL_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY: 15000,
  JITTER_RANGE: 0.3,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const calculateStreamRetryDelay = (attempt) => {
  const baseDelay =
    STREAM_RETRY_CONFIG.INITIAL_DELAY *
    Math.pow(STREAM_RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt)
  const cappedDelay = Math.min(baseDelay, STREAM_RETRY_CONFIG.MAX_DELAY)
  const jitter =
    (Math.random() * 2 - 1) * STREAM_RETRY_CONFIG.JITTER_RANGE * cappedDelay
  return Math.max(0, Math.round(cappedDelay + jitter))
}

const isRetryableStreamError = (error) => {
  if (!error?.message) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('流读取失败') ||
    message.includes('network') ||
    message.includes('网络') ||
    message.includes('timeout') ||
    message.includes('超时')
  )
}

export const sendChatRequest = async (
  messages,
  { isStream, onUpdate, onError = null } = {},
) => {
  const maxAttempts = isStream ? STREAM_RETRY_CONFIG.MAX_RETRIES + 1 : 1
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = calculateStreamRetryDelay(attempt - 1)
      console.warn(
        `[Stream Retry ${attempt}/${STREAM_RETRY_CONFIG.MAX_RETRIES}] 等待 ${delay}ms 后重试...`,
      )
      await sleep(delay)
    }

    try {
      const response = await createChatCompletion(messages)
      await messageHandler.handleResponse(response, isStream, onUpdate, onError)
      return
    } catch (error) {
      lastError = error
      console.error(`Chat request attempt ${attempt} failed:`, error)

      if (!isStream || !isRetryableStreamError(error) || attempt >= STREAM_RETRY_CONFIG.MAX_RETRIES) {
        throw error
      }
    }
  }

  if (lastError) throw lastError
}

export const mapChatRequestErrorToMessage = (error) => {
  if (!error?.message) {
    return '抱歉，发生了一些错误，请稍后重试'
  }

  if (error.message.includes('NO_AVAILABLE_MODELS')) {
    return '当前 API Key 在 CLIProxyAPI 中没有可用模型。请先在 CPA-Dashboard 配置并启用 Provider/模型别名，然后重试。'
  }

  if (
    error.message.includes('unknown provider for model') ||
    error.message.includes('UNKNOWN_PROVIDER_FOR_MODEL')
  ) {
    const modelMatch = error.message.match(/unknown provider for model ([^\s\]]+)/i)
    const modelText = modelMatch?.[1] ? `（${modelMatch[1]}）` : ''
    return `模型${modelText}未在 CLIProxyAPI 中绑定可用 Provider，请到 CPA-Dashboard 检查模型映射后重试。`
  }

  if (error.message.includes('HTTP error')) {
    const statusMatch = error.message.match(/status: (\d+)/)
    if (statusMatch) {
      const status = statusMatch[1]
      if (status === '401') {
        return '未授权 (401)：请检查 API Key 是否填写正确，以及 API Base URL 是否指向正确网关'
      }
      if (status === '429') {
        return '请求过于频繁，请稍后再试'
      }
      if (status === '500' || status === '502' || status === '503') {
        return '服务器暂时不可用，请稍后重试'
      }
      return `服务器错误 (${status})，请稍后重试`
    }
    return `请求失败: ${error.message}`
  }

  if (
    error.message.includes('Failed to fetch') ||
    error.message.includes('network') ||
    error.message.includes('网络')
  ) {
    return '网络连接失败或中断，请检查网络设置后重试'
  }

  if (error.message.includes('解析错误') || error.message.includes('JSON')) {
    return '数据格式错误，请稍后重试'
  }

  return `错误: ${error.message}`
}
