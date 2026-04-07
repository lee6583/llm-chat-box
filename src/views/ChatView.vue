<script setup>
import { defineAsyncComponent, computed, ref, watch, nextTick, onMounted, onUpdated } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Plus, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { messageHandler } from '@/utils/messageHandler'
import { createChatCompletion } from '@/utils/api'
import { useSettingStore } from '@/stores/setting'

const ChatInput = defineAsyncComponent(() => import('@/components/ChatInput.vue'))
const ChatMessage = defineAsyncComponent(() => import('@/components/ChatMessage.vue'))
const SettingsPanel = defineAsyncComponent(() => import('@/components/SettingsPanel.vue'))
const PopupMenu = defineAsyncComponent(() => import('@/components/PopupMenu.vue'))
const DialogEdit = defineAsyncComponent(() => import('@/components/DialogEdit.vue'))

const QUICK_PROMPTS = [
  '帮我总结这段内容的重点，并列出待办事项。',
  '帮我把这段话润色成更专业的表达。',
  '解释这段代码在做什么，并指出潜在问题。',
  '根据这个需求，帮我拆成可执行的开发任务。',
]

const chatStore = useChatStore()
const settingStore = useSettingStore()
const router = useRouter()
const requestContentCache = new Map()

const currentMessages = computed(() => chatStore.currentMessages)
const isLoading = computed(() => chatStore.isLoading)
const currentDraft = computed({
  get: () => chatStore.currentConversation?.draft || '',
  set: (value) => chatStore.updateCurrentDraft(value),
})
const currentTitle = computed(() => chatStore.currentConversation?.title || '新对话')
const currentTimeText = computed(() => chatStore.getConversationTimeText(chatStore.currentConversation))

const messagesContainer = ref(null)
const settingDrawer = ref(null)
const dialogEdit = ref(null)
const chatInputRef = ref(null)
const activeRequestController = ref(null)

const STREAM_RETRY_CONFIG = {
  MAX_RETRIES: 2,
  INITIAL_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY: 15000,
  JITTER_RANGE: 0.3,
}

const createAbortError = () => {
  const error = new Error('REQUEST_ABORTED')
  error.name = 'AbortError'
  return error
}

const calculateStreamRetryDelay = (attempt) => {
  const baseDelay =
    STREAM_RETRY_CONFIG.INITIAL_DELAY *
    Math.pow(STREAM_RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt)
  const cappedDelay = Math.min(baseDelay, STREAM_RETRY_CONFIG.MAX_DELAY)
  const jitter = (Math.random() * 2 - 1) * STREAM_RETRY_CONFIG.JITTER_RANGE * cappedDelay
  return Math.max(0, Math.round(cappedDelay + jitter))
}

const isAbortError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return error?.name === 'AbortError' || message.includes('request_aborted') || message.includes('aborted')
}

