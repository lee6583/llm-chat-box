<script setup>
/**
 * 聊天主页面，负责协调输入框、消息列表、设置面板等业务逻辑
 *
 * 性能优化：
 * - 对大型子组件使用 defineAsyncComponent 实现懒加载
 * - 减少初始 bundle 大小，按需加载组件代码
 */

import { defineAsyncComponent, computed, ref, watch, nextTick, onMounted, onUpdated } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Plus } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { messageHandler } from '@/utils/messageHandler'
import { createChatCompletion } from '@/utils/api'
import { useSettingStore } from '@/stores/setting'
import { useRouter } from 'vue-router'

/**
 * 异步加载大型组件
 *
 * 这些组件包含复杂的逻辑和依赖，懒加载可以优化首屏性能
 * 使用 webpackChunkName 指定代码分割后的 chunk 名称
 */

// ChatInput 组件：包含文件上传、语音识别等复杂功能
const ChatInput = defineAsyncComponent({
  loader: () => import(/* webpackChunkName: "chat-input" */ '@/components/ChatInput.vue'),
  delay: 100,
  timeout: 3000,
})

// ChatMessage 组件：包含 Markdown 渲染、代码高亮等复杂功能
const ChatMessage = defineAsyncComponent({
  loader: () => import(/* webpackChunkName: "chat-message" */ '@/components/ChatMessage.vue'),
  delay: 100,
  timeout: 3000,
})

// SettingsPanel 组件：设置面板，使用频率较低，适合懒加载
const SettingsPanel = defineAsyncComponent({
  loader: () => import(/* webpackChunkName: "settings-panel" */ '@/components/SettingsPanel.vue'),
  delay: 100,
  timeout: 3000,
})

// PopupMenu 组件：弹出菜单，使用频率较低
const PopupMenu = defineAsyncComponent({
  loader: () => import(/* webpackChunkName: "popup-menu" */ '@/components/PopupMenu.vue'),
  delay: 100,
  timeout: 3000,
})

// DialogEdit 组件：编辑对话框，使用频率较低
const DialogEdit = defineAsyncComponent({
  loader: () => import(/* webpackChunkName: "dialog-edit" */ '@/components/DialogEdit.vue'),
  delay: 100,
  timeout: 3000,
})

// ===== 1. 状态与依赖 =====
// Pinia 聊天 store：管理所有会话与消息
const chatStore = useChatStore()
// 当前对话的消息列表（响应式计算属性）
const currentMessages = computed(() => chatStore.currentMessages)
// 全局 loading 状态（控制输入框与“内容生成中”）
const isLoading = computed(() => chatStore.isLoading)
// 设置 store：获取当前模型、是否流式、API Key 等配置
const settingStore = useSettingStore()

/**
 * 消息列表容器 DOM 引用
 *
 * 用于虚拟滚动的容器元素
 * 同时用于控制滚动条滚动到底部
 */
const messagesContainer = ref(null)

/**
 * 流式重连配置（前端层面，仅针对 SSE 读流阶段）
 *
 * 注意：HTTP 请求阶段的重试逻辑已经在 api.js 中实现，这里只处理「已拿到流但中途断开」的场景
 */
const STREAM_RETRY_CONFIG = {
  MAX_RETRIES: 2, // 流式阶段最大重连次数（不含首次）
  INITIAL_DELAY: 1000, // 初始延迟 1s
  BACKOFF_MULTIPLIER: 2, // 指数退避倍率
  MAX_DELAY: 15000, // 单次最大延迟 15s，避免等待过久
  JITTER_RANGE: 0.3, // 抖动比例 ±30%，让不同用户的重连时间错峰，起到“全局防抖”效果
}

// 计算流式重连的延迟时间（指数退避 + 抖动）
const calculateStreamRetryDelay = (attempt) => {
  const baseDelay =
    STREAM_RETRY_CONFIG.INITIAL_DELAY *
    Math.pow(STREAM_RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt)
  const cappedDelay = Math.min(baseDelay, STREAM_RETRY_CONFIG.MAX_DELAY)
  const jitter =
    (Math.random() * 2 - 1) * STREAM_RETRY_CONFIG.JITTER_RANGE * cappedDelay
  return Math.max(0, Math.round(cappedDelay + jitter))
}

// 判断是否属于可以进行流式重连的错误（网络中断 / 超时等）
const isRetryableStreamError = (error) => {
  if (!error || !error.message) return false
  const msg = error.message
  return (
    msg.includes('流读取失败') ||
    msg.includes('network') ||
    msg.includes('网络') ||
    msg.includes('超时') ||
    msg.includes('timeout')
  )
}

