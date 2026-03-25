/**
 * 消息处理工具模块
 *
 * 统一构造消息格式，并封装流式/非流式响应的解析逻辑
 * 提供标准化的消息对象构造和响应处理能力，供 ChatView 和 SearchDialog 组件复用
 */

const getCompletionTokens = (usage) => {
  if (!usage) return 0
  if (typeof usage.completion_tokens === 'number') return usage.completion_tokens
  if (typeof usage.output_tokens === 'number') return usage.output_tokens
  if (typeof usage.completionTokens === 'number') return usage.completionTokens
  return 0
}

const tryExtractOutputTextFromResponses = (payload) => {
  // Responses API: output_text shortcut
  if (payload && typeof payload.output_text === 'string') return payload.output_text

  const output = payload?.output
  if (!Array.isArray(output)) return ''

  // Prefer assistant message item, fall back to any output_text parts
  const msgItems = output.filter((item) => item && item.type === 'message')
  const assistant = msgItems.find((item) => item.role === 'assistant') || msgItems[0]
  const contentParts = assistant?.content
  if (!Array.isArray(contentParts)) return ''

  return contentParts
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text
      if (typeof part.text === 'string') return part.text
      return ''
    })
    .filter(Boolean)
    .join('')
}

export const messageHandler = {
  /**
   * 构造一条标准化的消息对象
   *
   * @param {string} role - 消息角色：'user' | 'assistant'
   * @param {string} content - 消息正文内容
   * @param {string} reasoning_content - 深度思考内容（可选，默认为空字符串）
   * @param {Array} files - 附件文件列表（可选，默认为空数组）
   * @returns {Object} 标准化的消息对象，包含以下字段：
   *   - id: 消息唯一标识（时间戳）
   *   - role: 消息角色
   *   - content: 消息正文
   *   - reasoning_content: 深度思考内容
   *   - files: 附件列表
   *   - completion_tokens: 完成 token 数（初始为 0）
   *   - speed: 响应速度 tokens/s（初始为 0）
   *   - loading: 加载状态（初始为 false）
   *
   * @example
   * const userMsg = messageHandler.formatMessage('user', '你好', '', [])
   * const assistantMsg = messageHandler.formatMessage('assistant', '你好！', '', [])
   */
  //不管是流式 response对象 还是非流式 json，都统一构造成这个对象
  formatMessage(role, content, reasoning_content = '', files = []) {
    return {
      id: Date.now(), // 使用时间戳作为唯一 ID
      role, // 消息角色
      content, // 消息正文
      reasoning_content, // 深度思考内容（用于 DeepSeek-R1 等支持推理过程的模型）
      files, // 附件列表（图片、文档等）
      completion_tokens: 0, // 完成 token 数，后续由 API 响应填充
      speed: 0, // 响应速度 tokens/s，后续计算得出
      loading: false, // 加载状态，用于显示"内容生成中..."
    }
  },

  /**
   * 处理流式响应（SSE - Server-Sent Events）
   *
   * 逐块读取数据流，实时累加 content 和 reasoning_content，并通过回调通知上层更新 UI
   * 实现实时流式显示效果，提升用户体验
   *
   * @param {Response} response - Fetch API 返回的 Response 对象（流式响应）
   * @param {Function} updateCallback - 更新回调函数，接收以下参数：
   *   - content: 累计的完整消息内容
   *   - reasoning_content: 累计的完整推理内容
   *   - tokens: 当前 token 数
   *   - speed: 当前响应速度 tokens/s
   * @param {Function} errorCallback - 错误回调函数（可选），接收错误信息
   *
   * @returns {Promise<void>} 异步处理完成
   *
   * @description
   * SSE 格式说明：
   * - 每行以 "data: " 开头，后跟 JSON 数据
   * - 流结束时发送 "data: [DONE]"
   * - 每个数据块包含 delta 字段，包含增量内容
   *
   * 错误处理：
   * - JSON 解析错误：跳过无效数据，继续处理后续数据
   * - 流读取错误：捕获异常，调用错误回调
   * - 网络中断：自动清理资源，通知上层
   *
   * @example
   * await messageHandler.handleStreamResponse(
   *   response,
   *   (content, reasoning, tokens, speed) => {
   *     chatStore.updateLastMessage(content, reasoning, tokens, speed)
   *   },
   *   (error) => {
   *     console.error('Stream error:', error)
   *     chatStore.updateLastMessage('流式响应处理出错：' + error.message)
   *   }
   * )
   */
  async handleStreamResponse(response, updateCallback, errorCallback) {
    // 获取 ReadableStream 的读取器，用于逐块读取流数据
    const reader = response.body.getReader()
    // 文本解码器，用于将二进制数据转换为 UTF-8 文本，因为fetch+readStream响应的数据是二进制字节流，所以要解码，而 eventSource 返回的是已经解码好的字符串，它的 API 已经做好了
    const decoder = new TextDecoder()
    // 累计的完整消息内容（用户看到的最终回复）
    let accumulatedContent = ''
    // 累计的完整推理内容（深度思考过程）
    let accumulatedReasoning = ''
    // 记录开始时间，用于计算响应速度
    let startTime = Date.now()
    // 用于处理跨 chunk 的不完整行
    let buffer = ''

    try {
      // 持续读取数据流，直到流结束
      while (true) {
        let readResult
        try {
          // 读取下一个数据块
          readResult = await reader.read()
        } catch (readError) {
          // 流读取错误（网络中断、连接失败等）
          const errorMessage = `流读取失败: ${readError.message || '网络连接中断'}`
          console.error('Stream read error:', readError)
          if (errorCallback) {
            errorCallback(new Error(errorMessage))
          }
          // 如果已有部分内容，保留已接收的内容
          if (accumulatedContent) {
            updateCallback(accumulatedContent, accumulatedReasoning, 0, '0')
          }
          throw new Error(errorMessage)
        }

        const { done, value } = readResult
        // 如果流已结束，退出循环
        if (done) break

        // 将二进制数据解码为文本
        let chunk
        try {
          chunk = decoder.decode(value, { stream: true }) // stream: true 表示可能还有后续数据
        } catch (decodeError) {
          // 解码错误（罕见情况）
          console.error('Stream decode error:', decodeError)
          continue // 跳过这个 chunk，继续处理后续数据
        }

        // 将新数据追加到缓冲区
        buffer += chunk
        // 按行分割，保留最后一行（可能不完整）
        const lines = buffer.split('\n')
        // 最后一行可能不完整，保留在 buffer 中
        buffer = lines.pop() || ''

        // 逐行处理完整的 SSE 格式数据
        for (const line of lines) {
          const trimmedLine = line.trim()
          // 跳过空行
          if (!trimmedLine) continue

          // 跳过流结束标记
          if (trimmedLine === 'data: [DONE]') {
            // 流正常结束，清理缓冲区
            buffer = ''
            continue
          }

          // Responses API 可能带 event: 行，这里直接忽略
          if (trimmedLine.startsWith('event:')) {
            continue
          }

          // 只处理以 "data: " 开头的有效数据行
          if (trimmedLine.startsWith('data: ')) {
            try {
              // 解析 JSON 数据（去掉 "data: " 前缀）
              const jsonStr = trimmedLine.slice(6) // "data: " 长度为 6
              const data = JSON.parse(jsonStr)

              // 检查是否包含错误信息（某些 API 在流式响应中返回错误）
              if (data.error) {
                const errorMessage = data.error.message || '服务器返回错误'
                console.error('SSE error response:', errorMessage)
                if (errorCallback) {
                  errorCallback(new Error(errorMessage))
                }
                // 如果还没有收到任何内容，抛出错误中断流程
                if (!accumulatedContent) {
                  throw new Error(errorMessage)
                }
                // 如果已有部分内容，继续处理但不再更新
                break
              }

              let contentDelta = ''
              let reasoningDelta = ''
              let tokens = 0

              // 1) 兼容 Chat Completions SSE（choices[].delta）
              if (Array.isArray(data.choices) && data.choices.length > 0) {
                contentDelta = data.choices[0]?.delta?.content || ''
                reasoningDelta = data.choices[0]?.delta?.reasoning_content || ''
                tokens = getCompletionTokens(data.usage)
              }

              // 2) 兼容 Responses API SSE（type: response.output_text.delta 等）
              if (!contentDelta && typeof data.type === 'string') {
                if (data.type === 'response.output_text.delta' && typeof data.delta === 'string') {
                  contentDelta = data.delta
                } else if (
                  (data.type === 'response.refusal.delta' || data.type === 'response.refusal.done') &&
                  typeof data.delta === 'string'
                ) {
                  // 某些模型会用 refusal 事件返回拒绝内容，统一展示在 content
                  contentDelta = data.delta
                } else if (data.type === 'response.output_text.done' && typeof data.text === 'string') {
                  // done 事件可能携带完整文本
                  if (data.text.length >= accumulatedContent.length) {
                    accumulatedContent = data.text
                  }
                } else if (data.type === 'response.completed' && data.response) {
                  tokens = getCompletionTokens(data.response.usage)
                  const finalText = tryExtractOutputTextFromResponses(data.response)
                  if (finalText && finalText.length >= accumulatedContent.length) {
                    accumulatedContent = finalText
                  }
                } else if (data.type === 'response.failed') {
                  const message = data.error?.message || '服务器返回失败事件'
                  throw new Error(message)
                }
              }

              if (contentDelta) accumulatedContent += contentDelta
              if (reasoningDelta) accumulatedReasoning += reasoningDelta

              const elapsedTime = (Date.now() - startTime) / 1000
              const speed = elapsedTime > 0 && tokens > 0 ? (tokens / elapsedTime).toFixed(2) : '0'

              // 有些 Responses 流式事件在完成前不会返回 usage，这里允许 tokens=0 但仍实时更新文本
              updateCallback(accumulatedContent, accumulatedReasoning, tokens, speed)
            } catch (parseError) {
              // JSON 解析错误（数据格式错误、不完整的 JSON 等）
              console.warn('SSE JSON parse error:', parseError.message, 'Line:', trimmedLine)
              // 不抛出错误，继续处理后续数据，避免中断整个流
              // 如果错误回调存在，可以通知上层但不中断流程
              if (errorCallback && accumulatedContent === '') {
                // 只有在还没有收到任何有效内容时才调用错误回调
                errorCallback(new Error(`数据解析错误: ${parseError.message}`))
              }
            }
          } else {
            // 不是标准的 SSE 格式，记录警告但继续处理
            console.warn('Unexpected SSE line format:', trimmedLine.substring(0, 50))
          }
        }
      }

      // 处理缓冲区中剩余的数据（如果有）
      if (buffer.trim()) {
        console.warn('Incomplete SSE data at end of stream:', buffer.substring(0, 100))
      }
    } catch (error) {
      // 捕获所有未预期的错误
      console.error('Stream processing error:', error)
      if (errorCallback) {
        errorCallback(error)
      }
      // 如果已有部分内容，保留已接收的内容
      if (accumulatedContent && !error.message.includes('流读取失败')) {
        updateCallback(accumulatedContent, accumulatedReasoning, 0, '0')
      }
      throw error
    } finally {
      // 确保释放读取器资源，避免内存泄漏
      try {
        reader.releaseLock()
      } catch (releaseError) {
        // 如果已经释放过，忽略错误
        console.warn('Reader release error (ignored):', releaseError)
      }
    }
  },

  /**
   * 处理非流式响应
   *
   * 一次性解析完整的 JSON 响应，提取所有信息并更新消息
   * 适用于流式响应关闭的场景
   *
   * @param {Object} response - 完整的 JSON 响应对象
   * @param {Function} updateCallback - 更新回调函数，参数同 handleStreamResponse
   *
   * @description
   * 非流式响应结构：
   * {
   *   choices: [{ message: { content, reasoning_content } }],
   *   usage: { completion_tokens },
   *   speed: tokens/s
   * }
   */
  handleNormalResponse(response, updateCallback) {
    // 兼容两类非流式响应：
    // 1) Chat Completions 风格：choices[0].message.content
    // 2) Responses API 风格：output_text / output[].content[].text
    if (response?.choices?.[0]?.message) {
      updateCallback(
        response.choices[0].message.content,
        response.choices[0].message.reasoning_content || '',
        response.usage?.completion_tokens || 0,
        response.speed || '0',
      )
      return
    }

    const content = tryExtractOutputTextFromResponses(response)
    const tokens = getCompletionTokens(response?.usage)
    updateCallback(content, '', tokens, response?.speed || '0')
  },

  /**
   * 统一的响应处理入口
   *
   * 根据 isStream 参数决定使用流式或非流式解析逻辑
   * 这是对外提供的主要接口，简化调用方的处理逻辑
   *
   * @param {Response|Object} response - 响应对象（流式时为 Response，非流式时为 JSON）
   * @param {boolean} isStream - 是否为流式响应
   * @param {Function} updateCallback - 更新回调函数
   * @param {Function} errorCallback - 错误回调函数（可选）
   *
   * @returns {Promise<void>} 异步处理完成（流式时）
   *
   * @example
   * await messageHandler.handleResponse(
   *   response,
   *   settingStore.settings.stream,
   *   (content, reasoning, tokens, speed) => {
   *     chatStore.updateLastMessage(content, reasoning, tokens, speed)
   *   },
   *   (error) => {
   *     console.error('Response error:', error)
   *     chatStore.updateLastMessage('处理响应时出错：' + error.message)
   *   }
   * )
   */
  async handleResponse(response, isStream, updateCallback, errorCallback) {
    if (isStream) {
      // 流式响应：逐块读取,二进制解码，处理 SSE数据，并实时更新
      await this.handleStreamResponse(response, updateCallback, errorCallback)
    } else {
      // 非流式响应：非流式数据 JSON 解析已经在 apis 里面做好了，一次性提取并更新
      try {
        this.handleNormalResponse(response, updateCallback)
      } catch (error) {
        // 非流式响应也可能出错（如数据结构异常）
        console.error('Normal response error:', error)
        if (errorCallback) {
          errorCallback(error)
        } else {
          throw error
        }
      }
    }
  },
}