const isRetryableStreamError = (error) => {
  if (!error || !error.message || isAbortError(error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('流读取失败') ||
    message.includes('network') ||
    message.includes('网络') ||
    message.includes('超时') ||
    message.includes('timeout')
  )
}

const buildMessagesForRequest = (messages = chatStore.currentMessages) =>
  messages
    .filter((message) => {
      if (message.role === 'assistant' && message.status === 'error') return false
      if (message.role === 'assistant' && !message.content && !message.reasoning_content) return false
      return true
    })
    .map(({ id, role, content }) => ({
      role,
      content: requestContentCache.get(id) ?? content,
    }))

const virtualizer = useVirtualizer(
  computed(() => ({
    getScrollElement: () => messagesContainer.value,
    count: currentMessages.value.length,
    estimateSize: (index) => {
      const message = currentMessages.value[index]
      if (!message) return 140
      const baseHeight = message.status === 'error' ? 220 : 120
      const contentLength = (message.content?.length || 0) + (message.errorDetail?.length || 0)
      const contentHeight = Math.max(48, Math.min((contentLength / 42) * 18, 960))
      const filesHeight = (message.files?.length || 0) * 76
      const reportHeight = (message.attachmentReport?.items?.length || 0) * 30
      const reasoningHeight = message.reasoning_content ? contentHeight * 0.55 : 0
      return baseHeight + contentHeight + filesHeight + reportHeight + reasoningHeight
    },
    overscan: 4,
  })),
)

const scrollToBottom = () => {
  nextTick(() => {
    if (virtualizer.value && currentMessages.value.length > 0) {
      virtualizer.value.scrollToIndex(currentMessages.value.length - 1, {
        align: 'end',
        behavior: 'auto',
      })
    }
  })
}

let previousMessageCount = 0
watch(
  currentMessages,
  (messages) => {
    if (messages.length >= previousMessageCount) {
      scrollToBottom()
    }
    previousMessageCount = messages.length
  },
  { deep: true },
)

watch(
  () => chatStore.currentConversationId,
  () => {
    previousMessageCount = currentMessages.value.length
    scrollToBottom()
  },
)

onMounted(() => {
  if (chatStore.conversations.length === 0) {
    chatStore.createConversation()
  }
  scrollToBottom()
})

onUpdated(() => {
  nextTick(() => {
    virtualizer.value?.measureElement()
  })
})

const buildFriendlyError = (error) => {
  if (isAbortError(error)) {
    return {
      title: '已停止生成',
      detail: '本次回复已按你的操作停止。',
    }
  }

  const message = String(error?.message || '')
  if (message.includes('NO_AVAILABLE_MODELS')) {
    return {
      title: '没有可用模型',
      detail: '当前 API Key 没有关联可用模型，请在设置或网关后台检查模型映射。',
    }
  }
  if (message.includes('unknown provider for model') || message.includes('UNKNOWN_PROVIDER_FOR_MODEL')) {
    return {
      title: '模型映射不可用',
      detail: '当前模型没有绑定可用 Provider，请打开设置后切换模型，或检查网关配置。',
    }
  }
  if (message.includes('HTTP error')) {
    const status = message.match(/status: (\d+)/)?.[1]
    if (status === '401') {
      return {
        title: '鉴权失败 (401)',
        detail: '请检查 API Key 是否正确，以及 API Base URL 是否指向正确网关。',
      }
    }
    if (status === '404') {
      return {
        title: '接口地址不正确 (404)',
        detail: '当前网关地址似乎不对，请打开设置检查 API Base URL。',
      }
    }
    if (status === '429') {
      return {
        title: '请求过于频繁',
        detail: '服务暂时限流了，建议稍后重试，或切换一个响应更稳定的模型。',
      }
    }
    if (status === '500' || status === '502' || status === '503') {
      return {
        title: '服务暂时不可用',
        detail: '模型服务当前不可用，请稍后重试。',
      }
    }
  }
  if (message.includes('Failed to fetch') || message.includes('network') || message.includes('网络')) {
    return {
      title: '网络连接失败',
      detail: '请检查网络连接、代理设置，或稍后再试。',
    }
  }
  if (message.includes('解析错误') || message.includes('JSON')) {
    return {
      title: '响应格式异常',
      detail: '服务返回了无法识别的响应格式，请稍后重试。',
    }
  }
  return {
    title: '回复生成失败',
    detail: message || '抱歉，发生了一些错误，请稍后重试。',
  }
}

const finishRequest = () => {
  activeRequestController.value = null
  chatStore.setIsLoading(false)
  chatStore.patchLastMessage({ loading: false })
}

const openSettings = () => {
  settingDrawer.value?.openDrawer?.()
}

const sendWithStreamRetry = async (messages, signal) => {
  let lastError = null

  for (let attempt = 0; attempt <= STREAM_RETRY_CONFIG.MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw createAbortError()

    if (attempt > 0) {
      const delay = calculateStreamRetryDelay(attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
      if (signal?.aborted) throw createAbortError()
    }

    try {
      const response = await createChatCompletion(messages, {
        signal,
        onModelResolved: ({ previousModel, resolvedModel }) => {
          ElMessage.warning(`当前模型 ${previousModel} 不可用，已自动切换为 ${resolvedModel}`)
        },
      })

      await messageHandler.handleResponse(
        response,
        settingStore.settings.stream,
        (content, reasoning_content, tokens, speed) => {
          chatStore.updateLastMessage(content, reasoning_content, tokens, speed)
        },
        null,
      )
      return
    } catch (error) {
      lastError = error
      if (!isRetryableStreamError(error) || attempt >= STREAM_RETRY_CONFIG.MAX_RETRIES) {
        throw error
      }
    }
  }

  if (lastError) throw lastError
}

const startAssistantRequest = async (messages) => {
  const placeholder = chatStore.addMessage(
    messageHandler.formatMessage('assistant', '', ''),
  )
  chatStore.patchLastMessage({ loading: true, status: 'normal' })
  chatStore.setIsLoading(true)

  const controller = new AbortController()
  activeRequestController.value = controller

  try {
    await sendWithStreamRetry(messages, controller.signal)
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      if (!chatStore.getLastMessage()?.content) {
        chatStore.updateLastMessage('已停止生成。', '', 0, '0')
      }
      return
    }

    const friendly = buildFriendlyError(error)
    chatStore.patchLastMessage({
      status: 'error',
      errorTitle: friendly.title,
      errorDetail: friendly.detail,
      content: '',
      reasoning_content: '',
      completion_tokens: 0,
      speed: '0',
    })
  } finally {
    if (placeholder) {
      finishRequest()
    }
  }
}

const handleSend = async (messageContent) => {
  if (!messageContent) return
  const requestContent = messageContent.apiContent ?? messageContent.text
  const userMessage = chatStore.addMessage({
    ...messageHandler.formatMessage('user', messageContent.text, '', messageContent.files),
    attachmentReport: messageContent.attachmentReport || null,
  })

  if (userMessage) {
    requestContentCache.set(userMessage.id, requestContent)
  }

  chatStore.updateCurrentDraft('')
  const messages = buildMessagesForRequest()
  await startAssistantRequest(messages)
}

const handleQuickPrompt = async (prompt) => {
  if (isLoading.value) return
  await handleSend({
    text: prompt,
    apiContent: prompt,
    files: [],
    attachmentReport: null,
  })
}

const handleRetryLastRound = async () => {
  if (isLoading.value || currentMessages.value.length < 2) return
  const lastAssistant = currentMessages.value[currentMessages.value.length - 1]
  const lastUser = currentMessages.value[currentMessages.value.length - 2]
  if (!lastAssistant || lastAssistant.role !== 'assistant' || !lastUser || lastUser.role !== 'user') return

  chatStore.removeLastMessages(1)
  await startAssistantRequest(buildMessagesForRequest())
}

const handleRegenerate = async () => {
  if (isLoading.value || currentMessages.value.length < 2) return
  const lastUser = currentMessages.value[currentMessages.value.length - 2]
  if (!lastUser || lastUser.role !== 'user') return

  const requestContent = requestContentCache.get(lastUser.id) ?? lastUser.content
  chatStore.removeLastMessages(2)
  const newUserMessage = chatStore.addMessage({
    ...messageHandler.formatMessage('user', lastUser.content, '', lastUser.files || []),
    attachmentReport: lastUser.attachmentReport || null,
  })
  if (newUserMessage) {
    requestContentCache.set(newUserMessage.id, requestContent)
  }
  await startAssistantRequest(buildMessagesForRequest())
}

const handleStop = () => {
  if (!activeRequestController.value) return
  activeRequestController.value.abort()
  ElMessage.info('已停止当前回复')
}

const handleNewChat = () => {
  chatStore.createConversation()
  nextTick(() => {
    chatInputRef.value?.focusInput?.()
  })
}

const handleBack = () => {
  router.push('/')
}
</script>

<template>
  <div class="chat-container">
    <div class="chat-header">
      <div class="header-left">
        <PopupMenu />
        <el-button class="new-chat-btn" :icon="Plus" @click="handleNewChat">新对话</el-button>
        <div class="title-wrapper">
          <div class="title-main">
            <h1 class="chat-title" :title="currentTitle">{{ currentTitle }}</h1>
            <span class="chat-subtitle">最近更新 {{ currentTimeText }}</span>
          </div>
          <button
            class="edit-btn"
            type="button"
            aria-label="编辑对话标题"
            @click="dialogEdit.openDialog(chatStore.currentConversationId, 'edit')"
          >
            <img src="@/assets/photo/编辑.png" alt="编辑" />
          </button>
        </div>
      </div>

      <div class="header-right">
        <div v-if="isLoading" class="stream-status">
          <el-icon class="is-loading"><Loading /></el-icon>
          正在生成
        </div>
        <button class="action-btn" type="button" aria-label="打开设置" @click="openSettings">
          <img src="@/assets/photo/设置.png" alt="设置" />
        </button>
        <button class="action-btn" type="button" aria-label="回到首页" @click="handleBack">
          <img src="@/assets/photo/返回.png" alt="返回" />
        </button>
      </div>
    </div>

    <div class="messages-container" ref="messagesContainer">
      <template v-if="currentMessages.length > 0">
        <div
          :style="{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <template v-for="virtualItem in virtualizer.getVirtualItems()" :key="virtualItem.key">
            <div
              :ref="(el) => {
                if (el) virtualizer.measureElement(el)
              }"
              :data-index="virtualItem.index"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }"
            >
              <ChatMessage
                :message="currentMessages[virtualItem.index]"
                :is-last-assistant-message="
                  virtualItem.index === currentMessages.length - 1 &&
                  currentMessages[virtualItem.index].role === 'assistant'
                "
                @regenerate="handleRegenerate"
                @retry="handleRetryLastRound"
                @open-settings="openSettings"
              />
            </div>
          </template>
        </div>
      </template>
      <div v-else class="empty-state">
        <div class="empty-content">
          <img src="@/assets/photo/对话.png" alt="chat" class="empty-icon" />
          <h2>开始一段更顺手的对话</h2>
          <p>试试下面这些高频场景，点一下就能直接发送。</p>
          <div class="prompt-grid">
            <button
              v-for="prompt in QUICK_PROMPTS"
              :key="prompt"
              type="button"
              class="prompt-card"
              @click="handleQuickPrompt(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="chat-input-container">
      <ChatInput
        ref="chatInputRef"
        v-model:draft="currentDraft"
        :loading="isLoading"
        :can-stop="!!activeRequestController"
        @send="handleSend"
        @stop="handleStop"
      />
    </div>

    <SettingsPanel ref="settingDrawer" />
    <DialogEdit ref="dialogEdit" />
  </div>