/**
 * 使用useVirtualizer创建虚拟滚动器，然后进行虚拟滚动器配置
 *
 * 使用 @tanstack/vue-virtual 实现虚拟滚动
 * 支持动态高度消息，只渲染可见区域的消息项
 *
 * 性能优化：
 * - 只渲染可见区域的消息，减少 DOM 节点数量
 * - 支持数百条消息仍保持流畅滚动
 * - 动态高度适配，自动计算每个消息的实际高度
 */
const virtualizer = useVirtualizer(
  computed(() => ({
    /**
     * 容器引用
     *
     * 虚拟滚动的容器元素
     * 必须是可滚动的容器（overflow-y: auto 或 scroll）
     */
    getScrollElement: () => messagesContainer.value,

    /**
     * 数据总数
     *
     * 当前对话的消息数量
     * 注意：这里必须是数字，且通过 computed 驱动更新
     */
    count: currentMessages.value.length,

    /**
     * 动态高度估算
     *
     * 由于每个消息的内容长度不同（Markdown 渲染后高度不同）
     * 需要提供初始估算高度，后续会根据实际 DOM 高度自动调整
     *
     * @param {number} index - 消息索引
     * @returns {number} 消息项的估算高度（px）
     */
    estimateSize: (index) => {
      const message = currentMessages.value[index]
      if (!message) return 150

      // 根据消息内容长度估算高度，后边可以改为使用vue-virtual库里DynamicScroller 计算不定高
      // 基础高度：padding + margin + 操作按钮区域
      const baseHeight = 120
      // 内容高度估算：每 50 个字符约 20px，最小 40px
      const contentLength = message.content?.length || 0
      const contentHeight = Math.max(40, Math.min(contentLength / 50 * 20, 800)) // 最大 800px
      // 文件高度：每个文件约 70px
      const filesHeight = (message.files?.length || 0) * 70
      // 推理内容高度（如果展开）：估算为内容高度的 0.6 倍
      const reasoningHeight = message.reasoning_content ? contentHeight * 0.6 : 0

      return baseHeight + contentHeight + filesHeight + reasoningHeight
    },

    /**
     * 渲染缓冲区
     *
     * 在可见区域外额外渲染的项目数量
     * 提升滚动体验，避免快速滚动时的空白
     */
    overscan: 3,
  })),
)

/**
 * 滚动到底部
 *
 * 将消息容器滚动到最底部，显示最新消息
 * 在虚拟滚动中，需要滚动到最后一个虚拟项
 */
const scrollToBottom = () => {
  nextTick(() => {
    if (virtualizer.value && currentMessages.value.length > 0) {
      const lastIndex = currentMessages.value.length - 1
      // 滚动到最后一个虚拟项，使用 'end' 对齐方式将项对齐到容器底部
      virtualizer.value.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: 'auto', // 使用 auto 而不是 smooth，避免滚动动画延迟
      })
    }
  })
}

/**
 * 监听消息变化，自动滚动到最新一条消息
 *
 * 当有新消息添加时，自动滚动到底部
 * 注意：只在消息数量增加时滚动，避免用户查看历史消息时被强制拉到底部
 */
let previousMessageCount = 0
watch(
  currentMessages,
  (newMessages) => {
    const currentCount = newMessages.length
    // 只在消息数量增加时自动滚动到底部（新消息到达）
    if (currentCount > previousMessageCount) {
      scrollToBottom()
    }
    previousMessageCount = currentCount
  },
  { deep: true },
)

// ===== 2. 初始化逻辑 =====
onMounted(() => {
  // 每次页面刷新时，将消息容器滚动到底部
  scrollToBottom()
  // 当没有对话时，默认新建一个对话
  if (chatStore.conversations.length === 0) {
    chatStore.createConversation()
  }
})

/**
 * 组件更新后，确保虚拟滚动器正确测量元素高度
 *
 * 当消息内容更新（如流式响应实时更新）时，
 * 需要通知虚拟滚动器重新测量元素高度
 */
onUpdated(() => {
  // 触发虚拟滚动器重新测量所有可见元素的高度
  // 这在消息内容更新（如流式响应更新）后很重要
  nextTick(() => {
    virtualizer.value?.measureElement()
  })
})

