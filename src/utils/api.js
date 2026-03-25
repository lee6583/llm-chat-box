import { useSettingStore } from '@/stores/setting'

/**
 * LLM 接口封装模块
 *
 * 统一负责拼装请求参数、附加认证信息以及处理 Mock 逻辑
 * 提供与后端 LLM API 交互的统一接口，支持流式和非流式两种模式
 * 支持异常重连策略：指数退避、超时重试、jitter 抖动
 */

/**
 * 获取 API 基础 URL
 *
 * 优先级：
 * 1. 用户在设置面板填写的 apiBaseUrl
 * 2. 环境变量 VITE_API_BASE_URL
 * 3. 内置默认值
 */
const getApiBaseUrl = (settingStore) => {
  const fromSetting = (settingStore?.settings?.apiBaseUrl || '').trim()
  if (fromSetting) return fromSetting
  const fromEnv = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (fromEnv) return fromEnv
  return 'https://zrocode.site/v1'
}

/**
 * 默认代理 API Key（用于“开箱即用”）
 *
 * 优先读取环境变量，未配置时使用内置默认值。
 * 用户在设置面板中手动填写 API Key 后会覆盖此默认值。
 */
const DEFAULT_API_KEY =
  import.meta.env.VITE_DEFAULT_API_KEY || import.meta.env.VITE_API_KEY || ''

// 代理服务返回“没有可用模型”时使用的错误标识
const NO_AVAILABLE_MODELS_CODE = 'NO_AVAILABLE_MODELS'

// /v1/models 结果缓存，避免每次发送都额外请求
const MODEL_CACHE_TTL = 30 * 1000
const modelCache = {
  cacheKey: '',
  expiresAt: 0,
  models: null,
}

/**
 * 重试配置常量
 */
const RETRY_CONFIG = {
  // 最大重试次数
  MAX_RETRIES: 3,
  // 初始延迟时间（毫秒）
  INITIAL_DELAY: 1000,
  // 最大延迟时间（毫秒）
  MAX_DELAY: 30000,
  // 指数退避的底数
  BACKOFF_MULTIPLIER: 2,
  // 超时时间（毫秒）
  TIMEOUT: 60000,
  // Jitter 抖动范围（0-1），表示随机抖动占延迟时间的比例
  JITTER_RANGE: 0.3,
}

const trimTrailingSlash = (value) => value.replace(/\/+$/, '')
const getApiUrl = (baseUrl, path) => `${trimTrailingSlash(baseUrl)}${path}`

const getCompletionTokens = (usage) => {
  if (!usage) return 0
  if (typeof usage.completion_tokens === 'number') return usage.completion_tokens
  if (typeof usage.output_tokens === 'number') return usage.output_tokens
  if (typeof usage.completionTokens === 'number') return usage.completionTokens
  return 0
}

const toResponsesInputMessage = (message) => {
  if (!message || typeof message !== 'object') return message
  const role = message.role
  const content = message.content

  // Responses API supports `input` as a list of messages. For multimodal, `content` can be an array
  // of input items (e.g. {type:"input_text", text}, {type:"input_image", image_url}).
  if (typeof content === 'string') {
    return { role, content }
  }

  if (!Array.isArray(content)) {
    return { role, content: String(content ?? '') }
  }

  const mapped = content
    .map((part) => {
      if (!part || typeof part !== 'object') return null
      if (part.type === 'text') {
        return { type: 'input_text', text: part.text ?? '' }
      }
      if (part.type === 'image_url') {
        const url = part.image_url?.url
        if (!url) return null
        return { type: 'input_image', image_url: url }
      }
      // Pass-through if it's already in a supported/compatible format.
      if (typeof part.type === 'string') return part
      return null
    })
    .filter(Boolean)

  // Prefer array content when we have any multimodal parts; otherwise fall back to a merged string.
  if (mapped.length > 0) {
    return { role, content: mapped }
  }

  return { role, content: '' }
}

/**
 * 判断错误是否可重试
 *
 * @param {Error} error - 错误对象
 * @param {number} status - HTTP 状态码（如果有）
 * @returns {boolean} 是否可重试
 */
