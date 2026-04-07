/**
 * Web Speech API 语音识别工具模块
 * 
 * 简单的 Web Speech API 封装，方便在组件中调用语音识别功能
 * 
 * 浏览器兼容性说明：
 * - Chrome/Edge: 完全支持
 * - Safari: 16+ 版本支持
 * - Firefox: 不支持
 * 
 * 注意事项：
 * - 回调在主线程触发，需注意性能与防抖
 * - 需要用户授权麦克风权限
 * - 部分浏览器可能需要 HTTPS 环境
 */

/**
 * 创建语音识别实例
 * 
 * 封装 Web Speech API，提供统一的接口和错误处理
 * 
 * @param {Object} options - 配置选项
 * @param {string} options.lang - 识别语言，默认为 'zh-CN'（中文）
 * @param {boolean} options.interimResults - 是否返回中间结果，默认为 true
 *   - true: 实时返回识别中的文本（可能不准确）
 *   - false: 只在识别完成时返回结果
 * @param {boolean} options.continuous - 是否连续识别，默认为 true
 *   - true: 识别结束后自动继续（适合长语音）
 *   - false: 识别一次后停止
 * @param {Function} options.onResult - 识别结果回调
 *   - 参数: (transcript: string, isFinal: boolean)
 *   - transcript: 识别出的文本
 *   - isFinal: 是否为最终结果（false 表示中间结果）
 * @param {Function} options.onError - 错误回调
 *   - 参数: (error: string)
 * @param {Function} options.onStart - 开始识别回调
 * @param {Function} options.onEnd - 结束识别回调
 * 
 * @returns {Object} 语音识别实例对象
 *   - isSupported: boolean - 浏览器是否支持语音识别
 *   - start: Function - 开始识别
 *   - stop: Function - 停止识别（等待当前识别完成）
 *   - abort: Function - 中止识别（立即停止）
 * 
 * @example
 * const speech = createSpeechRecognition({
 *   lang: 'zh-CN',
 *   onResult: (text, isFinal) => {
 *     if (isFinal) {
 *       console.log('最终结果:', text)
 *     } else {
 *       console.log('识别中:', text)
 *     }
 *   },
 *   onError: (error) => {
 *     console.error('识别错误:', error)
 *   }
 * })
 * 
 * if (speech.isSupported) {
 *   speech.start()
 * }
 */
export function createSpeechRecognition(options = {}) {
  // 检测浏览器是否支持语音识别 API
  // 兼容不同浏览器的前缀（webkit 为 Safari/Chrome 旧版本）
  const SpeechRecognition =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition || null)

  // 如果不支持，返回一个空实现（避免组件报错）
  if (!SpeechRecognition) {
    return {
      isSupported: false, // 标记为不支持
      start: () => {}, // 空函数，调用不会报错
      stop: () => {},
      abort: () => {},
    }
  }

  // 解构配置选项，使用默认值
  const {
    lang = 'zh-CN', // 默认中文识别
    interimResults = true, // 默认返回中间结果
    continuous = true, // 默认连续识别
    onResult = () => {}, // 默认空回调
    onError = () => {},
    onStart = () => {},
    onEnd = () => {},
  } = options

  // 创建语音识别实例
  const recognition = new SpeechRecognition()
  recognition.lang = lang // 设置识别语言
  recognition.interimResults = interimResults // 是否返回中间结果
  recognition.continuous = continuous // 是否连续识别
  recognition.maxAlternatives = 1 // 每个结果只返回一个最佳匹配

  // 绑定事件处理器
  recognition.onstart = () => onStart() // 识别开始
  recognition.onend = () => onEnd() // 识别结束

  recognition.onerror = (event) => {
    // 错误处理：提取错误信息并传递给回调
    onError(event.error || 'unknown')
  }

  recognition.onresult = (event) => {
    // 识别结果处理
    // event.results 是一个数组，包含所有识别结果
    // 取最后一条结果（最新的识别内容）
    const result = event.results[event.results.length - 1]
    // 提取识别文本（去除首尾空格）
    const transcript = result[0]?.transcript?.trim() || ''
    // 判断是否为最终结果
    const isFinal = result.isFinal
    // 调用结果回调
    onResult(transcript, isFinal)
  }

  /**
   * 开始识别
   * 
   * 如果识别已在运行中，部分浏览器会抛出错误
   * 这里捕获错误并静默处理，由 onstart/onend 事件维护状态
   */
  const start = () => {
    try {
      recognition.start()
    } catch {
      // 部分浏览器在已启动状态再次 start 会抛错
      // 静默处理，交给 onstart/onend 维护状态
      // 这种情况通常发生在快速连续点击时
    }
  }

  /**
   * 停止识别
   * 
   * 等待当前识别完成后再停止（比 abort 更温和）
   */
  const stop = () => {
    try {
      recognition.stop()
    } catch {
      // 忽略错误（可能识别已停止）
      /* ignore */
    }
  }

  /**
   * 中止识别
   * 
   * 立即停止识别，不等待当前识别完成
   */
  const abort = () => {
    try {
      recognition.abort()
    } catch {
      // 忽略错误
      /* ignore */
    }
  }

  // 返回封装后的接口
  return {
    isSupported: true, // 标记为支持
    start, // 开始识别
    stop, // 停止识别
    abort, // 中止识别
  }
}

