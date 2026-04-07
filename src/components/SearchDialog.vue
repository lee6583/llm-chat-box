<script setup>
import { ref, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import ChatMessage from './ChatMessage.vue'
import { messageHandler } from '@/utils/messageHandler'
import { createChatCompletion } from '@/utils/api'
import { useSettingStore } from '@/stores/setting'

const searchText = ref('')
const messages = ref([])
const isLoading = ref(false)
const settingStore = useSettingStore()
const messagesContainer = ref(null)
const activeController = ref(null)

const aiMessage = '想快速试一下？这里适合做单轮提问、查报错、润色文案或生成小段内容。'
const suggestedPrompts = [
  '把这段需求拆成开发任务清单',
  '解释这个报错，并给我排查步骤',
  '帮我润色一段产品介绍文案',
  '总结一篇文章的重点并列出行动项',
]

watch(
  messages,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  },
  { deep: true },
)

const isAbortError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return error?.name === 'AbortError' || message.includes('request_aborted') || message.includes('aborted')
}

const buildFriendlyError = (error) => {
  if (isAbortError(error)) return '已停止当前回复。'
  const message = String(error?.message || '')
  if (message.includes('401')) return '鉴权失败，请检查设置中的 API Key 或网关地址。'
  if (message.includes('429')) return '请求过于频繁，请稍后再试。'
  if (message.includes('network') || message.includes('Failed to fetch')) return '网络连接失败，请稍后重试。'
  return '抱歉，发生了一些错误，请稍后重试。'
}

const startRequest = async (messagesForAPI) => {
  const controller = new AbortController()
  activeController.value = controller
  isLoading.value = true

  try {
    const response = await createChatCompletion(messagesForAPI, {
      signal: controller.signal,
      onModelResolved: ({ previousModel, resolvedModel }) => {
        ElMessage.warning(`当前模型 ${previousModel} 不可用，已自动切换为 ${resolvedModel}`)
      },
    })

    const lastMessage = messages.value[messages.value.length - 1]
    await messageHandler.handleResponse(
      response,
      settingStore.settings.stream,
      (content, reasoning_content, tokens, speed) => {
        lastMessage.content = content
        lastMessage.reasoning_content = reasoning_content
        lastMessage.completion_tokens = tokens
        lastMessage.speed = speed
      },
    )
  } catch (error) {
    const lastMessage = messages.value[messages.value.length - 1]
    if (controller.signal.aborted || isAbortError(error)) {
      lastMessage.content = lastMessage.content || '已停止当前回复。'
    } else {
      lastMessage.status = 'error'
      lastMessage.errorTitle = '快速问答失败'
      lastMessage.errorDetail = buildFriendlyError(error)
      lastMessage.content = ''
    }
  } finally {
    const lastMessage = messages.value[messages.value.length - 1]
    if (lastMessage) lastMessage.loading = false
    isLoading.value = false
    activeController.value = null
  }
}

const handleSend = async (prompt = searchText.value) => {
  const normalized = prompt.trim()
  if (!normalized || isLoading.value) return

  messages.value.push(messageHandler.formatMessage('user', normalized))
  messages.value.push(messageHandler.formatMessage('assistant', '', ''))
  const lastMessage = messages.value[messages.value.length - 1]
  lastMessage.loading = true
  searchText.value = ''

  await startRequest(messages.value.map(({ role, content }) => ({ role, content })))
}

const handleRegenerate = async () => {
  if (messages.value.length < 2 || isLoading.value) return
  const lastUserMessage = messages.value[messages.value.length - 2]
  messages.value.splice(-2, 2)
  await handleSend(lastUserMessage.content)
}

const handleRetry = async () => {
  if (messages.value.length < 2 || isLoading.value) return
  messages.value.splice(-1, 1)
  messages.value.push(messageHandler.formatMessage('assistant', '', ''))
  const lastMessage = messages.value[messages.value.length - 1]
  lastMessage.loading = true
  await startRequest(messages.value.slice(0, -1).map(({ role, content }) => ({ role, content })))
}

const handleStop = () => {
  activeController.value?.abort()
}
</script>

<template>
  <div class="search-dialog">
    <div class="search-header">
      <div class="search-input">
        <input
          v-model="searchText"
          type="text"
          placeholder="输入一个问题，回车立即发送"
          autofocus
          @keydown.enter.prevent="handleSend()"
        />
        <button v-if="isLoading" class="action-btn stop" type="button" @click="handleStop">停止</button>
        <button v-else class="action-btn" type="button" @click="handleSend()">发送</button>
      </div>
    </div>

    <div class="dialog-content" ref="messagesContainer">
      <template v-if="messages.length === 0">
        <div class="initial-message">{{ aiMessage }}</div>
        <div class="suggested-prompts">
          <div class="prompt-title">一键试试这些问题</div>
          <div class="prompt-list">
            <button
              v-for="prompt in suggestedPrompts"
              :key="prompt"
              class="prompt-item"
              type="button"
              @click="handleSend(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <ChatMessage
          v-for="(message, index) in messages"
          :key="message.id"
          :message="message"
          :is-last-assistant-message="index === messages.length - 1 && message.role === 'assistant'"
          @regenerate="handleRegenerate"
          @retry="handleRetry"
          @open-settings="ElMessage.info('请前往聊天页中的设置面板检查模型或 API Key')"
        />
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-dialog {
  max-width: 720px;
  min-width: 320px;
  max-height: min(80vh, 720px);
  max-height: min(80dvh, 720px);
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-header {
  padding: 14px;
  border-bottom: 1px solid #e5e7eb;
}

.search-input {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 0 12px;
  height: 48px;

  input {
    flex: 1;
    border: none;
    outline: none;
    background: none;
    font-size: 15px;
  }

  .action-btn {
    border: none;
    background: #2563eb;
    color: #fff;
    border-radius: 999px;
    padding: 8px 14px;
    cursor: pointer;

    &.stop {
      background: #ef4444;
    }
  }
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #f8fafc;
}

.initial-message {
  padding: 4px 4px 12px;
  color: #334155;
  line-height: 1.7;
}

.suggested-prompts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-title {
  font-size: 13px;
  color: #64748b;
}

.prompt-list {
  display: grid;
  gap: 10px;
}

.prompt-item {
  text-align: left;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  color: #0f172a;
  cursor: pointer;
  transition: 0.2s ease;

  &:hover {
    border-color: #bfdbfe;
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.08);
  }
}

@media (max-width: 768px) {
  .search-dialog {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 20px;
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  }

  .search-header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
    padding: 12px;
  }

  .search-input {
    height: auto;
    min-height: 48px;
    padding: 8px 10px;
    border-radius: 16px;
    align-items: stretch;
    gap: 8px;

    input {
      font-size: 16px;
      min-width: 0;
    }

    .action-btn {
      flex-shrink: 0;
      min-width: 64px;
      padding: 10px 14px;
      font-size: 14px;
    }
  }

  .dialog-content {
    padding: 12px;
    padding-bottom: calc(12px + var(--safe-area-bottom));
    gap: 12px;
  }

  .initial-message {
    padding: 0 2px 10px;
    font-size: 14px;
  }

  .prompt-list {
    grid-template-columns: 1fr;
  }

  .prompt-item {
    padding: 12px;
    font-size: 14px;
  }
}
</style>