const isRetryableError = (error, status) => {
  const errorMessage = error?.message?.toLowerCase?.() || ''

  // 配置类错误（模型/provider 不存在）不应重试
  if (
    errorMessage.includes('unknown provider for model') ||
    errorMessage.includes(NO_AVAILABLE_MODELS_CODE.toLowerCase())
  ) {
    return false
  }

  // 网络错误、超时错误可以重试
  if (
    error.message.includes('network') ||
    error.message.includes('fetch') ||
    error.message.includes('timeout') ||
    error.name === 'TimeoutError' ||
    error.name === 'TypeError'
  ) {
    return true
  }

  // 5xx 服务器错误可以重试
  if (status >= 500 && status < 600) {
    return true
  }

  // 429 请求频率过高可以重试
  if (status === 429) {
    return true
  }

  // 408 请求超时可以重试
  if (status === 408) {
    return true
  }

  // 4xx 客户端错误（除了上面提到的）不应该重试
  // 401、403 等认证/授权错误不应该重试
  return false
}

/**
 * 计算延迟时间（指数退避 + jitter 抖动）
 *
 * @param {number} attempt - 当前尝试次数（从 0 开始）
 * @returns {number} 延迟时间（毫秒）
 */
const calculateDelay = (attempt) => {
  // 指数退避：delay = INITIAL_DELAY * (BACKOFF_MULTIPLIER ^ attempt)
  const exponentialDelay = RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt)

  // 限制最大延迟时间
  const cappedDelay = Math.min(exponentialDelay, RETRY_CONFIG.MAX_DELAY)

  // Jitter 抖动：在延迟时间的基础上添加随机抖动
  // 抖动范围：[-JITTER_RANGE * cappedDelay, JITTER_RANGE * cappedDelay]
  const jitter = (Math.random() * 2 - 1) * RETRY_CONFIG.JITTER_RANGE * cappedDelay

  // 最终延迟时间 = 指数退避延迟 + 抖动
  const finalDelay = cappedDelay + jitter

  // 确保延迟时间不为负数
  return Math.max(0, Math.round(finalDelay))
}

/**
 * 延迟指定时间
 *
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise<void>}
 */
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带超时的 fetch 请求
 *
 * @param {string} url - 请求 URL
 * @param {RequestInit} options - 请求选项
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = async (url, options, timeout) => {
  // 创建 AbortController 用于取消请求
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    // 如果是超时错误，包装成 TimeoutError
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout}ms）`)
    }
    throw error
  }
}

/**
 * 判断是否为 Mock API Key
 *
 * 当 API Key 以 "mock-" 开头时，视为 Mock 模式，返回假数据而不请求真实接口
 * 用于演示和开发测试场景
 *
 * @param {string} key - API Key 字符串
 * @returns {boolean} 是否为 Mock Key
 */
const isMockKey = (key) => typeof key === 'string' && key.startsWith('mock-')

/**
 * 创建 Mock 响应数据
 *
 * 根据流式/非流式模式返回不同格式的假数据
 * 用于在无真实 API Key 时演示前端效果
 *
 * @param {boolean} isStream - 是否为流式响应
 * @returns {Response|Object} 流式时返回 Response 对象，非流式时返回 JSON 对象
 */
const createMockResponse = (isStream) => {
  if (isStream) {
    // 模拟 Responses API 的 SSE 流式响应，方便在无真实 Key 时演示前端效果
    const body = [
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '这是 Mock 流式响应片段1。' })}\n\n`,
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '这是 Mock 流式响应片段2。' })}\n\n`,
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: { usage: { output_tokens: 10 } },
      })}\n\n`,
    ].join('')
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  // 非流式模式下直接返回一次性完整响应（Responses API 风格）
  return {
    output_text: '这是 Mock 完整响应。',
    usage: { output_tokens: 10 },
    speed: 5, // Mock 速度值
  }
}

/**
 * 获取最终生效的 API Key
 *
 * 规则：
 * 1. 用户在设置中填写了 API Key：使用用户输入
 * 2. 用户未填写：使用内置默认 Key（免配置可直接对话）
 *
 * @param {string} key - 用户输入的 API Key
 * @returns {string} 生效的 API Key
 */
const getEffectiveApiKey = (key) => {
  if (typeof key !== 'string') return DEFAULT_API_KEY
  const trimmed = key.trim()
  return trimmed || DEFAULT_API_KEY
}

const parseModelList = (payload) => {
  if (!Array.isArray(payload?.data)) return null

  const models = payload.data
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item.id === 'string') return item.id
      return ''
    })
    .filter(Boolean)

  return Array.from(new Set(models))
}

