<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { Document, ArrowDown, WarningFilled } from '@element-plus/icons-vue'
import copyIcon from '@/assets/photo/复制.png'
import successIcon from '@/assets/photo/成功.png'
import likeIcon from '@/assets/photo/赞.png'
import likeActiveIcon from '@/assets/photo/赞2.png'
import dislikeIcon from '@/assets/photo/踩.png'
import dislikeActiveIcon from '@/assets/photo/踩2.png'
import regenerateIcon from '@/assets/photo/重新生成.png'
import thinkingIcon from '@/assets/photo/深度思考.png'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
  isLastAssistantMessage: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['regenerate', 'retry', 'open-settings'])
const isLiked = ref(false)
const isDisliked = ref(false)
const isCopied = ref(false)
const isReasoningExpanded = ref(true)
const messageRoot = ref(null)

const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value
}

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content || props.message.errorDetail || '')
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2500)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

const handleLike = () => {
  if (isDisliked.value) isDisliked.value = false
  isLiked.value = !isLiked.value
}

const handleDislike = () => {
  if (isLiked.value) isLiked.value = false
  isDisliked.value = !isDisliked.value
}

const handleCodeCopy = async (codeBlock) => {
  if (!codeBlock) return
  const code = codeBlock.querySelector('code')?.textContent || ''
  try {
    await navigator.clipboard.writeText(code)
  } catch (error) {
    console.error('复制代码失败:', error)
  }
}

const handleThemeToggle = (codeBlock, themeBtn) => {
  if (!codeBlock || !themeBtn) return
  const themeIcon = themeBtn.querySelector('img')
  if (!themeIcon) return
  const lightIcon = themeIcon.dataset.lightIcon
  const darkIcon = themeIcon.dataset.darkIcon
  codeBlock.classList.toggle('dark-theme')
  themeIcon.src = codeBlock.classList.contains('dark-theme') ? lightIcon : darkIcon
}

const handleCodeActionClick = async (event) => {
  const actionButton = event.target.closest('[data-action]')
  if (!actionButton || !messageRoot.value?.contains(actionButton)) return
  const codeBlock = actionButton.closest('.code-block')
  if (!codeBlock) return

  const action = actionButton.dataset.action
  if (action === 'copy') {
    await handleCodeCopy(codeBlock)
  } else if (action === 'theme') {
    handleThemeToggle(codeBlock, actionButton)
  }
}

onMounted(() => {
  messageRoot.value?.addEventListener('click', handleCodeActionClick)
})

onUnmounted(() => {
  messageRoot.value?.removeEventListener('click', handleCodeActionClick)
})

const renderedContent = computed(() => renderMarkdown(props.message.content || ''))
const renderedReasoning = computed(() =>
  props.message.reasoning_content ? renderMarkdown(props.message.reasoning_content) : '',
)
const hasError = computed(() => props.message.status === 'error')
</script>

