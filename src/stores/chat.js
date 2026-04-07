import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const DEFAULT_CONVERSATION_TITLE = '新对话'
const MAX_AUTO_TITLE_LENGTH = 18

const normalizeText = (value = '') => value.replace(/\s+/g, ' ').trim()

const deriveConversationTitle = (message = '') => {
  const normalized = normalizeText(String(message || '').replace(/^已发送附件：/, '附件：'))
  if (!normalized) return DEFAULT_CONVERSATION_TITLE
  return normalized.length > MAX_AUTO_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_AUTO_TITLE_LENGTH)}...`
    : normalized
}

const createEmptyConversation = (overrides = {}) => {
  const now = Date.now()
  return {
    id: String(now),
    title: DEFAULT_CONVERSATION_TITLE,
    messages: [],
    draft: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const getConversationUpdatedAt = (conversation) => {
  if (!conversation) return Date.now()
  return conversation.updatedAt || conversation.createdAt || Date.now()
}

const getMessagePreview = (message) => {
  if (!message) return '暂无消息'
  if (message.status === 'error') {
    return normalizeText(message.errorDetail || message.errorTitle || '请求失败')
  }
  if (message.role === 'user' && Array.isArray(message.files) && message.files.length > 0 && !message.content) {
    return `已发送 ${message.files.length} 个附件`
  }
  const text = normalizeText(message.content || '')
  return text || (message.role === 'assistant' ? '等待回复…' : '暂无消息')
}

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '刚刚'
  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`

  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const dayText = `${date.getDate()}`.padStart(2, '0')
  return `${month}-${dayText}`
}

export const useChatStore = defineStore(
  'llm-chat',
  () => {
    const conversations = ref([createEmptyConversation({ id: '1' })])
    const currentConversationId = ref('1')
    const isLoading = ref(false)

    const currentConversation = computed(
      () => conversations.value.find((conv) => conv.id === currentConversationId.value) || null,
    )
    const currentMessages = computed(() => currentConversation.value?.messages || [])

    const ensureCurrentConversation = () => {
      if (!currentConversation.value) {
        if (conversations.value.length === 0) {
          const conversation = createConversation()
          return conversation
        }
        currentConversationId.value = conversations.value[0].id
      }
      return currentConversation.value
    }

    const touchConversation = (conversation) => {
      if (!conversation) return
      conversation.updatedAt = Date.now()
    }

    const createConversation = (overrides = {}) => {
      const conversation = createEmptyConversation(overrides)
      conversations.value.unshift(conversation)
      currentConversationId.value = conversation.id
      return conversation
    }

    const switchConversation = (conversationId) => {
      currentConversationId.value = conversationId
    }

    const updateCurrentDraft = (draft) => {
      const conversation = ensureCurrentConversation()
      if (!conversation) return
      conversation.draft = draft
      touchConversation(conversation)
    }

    const addMessage = (message) => {
      const conversation = ensureCurrentConversation()
      if (!conversation) return null

      const normalizedMessage = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        status: 'normal',
        errorTitle: '',
        errorDetail: '',
        errorAction: '',
        ...message,
      }

      conversation.messages.push(normalizedMessage)
      touchConversation(conversation)

      if (
        normalizedMessage.role === 'user' &&
        (!conversation.title || conversation.title === DEFAULT_CONVERSATION_TITLE)
      ) {
        conversation.title = deriveConversationTitle(normalizedMessage.content)
      }

      return normalizedMessage
    }

    const patchLastMessage = (patch = {}) => {
      const conversation = currentConversation.value
      if (!conversation?.messages?.length) return null
      const lastMessage = conversation.messages[conversation.messages.length - 1]
      Object.assign(lastMessage, patch)
      touchConversation(conversation)
      return lastMessage
    }

    const setIsLoading = (value) => {
      isLoading.value = value
    }

    const updateLastMessage = (content, reasoning_content, completion_tokens, speed, patch = {}) => {
      return patchLastMessage({
        content,
        reasoning_content,
        completion_tokens,
        speed,
        status: 'normal',
        errorTitle: '',
        errorDetail: '',
        errorAction: '',
        ...patch,
      })
    }

    const getLastMessage = () => {
      if (currentConversation.value?.messages.length > 0) {
        return currentConversation.value.messages[currentConversation.value.messages.length - 1]
      }
      return null
    }

    const removeLastMessages = (count = 1) => {
      const conversation = currentConversation.value
      if (!conversation?.messages?.length || count <= 0) return []
      const removed = conversation.messages.splice(Math.max(conversation.messages.length - count, 0), count)
      touchConversation(conversation)
      return removed
    }

    const updateConversationTitle = (conversationId, newTitle) => {
      const conversation = conversations.value.find((item) => item.id === conversationId)
      if (!conversation) return
      conversation.title = newTitle.trim() || DEFAULT_CONVERSATION_TITLE
      touchConversation(conversation)
    }

    const deleteConversation = (conversationId) => {
      const index = conversations.value.findIndex((item) => item.id === conversationId)
      if (index === -1) return

      conversations.value.splice(index, 1)

      if (conversations.value.length === 0) {
        const conversation = createConversation()
        currentConversationId.value = conversation.id
        return
      }

      if (conversationId === currentConversationId.value) {
        currentConversationId.value = conversations.value[0].id
      }
    }

    const getConversationPreview = (conversation) => {
      if (!conversation?.messages?.length) {
        return conversation?.draft ? `草稿：${normalizeText(conversation.draft)}` : '还没有消息，开始聊点什么吧'
      }
      const lastMessage = conversation.messages[conversation.messages.length - 1]
      return getMessagePreview(lastMessage)
    }

    const getConversationTimeText = (conversation) => formatRelativeTime(getConversationUpdatedAt(conversation))

    return {
      conversations,
      currentConversationId,
      currentConversation,
      currentMessages,
      isLoading,
      addMessage,
      patchLastMessage,
      removeLastMessages,
      setIsLoading,
      updateLastMessage,
      getLastMessage,
      createConversation,
      switchConversation,
      updateCurrentDraft,
      updateConversationTitle,
      deleteConversation,
      getConversationPreview,
      getConversationTimeText,
    }
  },
  {
    persist: true,
  },
)