// ===== 3. 发送消息主流程 =====
// 封装一层：在流式读流阶段出现中断时，自动重连（带最大重试次数 + 指数退避 + 抖动）
const sendWithStreamRetry = async (messages) => {
  let lastError = null

  for (let attempt = 0; attempt <= STREAM_RETRY_CONFIG.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = calculateStreamRetryDelay(attempt - 1)
      console.warn(
        `[Stream Retry ${attempt}/${STREAM_RETRY_CONFIG.MAX_RETRIES}] 等待 ${delay}ms 后重试...`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    try {
      const response = await createChatCompletion(messages)
      // 这里不再传 errorCallback，错误统一由外层 catch 处理，避免每次失败都立刻打断用户视线
      await messageHandler.handleResponse(
        response,
        settingStore.settings.stream,
        (content, reasoning_content, tokens, speed) => {
          chatStore.updateLastMessage(content, reasoning_content, tokens, speed)
        },
        null,
      )

      // 执行到这里说明本次请求和流式处理都成功，直接返回
      return
    } catch (error) {
      lastError = error
      console.error(`Stream attempt ${attempt} failed:`, error)

      // 不可重试的错误 / 已达到最大重试次数，直接抛出
      if (!isRetryableStreamError(error) || attempt >= STREAM_RETRY_CONFIG.MAX_RETRIES) {
        throw error
      }

      // 否则继续下一轮循环，按指数退避 + 抖动重连
    }
  }

  // 理论上不会到这里，为了安全兜底
  if (lastError) throw lastError
}

// 参数 messageContent：由 ChatInput 组件传入，包含 text + files
const handleSend = async (messageContent) => {
  try {
    // 1）添加一条用户消息到当前会话
    chatStore.addMessage(
      messageHandler.formatMessage('user', messageContent.text, '', messageContent.files),
    )
    // 2）预先插入一条“空”的助手消息，后续通过流式/普通响应实时填充
    chatStore.addMessage(messageHandler.formatMessage('assistant', '', ''))

    // 3）设置 loading 状态，避免重复发送和展示“内容生成中...”
    chatStore.setIsLoading(true)
    const lastMessage = chatStore.getLastMessage()
    lastMessage.loading = true

    // 4）构造 messages 数组，只保留 role + content，发送给 LLM 接口
    const messages = chatStore.currentMessages.map(({ role, content }) => ({ role, content }))

    // 5）使用带流式重连的封装方法
    await sendWithStreamRetry(messages)
  } catch (error) {
    console.error('Failed to send message:', error)
    // 接口异常 / 流式重连最终失败时，给出更详细的错误信息
    let errorMessage = '抱歉，发生了一些错误，请稍后重试'

    if (error?.message) {
      if (error.message.includes('HTTP error')) {
        const statusMatch = error.message.match(/status: (\d+)/)
        if (statusMatch) {
          const status = statusMatch[1]
          if (status === '401') {
            errorMessage = 'API Key 无效，请在设置中检查您的 API Key'
          } else if (status === '429') {
            errorMessage = '请求过于频繁，请稍后再试'
          } else if (status === '500' || status === '502' || status === '503') {
            errorMessage = '服务器暂时不可用，请稍后重试'
          } else {
            errorMessage = `服务器错误 (${status})，请稍后重试`
          }
        } else {
          errorMessage = `请求失败: ${error.message}`
        }
      } else if (
        error.message.includes('Failed to fetch') ||
        error.message.includes('network') ||
        error.message.includes('网络')
      ) {
        errorMessage = '网络连接失败或中断，请检查网络设置后重试'
      } else if (error.message.includes('解析错误') || error.message.includes('JSON')) {
        errorMessage = '数据格式错误，请稍后重试'
      } else {
        errorMessage = `错误: ${error.message}`
      }
    }

    // 接口异常 / 重连失败时，给出兜底文案
    chatStore.updateLastMessage(errorMessage)
  } finally {
    // 6）无论成功失败，都要重置 loading 状态
    chatStore.setIsLoading(false)
    const lastMessage = chatStore.getLastMessage()
    if (lastMessage) {
      lastMessage.loading = false
    }
  }
}

// ===== 4. 重新生成回答 =====
// 逻辑：删除最后一次问答对，用最后一条用户消息重新发起一次请求
const handleRegenerate = async () => {
  try {
    // 获取最后一条用户消息
    const lastUserMessage = chatStore.currentMessages[chatStore.currentMessages.length - 2]
    // 使用 splice 删除最后两个元素
    chatStore.currentMessages.splice(-2, 2)
    await handleSend({ text: lastUserMessage.content, files: lastUserMessage.files })
  } catch (error) {
    console.error('Failed to regenerate message:', error)
  }
}

// ===== 5. 其他 UI 控制逻辑 =====
// 设置抽屉引用，用于打开设置面板（SettingsPanel）
const settingDrawer = ref(null)
// 弹出菜单引用（左侧历史对话菜单）
const popupMenu = ref(null)

// 新建对话：委托给 chatStore，在头部「新对话」按钮和弹出菜单中复用
const handleNewChat = () => {
  chatStore.createConversation()
}

// 当前对话标题（如果没有标题则回退成默认文案）
const currentTitle = computed(() => chatStore.currentConversation?.title || 'LLM Chat')
// 标题过长时在头部进行裁剪展示，避免 UI 挤压
const formatTitle = (title) => {
  return title.length > 4 ? title.slice(0, 4) + '...' : title
}

// 对话标题编辑 / 删除确认弹窗引用
const dialogEdit = ref(null)

// 获取路由实例，用于从聊天页返回首页
const router = useRouter()

// 处理返回首页
const handleBack = async () => {
  router.push('/')
}
</script>

<template>
  <!-- 聊天容器 -->
  <div class="chat-container">
    <!-- 聊天头部 -->
    <div class="chat-header">
      <div class="header-left">
        <PopupMenu ref="popupMenu" />
        <el-button class="new-chat-btn" :icon="Plus" @click="handleNewChat">新对话</el-button>
        <div class="divider"></div>
        <div class="title-wrapper">
          <h1 class="chat-title">{{ formatTitle(currentTitle) }}</h1>
          <button
            class="edit-btn"
            @click="dialogEdit.openDialog(chatStore.currentConversationId, 'edit')"
          >
            <img src="@/assets/photo/编辑.png" alt="edit" />
          </button>
        </div>
      </div>

      <div class="header-right">
        <el-tooltip content="设置" placement="top">
          <button class="action-btn" @click="settingDrawer.openDrawer()">
            <img src="@/assets/photo/设置.png" alt="settings" />
          </button>
        </el-tooltip>
        <el-tooltip content="回到首页" placement="top">
          <button class="action-btn" @click="handleBack">
            <img src="@/assets/photo/返回.png" alt="back" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- 消息容器，显示对话消息（虚拟滚动） -->
    <div class="messages-container" ref="messagesContainer">
      <template v-if="currentMessages.length > 0">
        <!-- 虚拟滚动容器 -->
        <!-- 使用虚拟滚动器的总高度作为容器高度，保持正确的滚动条比例 -->
        <div
          :style="{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <!-- 渲染可见区域的消息项 -->
          <!-- virtualizer.getVirtualItems() 返回当前可见区域的虚拟项列表 -->
          <template
            v-for="virtualItem in virtualizer.getVirtualItems()"
            :key="virtualItem.key"
          >
            <div
              :ref="(el) => {
                // 将 DOM 元素传递给虚拟滚动器进行高度测量
                if (el) {
                  virtualizer.measureElement(el)
                }
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
              <chat-message
                :message="currentMessages[virtualItem.index]"
                :is-last-assistant-message="
                  virtualItem.index === currentMessages.length - 1 &&
                  currentMessages[virtualItem.index].role === 'assistant'
                "
                @regenerate="handleRegenerate"
              />
            </div>
          </template>
        </div>
      </template>
      <div v-else class="empty-state">
        <div class="empty-content">
          <img src="@/assets/photo/对话.png" alt="chat" class="empty-icon" />
          <h2>开始对话吧</h2>
          <p>有什么想和我聊的吗？</p>
        </div>
      </div>
    </div>

    <!-- 聊天输入框 -->
    <div class="chat-input-container">
      <chat-input :loading="isLoading" @send="handleSend" />
    </div>

    <!-- 设置面板 -->
    <SettingsPanel ref="settingDrawer" />

    <!-- 添加对话框组件 -->
    <DialogEdit ref="dialogEdit" />
  </div>
</template>

<style lang="scss" scoped>
/* 定义聊天容器的样式，占据整个视口高度，使用flex布局以支持列方向的布局 */
.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 设置聊天头部的样式，包括对齐方式和背景色等 */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: var(--bg-color);
  border-bottom: 1px solid #ffffff;

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;

    .action-btn {
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;

      img {
        width: 1.4rem;
        height: 1.4rem;
        opacity: 1;
        transition: filter 0.2s;
      }

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      }
    }

    .new-chat-btn {
      /* 基础尺寸设置 */
      font-size: 0.8rem;
      height: 2rem;
      padding: 0rem 0.5rem;

      /* 文字垂直居中对齐 */
      display: inline-flex; /* 使用 flex 布局 */
      align-items: center; /* 垂直居中对齐 */
      line-height: 1; /* 重置行高 */

      /* 圆角设置 - 添加胶囊形状 */
      border-radius: 9999px; /* 使用较大的值来确保完全的胶囊形状 */

      /* 未选中状态 */
      border: 1px solid #3f7af1;
      background-color: #ffffff;
      color: #3f7af1;

      /* 鼠标悬停效果 */
      &:hover {
        background-color: #3f7af1;
        border-color: #3f7af1;
        color: #ffffff;
      }

      /* 图标样式 */
      :deep(.el-icon) {
        margin-right: 4px;
        font-size: 0.875rem;
      }
    }

    /* 添加分隔线样式 */
    .divider {
      height: 1.5rem; /* 设置分隔线高度 */
      width: 1px; /* 设置分隔线宽度 */
      background-color: #e5e7eb; /* 设置分隔线颜色 */
      margin: 0 0.2rem; /* 设置左右间距 */
    }

    .title-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .chat-title {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-color-primary);
      }

      .edit-btn {
        opacity: 0;
        width: 0.9rem;
        height: 0.9rem;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s ease;

        img {
          width: 100%;
          height: 100%;
        }
      }

      &:hover {
        .edit-btn {
          opacity: 1;
        }
      }
    }
  }

  .header-right {
    display: flex;
    gap: 0.5rem;

    .action-btn {
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;

      img {
        width: 1.25rem;
        height: 1.25rem;
        opacity: 1;
        transition: filter 0.2s;
      }

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

        img {
          filter: brightness(0.4);
        }
      }
    }
  }
}