const fetchAvailableModels = async (apiKey) => {
  if (isMockKey(apiKey)) return null
  const settingStore = useSettingStore()
  const apiBaseUrl = getApiBaseUrl(settingStore)

  const cacheKey = `${trimTrailingSlash(apiBaseUrl)}|${apiKey}`
  const now = Date.now()
  if (modelCache.cacheKey === cacheKey && now < modelCache.expiresAt && modelCache.models) {
    return modelCache.models
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const response = await fetchWithTimeout(
      getApiUrl(apiBaseUrl, '/models'),
      {
        method: 'GET',
        headers,
      },
      15000,
    )

    if (!response.ok) return null

    const data = await response.json().catch(() => null)
    const models = parseModelList(data)
    if (!models) return null

    modelCache.cacheKey = cacheKey
    modelCache.expiresAt = now + MODEL_CACHE_TTL
    modelCache.models = models
    return models
  } catch (error) {
    console.warn('[Model Discovery] 获取模型列表失败，将继续使用当前模型:', error?.message)
    return null
  }
}

const resolveModelForRequest = async (currentModel, apiKey) => {
  const models = await fetchAvailableModels(apiKey)

  // 模型发现失败时，不阻断请求（保持兼容）
  if (!Array.isArray(models)) {
    return currentModel
  }

  // 模型列表为空：明确提示用户先在 CPA-Dashboard 配置 provider
  if (models.length === 0) {
    throw new Error(
      `${NO_AVAILABLE_MODELS_CODE}: 当前 API Key 没有可用模型，请先在 CPA-Dashboard 的 CLIProxyAPI 中配置并启用 Provider/模型别名。`,
    )
  }

  if (models.includes(currentModel)) {
    return currentModel
  }

  // 当前模型不可用时，自动切到第一个可用模型，避免用户手动排错
  return models[0]
}

/**
 * 发起聊天补全请求（带重试机制）
 *
 * ChatView 和 SearchDialog 统一通过此方法调用后端 LLM API
 * 自动从设置 store 读取配置参数，组装完整的请求
 * 支持异常重连策略：指数退避、超时重试、jitter 抖动
 *
 * @param {Array<Object>} messages - 消息历史数组，每个元素包含 role 和 content
 *   - role: 'user' | 'assistant' | 'system'
 *   - content: 消息内容
 *
 * @returns {Promise<Response|Object>}
 *   - 流式模式：返回 Response 对象（ReadableStream）
 *   - 非流式模式：返回解析后的 JSON 对象
 *
 * @throws {Error} 当 HTTP 请求失败且重试次数用尽时抛出错误
 *
 * @description
 * 请求参数说明：
 * - model: 模型名称（从设置 store 读取）
 * - input: 对话历史（Responses API 形式）
 * - stream: 是否流式响应
 * - max_output_tokens: 最大输出 token 数
 * - temperature: 温度参数（0-2），控制随机性
 * - top_p: 核采样阈值（0-1）
 *
 * 重试策略：
 * - 最大重试次数：3 次
 * - 指数退避：初始延迟 1s，每次重试延迟时间翻倍（最大 30s）
 * - Jitter 抖动：在延迟时间基础上添加 ±30% 的随机抖动
 * - 超时控制：单次请求超时时间 60s
 * - 可重试错误：网络错误、5xx 服务器错误、429 请求频率过高、408 请求超时
 *
 * @example
 * const messages = [
 *   { role: 'user', content: '你好' },
 *   { role: 'assistant', content: '你好！有什么可以帮助你的吗？' }
 * ]
 * const response = await createChatCompletion(messages)
 */