</template>

<style lang="scss" scoped>
.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 0.8rem 1rem;
  background: var(--bg-color);
  border-bottom: 1px solid #eef2f7;

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .header-left {
    flex: 1;
  }

  .title-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .title-main {
    min-width: 0;
  }

  .chat-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-subtitle {
    display: block;
    font-size: 12px;
    color: #64748b;
  }

  .edit-btn,
  .action-btn {
    width: 34px;
    height: 34px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: 0.2s ease;

    img {
      width: 18px;
      height: 18px;
    }

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    }
  }

  .new-chat-btn {
    border-radius: 999px;
  }

  .stream-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 13px;
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 0.75rem;
  background: #f8fafc;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}

.empty-state {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;

  .empty-content {
    width: min(100%, 720px);
    text-align: center;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    opacity: 0.6;
    margin-bottom: 16px;
  }

  h2 {
    margin-bottom: 8px;
    font-size: 1.8rem;
    color: #0f172a;
  }

  p {
    color: #64748b;
    margin-bottom: 20px;
  }

  .prompt-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .prompt-card {
    text-align: left;
    padding: 16px;
    border: 1px solid #dbeafe;
    border-radius: 16px;
    background: linear-gradient(180deg, #fff, #f8fbff);
    color: #1e293b;
    line-height: 1.6;
    cursor: pointer;
    transition: 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 24px rgba(37, 99, 235, 0.08);
      border-color: #93c5fd;
    }
  }
}

.chat-input-container {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0) 0%, #f8fafc 18%, #f8fafc 100%);
  padding: 0.75rem;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .chat-header {
    padding: 0.75rem;
    align-items: flex-start;
    flex-direction: column;

    .header-left,
    .header-right {
      width: 100%;
      justify-content: space-between;
    }

    .title-wrapper {
      flex: 1;
    }
  }

  .empty-state .prompt-grid {
    grid-template-columns: 1fr;
  }

  .messages-container,
  .chat-input-container {
    max-width: 100%;
  }
}
</style>