/* 定义消息容器的样式 */
.messages-container {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 垂直方向可滚动（虚拟滚动必需的） */
  overflow-x: hidden; /* 隐藏横向滚动 */
  padding: 0.6rem; /* 四周内边距 */
  background-color: var(--bg-color-secondary); /* 使用主题变量设置背景色 */

  /* 设置最大宽度和居中对齐，与输入框保持一致 */
  max-width: 796px; /* 设置最大宽度 */
  min-width: 0; /* 设置最小宽度 */
  margin: 0 auto; /* 水平居中 */
  width: 100%; /* 在最大宽度范围内占满宽度 */

  /* 虚拟滚动优化：使用 will-change 提升滚动性能 */
  will-change: scroll-position;

  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 6px; /* 滚动条宽度 */
  }

  &::-webkit-scrollbar-thumb {
    background-color: #ddd; /* 滚动条滑块颜色 */
    border-radius: 3px; /* 滚动条滑块圆角 */
  }

  &::-webkit-scrollbar-track {
    background-color: transparent; /* 滚动条轨道透明 */
  }

  /* 虚拟滚动容器内部样式 */
  > div[data-index] {
    /* 确保每个消息项占满容器宽度 */
    box-sizing: border-box;
  }
}

/* 设置空状态时的样式，占据全部高度，居中对齐内容 */
.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;

  .empty-content {
    text-align: center;

    .empty-icon {
      width: 64px;
      height: 64px;
      opacity: 0.6;
      margin-bottom: 1.5rem;
    }

    h2 {
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-color-primary);
      margin-bottom: 0.5rem;
    }

    p {
      font-size: 1rem;
      color: var(--text-color-secondary);
      margin: 0;
    }
  }
}

/* 添加输入框容器样式 */
.chat-input-container {
  position: sticky; /* 使用粘性定位，当滚动到底部时固定位置 */
  bottom: 0; /* 固定在底部 */
  left: 0; /* 左边缘对齐 */
  right: 0; /* 右边缘对齐 */
  background-color: var(--bg-color); /* 使用主题变量设置背景色 */
  z-index: 10; /* 设置层级，确保输入框始终显示在其他内容之上 */
  padding: 0.6rem; /* 添加内边距，让输入框与边缘保持距离 */
  // padding-top: 0; /* 移除顶部内边距，只保留底部和左右的间距 */

  /* 添加最大宽度和居中对齐 */
  max-width: 796px; /* 设置最大宽度 */
  margin: 0 auto; /* 水平居中 */
  width: 100%; /* 在最大宽度范围内占满宽度 */
}
</style>
