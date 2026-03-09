/**
 * 聊天状态管理 Store
 * 
 * 负责维护会话列表、当前会话、消息及 loading 状态
 * 使用 Pinia 进行状态管理，并通过持久化插件保存到 IndexedDB
 * 
 * 数据结构：
 * - conversations: 所有对话列表
 * - currentConversationId: 当前选中的对话 ID
 * - isLoading: 全局加载状态
 * - currentConversation: 当前对话对象（计算属性）
 * - currentMessages: 当前对话的消息列表（计算属性）
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 聊天 Store
 * 
 * @description
 * 使用 Pinia 的 setup 语法（Composition API 风格）
 * 所有状态和方法都在此定义，供组件使用
 * 
 * 持久化配置：
 * - persist: true - 启用持久化，数据自动保存到 IndexedDB
 * - key: 'llm-chat' - 存储键名
 */
export const useChatStore = defineStore(
  'llm-chat', // Store 的唯一标识符
  () => {
    /**
     * 所有对话列表
     * 
     * @type {Array<Object>}
     * @description
     * 每个对话对象包含：
     * - id: string - 对话唯一标识（时间戳字符串）
     * - title: string - 对话标题（用户可编辑）
     * - messages: Array<Object> - 消息列表
     *   - id: number - 消息 ID（时间戳）
     *   - role: 'user' | 'assistant' - 消息角色
     *   - content: string - 消息内容
     *   - reasoning_content: string - 深度思考内容（可选）
     *   - files: Array - 附件列表（可选）
     *   - timestamp: string - ISO 格式时间戳
     *   - completion_tokens: number - 完成 token 数
     *   - speed: number - 响应速度 tokens/s
     *   - loading: boolean - 加载状态
     * - createdAt: number - 创建时间戳
     */
    const conversations = ref([
      {
        id: '1', // 默认对话 ID
        title: '日常问候', // 默认标题
        messages: [], // 初始消息列表为空
        createdAt: Date.now(), // 创建时间
      },
    ])

    /**
     * 当前选中的对话 ID
     * 
     * @type {Ref<string>}
     * @description
     * 用于确定当前显示的对话
     * 通过 currentConversation 计算属性获取对应的对话对象
     */
    const currentConversationId = ref('1')

    /**
     * 全局加载状态
     * 
     * @type {Ref<boolean>}
     * @description
     * 控制整个应用的加载状态，用于：
     * - 禁用输入框和发送按钮（防止重复发送）
     * - 显示"内容生成中..."提示
     * - 禁用语音识别功能
     */
    const isLoading = ref(false)

    /**
     * 当前对话对象（计算属性）
     * 
     * @type {ComputedRef<Object|undefined>}
     * @description
     * 根据 currentConversationId 从 conversations 中查找对应的对话
     * 如果找不到则返回 undefined
     * 
     * @returns {Object|undefined} 当前对话对象
     */
    const currentConversation = computed(() => {
      return conversations.value.find((conv) => conv.id === currentConversationId.value)
    })

    /**
     * 当前对话的消息列表（计算属性）
     * 
     * @type {ComputedRef<Array>}
     * @description
     * 从当前对话对象中提取消息列表
     * 如果当前对话不存在，返回空数组
     * 
     * 供 ChatView 和 ChatMessage 组件渲染使用
     * 
     * @returns {Array} 消息数组
     */
    const currentMessages = computed(() => currentConversation.value?.messages || [])

    /**
     * 创建新对话
     * 
     * 插入到列表头部，并自动切换为当前对话
     * 新对话的 ID 使用当前时间戳，确保唯一性
     * 
     * @description
     * 使用场景：
     * - 用户点击"新对话"按钮
     * - 删除最后一个对话后自动创建
     * 
     * @example
     * chatStore.createConversation()
     * // 创建一个新的空对话，并自动切换为当前对话
     */
    const createConversation = () => {
      const newConversation = {
        id: Date.now().toString(), // 使用时间戳作为唯一 ID
        title: '日常问候', // 默认标题（用户后续可编辑）
        messages: [], // 初始消息列表为空
        createdAt: Date.now(), // 创建时间戳
      }
      // 插入到列表头部（最新对话显示在最前面）
      conversations.value.unshift(newConversation)
      // 自动切换为新创建的对话
      currentConversationId.value = newConversation.id
    }

    /**
     * 切换对话
     * 
     * 仅更新当前对话 ID，触发 currentConversation 和 currentMessages 重新计算
     * 
     * @param {string} conversationId - 要切换到的对话 ID
     * 
     * @example
     * chatStore.switchConversation('1234567890')
     * // 切换到 ID 为 '1234567890' 的对话
     */
    const switchConversation = (conversationId) => {
      currentConversationId.value = conversationId
    }

    /**
     * 添加消息到当前对话
     * 
     * 自动补充 id、时间戳等通用字段
     * 如果当前对话不存在，则不执行任何操作
     * 
     * @param {Object} message - 消息对象（由 messageHandler.formatMessage 构造）
     * @param {string} message.role - 消息角色：'user' | 'assistant'
     * @param {string} message.content - 消息内容
     * @param {string} [message.reasoning_content] - 深度思考内容（可选）
     * @param {Array} [message.files] - 附件列表（可选）
     * 
     * @description
     * 自动添加的字段：
     * - id: 消息唯一标识（时间戳）
     * - timestamp: ISO 格式时间戳
     * 
     * @example
     * chatStore.addMessage({
     *   role: 'user',
     *   content: '你好',
     *   files: []
     * })
     */
    const addMessage = (message) => {
      // 确保当前对话存在
      if (currentConversation.value) {
        // 添加消息到当前对话的消息列表
        currentConversation.value.messages.push({
          id: Date.now(), // 消息唯一标识
          timestamp: new Date().toISOString(), // ISO 格式时间戳
          ...message, // 展开传入的消息对象
        })
      }
    }

    /**
     * 设置全局 loading 状态
     * 
     * @param {boolean} value - loading 状态值
     * 
     * @description
     * 用于控制整个应用的加载状态
     * true: 正在请求中，禁用输入和发送
     * false: 请求完成，恢复正常交互
     * 
     * @example
     * chatStore.setIsLoading(true)  // 开始加载
     * // ... 执行异步操作
     * chatStore.setIsLoading(false) // 结束加载
     */
    const setIsLoading = (value) => {
      isLoading.value = value
    }

    /**
     * 更新当前会话最后一条消息
     * 
     * 用于流式/普通响应回填 AI 内容
     * 在流式响应过程中会多次调用，实时更新消息内容
     * 
     * @param {string} content - 消息正文内容
     * @param {string} reasoning_content - 深度思考内容（可选）
     * @param {number} completion_tokens - 完成 token 数
     * @param {string|number} speed - 响应速度 tokens/s
     * 
     * @description
     * 使用场景：
     * - 流式响应：逐块更新内容，实现打字机效果
     * - 非流式响应：一次性更新完整内容
     * 
     * @example
     * // 流式响应中实时更新
     * chatStore.updateLastMessage(
     *   '这是部分内容...',
     *   '这是推理过程...',
     *   100,
     *   '25.5'
     * )
     */
    const updateLastMessage = (content, reasoning_content, completion_tokens, speed) => {
      // 确保当前对话存在且有消息
      if (currentConversation.value?.messages.length > 0) {
        // 获取最后一条消息（通常是助手消息）
        const lastMessage =
          currentConversation.value.messages[currentConversation.value.messages.length - 1]
        // 更新消息内容
        lastMessage.content = content
        lastMessage.reasoning_content = reasoning_content
        lastMessage.completion_tokens = completion_tokens
        lastMessage.speed = speed
      }
    }

    /**
     * 获取当前会话的最后一条消息
     * 
     * 工具方法，用于获取最后一条消息进行特殊处理
     * 
     * @returns {Object|null} 最后一条消息对象，如果不存在则返回 null
     * 
     * @example
     * const lastMsg = chatStore.getLastMessage()
     * if (lastMsg) {
     *   lastMsg.loading = true // 设置加载状态
     * }
     */
    const getLastMessage = () => {
      if (currentConversation.value?.messages.length > 0) {
        return currentConversation.value.messages[currentConversation.value.messages.length - 1]
      }
      return null
    }

    /**
     * 更新对话标题
     * 
     * 在 DialogEdit 组件中调用，用于编辑对话名称
     * 
     * @param {string} conversationId - 对话 ID
     * @param {string} newTitle - 新标题
     * 
     * @description
     * 如果找不到对应的对话，则不执行任何操作
     * 
     * @example
     * chatStore.updateConversationTitle('1234567890', '新标题')
     */
    const updateConversationTitle = (conversationId, newTitle) => {
      // 查找对应的对话
      const conversation = conversations.value.find((c) => c.id === conversationId)
      if (conversation) {
        conversation.title = newTitle
      }
    }

    /**
     * 删除对话
     * 
     * 删除后要保证至少存在一个会话，并处理当前选中对话的切换
     * 
     * @param {string} conversationId - 要删除的对话 ID
     * 
     * @description
     * 删除逻辑：
     * 1. 查找并删除指定对话
     * 2. 如果删除后没有对话了，自动创建一个新对话
     * 3. 如果删除的是当前对话，切换到第一个对话
     * 
     * @example
     * chatStore.deleteConversation('1234567890')
     * // 删除 ID 为 '1234567890' 的对话
     */
    const deleteConversation = (conversationId) => {
      // 查找对话在列表中的索引
      const index = conversations.value.findIndex((c) => c.id === conversationId)
      if (index !== -1) {
        // 删除对话
        conversations.value.splice(index, 1)

        // 如果删除后没有对话了，创建一个新对话（保证至少有一个对话）
        if (conversations.value.length === 0) {
          createConversation()
        }
        // 如果删除的是当前对话，切换到第一个对话
        else if (conversationId === currentConversationId.value) {
          currentConversationId.value = conversations.value[0].id
        }
      }
    }

    // 返回所有需要暴露的状态和方法
    return {
      // 状态
      conversations, // 所有对话列表
      currentConversationId, // 当前对话 ID
      currentConversation, // 当前对话对象（计算属性）
      currentMessages, // 当前对话的消息列表（计算属性）
      isLoading, // 全局加载状态

      // 方法
      addMessage, // 添加消息
      setIsLoading, // 设置加载状态
      updateLastMessage, // 更新最后一条消息
      getLastMessage, // 获取最后一条消息
      createConversation, // 创建新对话
      switchConversation, // 切换对话
      updateConversationTitle, // 更新对话标题
      deleteConversation, // 删除对话
    }
  },
  {
    // Pinia 持久化插件配置
    persist: true, // 启用持久化，数据自动保存到 IndexedDB
    // 默认存储键名：'llm-chat'
    // 默认存储位置：IndexedDB
  },
)