<template>
  <div class="message-item" :class="{ 'is-mine': message.role === 'user' }">
    <div ref="messageRoot" class="content">
      <div v-if="message.files && message.files.length > 0" class="files-container">
        <div
          v-for="file in message.files"
          :key="file.url || `${file.name}-${file.size || 0}`"
          class="file-item"
        >
          <div v-if="file.type === 'image'" class="image-preview">
            <img :src="file.url" :alt="file.name" />
          </div>
          <div v-else class="file-preview">
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">{{ (file.size / 1024).toFixed(1) }}KB</span>
          </div>
        </div>
      </div>

      <div v-if="message.attachmentReport?.items?.length" class="attachment-report">
        <div class="report-header">
          <span>附件处理结果</span>
          <span class="report-summary">{{ message.attachmentReport.summary }}</span>
        </div>
        <ul>
          <li
            v-for="item in message.attachmentReport.items"
            :key="`${item.name}-${item.detail}`"
            :class="`is-${item.status}`"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>

      <div v-if="message.loading && message.role === 'assistant'" class="thinking-text">
        <img src="@/assets/photo/加载中.png" alt="loading" class="loading-icon" />
        <span>内容生成中…</span>
      </div>

      <div v-if="message.reasoning_content" class="reasoning-toggle" @click="toggleReasoning">
        <img :src="thinkingIcon" alt="深度思考" />
        <span>深度思考</span>
        <el-icon class="toggle-icon" :class="{ 'is-expanded': isReasoningExpanded }">
          <ArrowDown />
        </el-icon>
      </div>

      <div
        v-if="message.reasoning_content && isReasoningExpanded"
        class="reasoning markdown-body"
        v-html="renderedReasoning"
      ></div>

      <div v-if="hasError" class="error-card">
        <div class="error-title-row">
          <el-icon><WarningFilled /></el-icon>
          <strong>{{ message.errorTitle || '请求失败' }}</strong>
        </div>
        <p>{{ message.errorDetail || '这次回复没有成功返回。' }}</p>
        <div class="error-actions">
          <button type="button" class="secondary-btn" @click="emit('retry')">重试本轮</button>
          <button type="button" class="secondary-btn" @click="emit('open-settings')">打开设置</button>
          <button
            v-if="isLastAssistantMessage"
            type="button"
            class="secondary-btn"
            @click="emit('regenerate')"
          >
            重新生成
          </button>
        </div>
      </div>
      <div v-else class="bubble markdown-body" v-html="renderedContent"></div>

      <div v-if="message.role === 'assistant' && message.loading === false" class="message-actions">
        <button
          v-if="isLastAssistantMessage && !hasError"
          class="action-btn"
          type="button"
          aria-label="重新生成回答"
          data-tooltip="重新生成"
          @click="emit('regenerate')"
        >
          <img :src="regenerateIcon" alt="重新生成" />
        </button>
        <button
          class="action-btn"
          type="button"
          aria-label="复制消息"
          data-tooltip="复制"
          @click="handleCopy"
        >
          <img :src="isCopied ? successIcon : copyIcon" alt="复制" />
        </button>
        <button
          v-if="!hasError"
          class="action-btn"
          type="button"
          aria-label="喜欢这条回复"
          data-tooltip="喜欢"
          @click="handleLike"
        >
          <img :src="isLiked ? likeActiveIcon : likeIcon" alt="喜欢" />
        </button>
        <button
          v-if="!hasError"
          class="action-btn"
          type="button"
          aria-label="不喜欢这条回复"
          data-tooltip="不喜欢"
          @click="handleDislike"
        >
          <img :src="isDisliked ? dislikeActiveIcon : dislikeIcon" alt="不喜欢" />
        </button>
        <span v-if="message.completion_tokens && !hasError" class="tokens-info">
          {{ message.completion_tokens }} tokens · {{ message.speed }} tokens/s
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-item {
  display: flex;
  margin-bottom: 1.5rem;

  &.is-mine {
    justify-content: flex-end;

    .content {
      width: auto;
      max-width: min(100%, 760px);
      margin-left: auto;
    }

    .bubble,
    .attachment-report {
      background-color: #f5f7fb;
    }

    .bubble,
    .attachment-report,
    .files-container {
      margin-left: auto;
    }
  }

  .content {
    width: min(100%, 760px);
    min-width: 0;
  }

  .bubble,
  .reasoning,
  .error-card,
  .attachment-report {
    border-radius: 16px;
    padding: 14px 16px;
  }

  .bubble {
    background: #ffffff;
    border: 1px solid #eef2f7;
    line-height: 1.65;
    word-break: break-word;
    overflow: hidden;

    :deep(.code-block) {
      margin: 0.75rem 0;
      border: 1px solid var(--code-border);
      border-radius: 12px;
      overflow: hidden;
      width: 100%;

      > pre {
        margin: 0 !important;
      }

      .code-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.875rem;
        background-color: var(--code-header-bg);

        .code-lang {
          font-size: 0.875rem;
          color: var(--code-lang-text);
          font-family: var(--code-font-family);
        }

        .code-actions {
          display: flex;
          gap: 0.5rem;

          .code-action-btn {
            width: 1.75rem;
            height: 1.75rem;
            border: none;
            background: none;
            cursor: pointer;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;

            img {
              width: 1rem;
              height: 1rem;
            }

            &::after {
              content: attr(data-tooltip);
              position: absolute;
              bottom: calc(100% + 6px);
              left: 50%;
              transform: translateX(-50%);
              padding: 0.25rem 0.5rem;
              background: rgba(17, 24, 39, 0.88);
              color: #fff;
              font-size: 12px;
              border-radius: 6px;
              opacity: 0;
              visibility: hidden;
              white-space: nowrap;
            }

            &:hover {
              background: var(--code-header-button-hover-bg);
            }

            &:hover::after {
              opacity: 1;
              visibility: visible;
            }
          }
        }
      }

      pre.hljs {
        margin: 0 !important;
        padding: 1rem;
        background: var(--code-block-bg);
        overflow-x: auto;
      }
    }

    :deep(p) {
      margin: 0;
      &:not(:last-child) {
        margin-bottom: 0.75rem;
      }
    }

    :deep(code:not(pre code)) {
      font-family: var(--code-font-family);
      padding: 0.15em 0.4em;
      border-radius: 6px;
      background-color: #f3f4f6;
    }

    :deep(ul),
    :deep(ol) {
      margin: 0.75rem 0;
      padding-left: 1.5rem;
    }

    :deep(blockquote) {
      margin: 0.75rem 0;
      padding-left: 1rem;
      border-left: 4px solid var(--border-color);
      color: var(--text-color-secondary);
    }

    :deep(table) {
      border-collapse: collapse;
      width: 100%;
      margin: 0.75rem 0;

      th,
      td {
        border: 1px solid var(--border-color);
        padding: 0.5rem;
      }

      th {
        background: #f8fafc;
      }
    }

    :deep(a) {
      color: #2563eb;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    :deep(img) {
      max-width: 100%;
      border-radius: 10px;
    }
  }

  .reasoning-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: #eef4ff;
    color: #2563eb;
    cursor: pointer;

    img {
      width: 14px;
      height: 14px;
    }

    .toggle-icon {
      transition: transform 0.2s ease;

      &.is-expanded {
        transform: rotate(180deg);
      }
    }
  }

  .reasoning {
    margin-bottom: 10px;
    background: #f8fafc;
    border-left: 3px solid #cbd5e1;
    color: #475569;
  }

  .attachment-report {
    margin-bottom: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;

    .report-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 13px;
      color: #334155;
    }

    .report-summary {
      color: #64748b;
    }

    ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0;
      margin: 0;
    }

    li {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 13px;
      color: #475569;

      strong {
        color: #0f172a;
      }

      &.is-success,
      &.is-image {
        color: #0f766e;
      }

      &.is-warning {
        color: #b45309;
      }
    }
  }

  .error-card {
    border: 1px solid #fecaca;
    background: #fff7f7;
    color: #7f1d1d;

    .error-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    p {
      margin: 0;
      line-height: 1.6;
    }

    .error-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .secondary-btn {
      border: 1px solid #fca5a5;
      background: #fff;
      color: #991b1b;
      border-radius: 999px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
    }
  }

  .message-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding-left: 6px;
  }

  .action-btn {
    width: 30px;
    height: 30px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;

    img {
      width: 16px;
      height: 16px;
    }

    &::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      padding: 0.25rem 0.5rem;
      background: rgba(17, 24, 39, 0.88);
      color: #fff;
      font-size: 12px;
      border-radius: 6px;
      opacity: 0;
      visibility: hidden;
      white-space: nowrap;
    }

    &:hover {
      background: rgba(15, 23, 42, 0.06);
    }

    &:hover::after {
      opacity: 1;
      visibility: visible;
    }
  }

  .tokens-info {
    color: #64748b;
    font-size: 12px;
    background: #f8fafc;
    border-radius: 999px;
    padding: 4px 10px;
  }

  .thinking-text {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0.75rem 0.25rem;
    color: #64748b;
    font-size: 14px;

    .loading-icon {
      width: 16px;
      height: 16px;
      animation: spin 1s linear infinite;
    }
  }
}

.files-container {
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .image-preview {
    max-width: 220px;
    border-radius: 12px;
    overflow: hidden;

    img {
      display: block;
      max-width: 100%;
      height: auto;
    }
  }

  .file-preview {
    padding: 8px 10px;
    background: #f3f4f6;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 8px;

    .file-name {
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      color: #6b7280;
      font-size: 12px;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .message-item {
    margin-bottom: 1rem;

    .content {
      width: 100%;
    }

    .bubble,
    .reasoning,
    .attachment-report,
    .error-card {
      padding: 12px;
      border-radius: 14px;
    }
  }
}
</style>