export const createChatCompletion = async (messages) => {
  // 获取设置 store 实例
  const settingStore = useSettingStore()
  const apiBaseUrl = getApiBaseUrl(settingStore)
  const effectiveApiKey = getEffectiveApiKey(settingStore.settings.apiKey)
  const resolvedModel = await resolveModelForRequest(settingStore.settings.model, effectiveApiKey)

  // 自动修正为可用模型，并同步到设置
  if (resolvedModel !== settingStore.settings.model) {
    console.warn(
      `[Model Auto-Switch] 当前模型 ${settingStore.settings.model} 不可用，已切换为 ${resolvedModel}`,
    )
    settingStore.settings.model = resolvedModel
  }

  // 从设置 store 中读取当前模型与采样参数，组装请求体
  const payload = {
    model: resolvedModel, // 模型名称（若不可用会自动切换）
    input: Array.isArray(messages) ? messages.map(toResponsesInputMessage) : messages, // Responses API 输入
    stream: settingStore.settings.stream, // 是否启用流式响应
    max_output_tokens: settingStore.settings.maxTokens, // Responses API: 最大输出 token 数
    temperature: settingStore.settings.temperature, // 温度参数（0-2）
    top_p: settingStore.settings.topP, // 核采样阈值（0-1）
  }

  // 构造请求选项
  const options = {
    method: 'POST', // HTTP 方法
    headers: {
      'Content-Type': 'application/json', // 请求体为 JSON
    },
    body: JSON.stringify(payload), // 将请求体序列化为 JSON 字符串
  }
  if (effectiveApiKey) {
    // 使用 Bearer Token 传递 API Key，兼容大部分 LLM 网关（OpenAI 格式）
    options.headers.Authorization = `Bearer ${effectiveApiKey}`
  }

  // Mock 分支：以 mock- 开头的 key 直接返回假数据，不请求真实接口
  if (isMockKey(effectiveApiKey)) {
    return createMockResponse(settingStore.settings.stream)
  }

  // 记录请求开始时间，用于计算响应速度
  const startTime = Date.now()
  let lastError = null
  let lastStatus = null

  // 重试循环
  for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
    try {
      // 如果不是第一次尝试，先延迟（指数退避 + jitter）
      if (attempt > 0) {
        const delay = calculateDelay(attempt - 1)
        console.log(`[Retry ${attempt}/${RETRY_CONFIG.MAX_RETRIES}] 等待 ${delay}ms 后重试...`)
        await sleep(delay)
      }

      // 发起 HTTP 请求（带超时控制）
      const response = await fetchWithTimeout(
        getApiUrl(apiBaseUrl, '/responses'),
        options,
        RETRY_CONFIG.TIMEOUT,
      )

      // 检查响应状态，非 2xx 状态码视为错误
      if (!response.ok) {
        lastStatus = response.status

        // 尝试读取错误响应体（如果有）
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const contentType = response.headers.get('content-type') || ''
          const errorData = contentType.includes('application/json')
            ? await response.json().catch(() => null)
            : null
          if (errorData?.error?.message) {
            errorMessage = `${errorMessage} - ${errorData.error.message}`
          } else if (errorData?.message) {
            errorMessage = `${errorMessage} - ${errorData.message}`
          } else if (!errorData) {
            const text = await response.text().catch(() => '')
            if (text) {
              errorMessage = `${errorMessage} - ${text.slice(0, 300)}`
            }
          }

          // 这类错误是配置问题，不是瞬时故障，标记后供上层输出更明确提示
          if (typeof errorMessage === 'string' && errorMessage.includes('unknown provider for model')) {
            errorMessage = `${errorMessage} [UNKNOWN_PROVIDER_FOR_MODEL]`
          }
        } catch {
          // 如果无法解析错误响应，使用默认错误信息
        }

        lastError = new Error(errorMessage)

        // 判断是否可重试
        if (isRetryableError(lastError, lastStatus) && attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.warn(`[Retry ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES}] 请求失败，将重试:`, errorMessage)
          continue // 继续重试
        } else {
          // 不可重试或重试次数用尽，抛出错误
          throw lastError
        }
      }

      // 请求成功，根据流式/非流式模式返回不同格式的数据
      if (settingStore.settings.stream) {
        // 某些网关在 stream=true 时仍会返回 JSON 错误，这里先兜底解析并抛出，避免前端“读流但没有任何内容”
        const contentType = response.headers.get('content-type') || ''
        if (response.ok && contentType.includes('application/json')) {
          const data = await response.json().catch(() => null)
          if (data?.error?.message) {
            throw new Error(data.error.message)
          }
          if (data?.message) {
            throw new Error(data.message)
          }
        }
        // 流式响应：直接把 Response 返回给上层，由 messageHandler 负责读取处理流
        // 注意：流式响应中也可能包含错误信息（在 SSE 数据中），由 messageHandler 处理
        return response
      } else {
        // 非流式响应：一次性解析 JSON，并计算 tokens/s 速度指标，返回解析后的数据对象
        const data = await response.json()
        if (data?.error?.message) {
          throw new Error(data.error.message)
        }
        // 计算响应耗时（秒）
        const duration = (Date.now() - startTime) / 1000
        const tokens = getCompletionTokens(data.usage)
        // 计算响应速度：tokens / 耗时（秒），保留 2 位小数
        data.speed = duration > 0 && tokens > 0 ? (tokens / duration).toFixed(2) : '0'
        return data
      }
    } catch (error) {
      lastError = error

      // 判断是否可重试
      if (isRetryableError(error, lastStatus) && attempt < RETRY_CONFIG.MAX_RETRIES) {
        console.warn(
          `[Retry ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES}] 请求失败，将重试:`,
          error.message,
        )
        // 继续重试循环
        continue
      } else {
        // 不可重试或重试次数用尽，记录错误并抛出
        console.error(`[Chat API Error] 重试 ${attempt} 次后仍然失败:`, error)
        throw error
      }
    }
  }

  // 理论上不会执行到这里，但为了类型安全，抛出最后的错误
  throw lastError || new Error('请求失败：未知错误')
}
