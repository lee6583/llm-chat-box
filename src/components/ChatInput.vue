<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Close, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { createSpeechRecognition } from '@/utils/speech'
import { buildApiContentFromAttachments, getAttachmentQuickHint } from '@/utils/fileProcessor'

const inputRef = ref(null)
const fileList = ref([])
const isPreparing = ref(false)
const isListening = ref(false)
const interimText = ref('')
const speechError = ref('')

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  canStop: {
    type: Boolean,
    default: false,
  },
  draft: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['send', 'stop', 'update:draft'])
const isBusy = computed(() => props.loading || isPreparing.value)

const inputValue = computed({
  get: () => props.draft,
  set: (value) => emit('update:draft', value),
})

const previewHints = computed(() => fileList.value.map((file) => ({ ...file, hint: getAttachmentQuickHint(file) })))

const revokeAllUrls = () => {
  fileList.value.forEach((file) => {
    if (file?.url) URL.revokeObjectURL(file.url)
  })
}

const speech = createSpeechRecognition({
  lang: 'zh-CN',
  interimResults: true,
  continuous: true,
  onStart: () => {
    isListening.value = true
    interimText.value = ''
    speechError.value = ''
  },
  onEnd: () => {
    isListening.value = false
  },
  onResult: (text, isFinal) => {
    if (isFinal) {
      inputValue.value = inputValue.value ? `${inputValue.value} ${text}` : text
      interimText.value = ''
    } else {
      interimText.value = text
    }
  },
  onError: (err) => {
    speechError.value = err
    isListening.value = false
  },
})

const toggleSpeech = () => {
  if (!speech.isSupported || isBusy.value) return
  if (isListening.value) {
    speech.stop()
  } else {
    speech.start()
  }
}

const focusInput = () => {
  inputRef.value?.focus?.()
}

defineExpose({
  focusInput,
})

watch(
  () => props.loading,
  (loading) => {
    if (loading) {
      speechError.value = ''
    }
  },
)

onBeforeUnmount(() => {
  if (speech.isSupported) speech.abort()
  revokeAllUrls()
})

const resetLocalFiles = () => {
  revokeAllUrls()
  fileList.value = []
}

const handleSend = async () => {
  const hasText = !!inputValue.value.trim()
  const hasFiles = fileList.value.length > 0
  if ((!hasText && !hasFiles) || isBusy.value) return

  isPreparing.value = true

  try {
    const { apiContent, displayText, attachmentReport, messageFiles } = await buildApiContentFromAttachments(
      inputValue.value,
      fileList.value,
    )

    if (!apiContent) {
      ElMessage.warning('未检测到可发送的文本或附件内容')
      return
    }

    emit('send', {
      text: displayText,
      apiContent,
      attachmentReport,
      files: messageFiles,
    })

    inputValue.value = ''
    resetLocalFiles()
    speechError.value = ''
    interimText.value = ''
  } catch (error) {
    ElMessage.error(error?.message || '附件处理失败，请稍后重试')
  } finally {
    isPreparing.value = false
  }
}

const handleNewline = (event) => {
  event.preventDefault()
  inputValue.value += '\n'
}

const handleFileUpload = (uploadFile) => {
  const file = uploadFile.raw
  if (!file) return false

  const objectUrl = URL.createObjectURL(file)
  fileList.value.push({
    name: file.name,
    url: objectUrl,
    type: file.type.startsWith('image/') ? 'image' : 'file',
    size: file.size,
    raw: file,
  })
  return false
}

const handleFileRemove = (file) => {
  const index = fileList.value.findIndex((item) => item.url === file.url)
  if (index !== -1) {
    URL.revokeObjectURL(fileList.value[index].url)
    fileList.value.splice(index, 1)
  }
}
</script>

<template>
  <div class="chat-input-wrapper">
    <div v-if="previewHints.length > 0" class="preview-area">
      <div v-for="file in previewHints" :key="file.url" class="preview-item">
        <div v-if="file.type === 'image'" class="image-preview">
          <img :src="file.url" :alt="file.name" />
          <button class="remove-btn" type="button" aria-label="移除图片" @click="handleFileRemove(file)">
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <div v-else class="file-preview">
          <el-icon><Document /></el-icon>
          <div class="file-meta">
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">{{ (file.size / 1024).toFixed(1) }}KB</span>
          </div>
          <button class="remove-btn inline" type="button" aria-label="移除附件" @click="handleFileRemove(file)">
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <div class="hint-line" :class="`is-${file.hint.status}`">{{ file.hint.detail }}</div>
      </div>
    </div>

    <el-input
      ref="inputRef"
      v-model="inputValue"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 6 }"
      placeholder="输入消息，或上传图片/文件；Enter 发送，Shift + Enter 换行"
      resize="none"
      @keydown.enter.exact.prevent="handleSend"
      @keydown.enter.shift="handleNewline"
    />

    <div v-if="isPreparing || interimText || speechError" class="speech-hint">
      <span v-if="isPreparing">正在处理附件内容…</span>
      <span v-else-if="interimText">🎤 {{ interimText }}</span>
      <span v-else-if="speechError">⚠️ {{ speechError }}</span>
    </div>

    <div class="toolbar-footer">
      <div class="input-tips">支持图片、PDF、DOCX、TXT、Markdown、代码/日志类文本附件。</div>
      <div class="button-group">
        <el-upload
          class="upload-btn"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleFileUpload"
          accept=".pdf,.doc,.docx,.txt,.md,.markdown,.json,.csv,.tsv,.js,.ts,.jsx,.tsx,.html,.xml,.yaml,.yml,.log,.sql,.py,.java,.go,.rs,.css,.scss"
        >
          <button class="action-btn" type="button" aria-label="上传文档附件">
            <img src="@/assets/photo/附件.png" alt="附件" />
          </button>
        </el-upload>

        <button
          class="action-btn"
          :class="{ listening: isListening }"
          :disabled="!speech.isSupported || isBusy"
          type="button"
          aria-label="语音输入"
          @click="toggleSpeech"
        >
          <img src="@/assets/photo/麦克风.png" alt="语音" />
        </button>

        <el-upload
          class="upload-btn"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleFileUpload"
          accept="image/*"
        >
          <button class="action-btn" type="button" aria-label="上传图片">
            <img src="@/assets/photo/图片.png" alt="图片" />
          </button>
        </el-upload>

        <div class="divider"></div>

        <button
          v-if="canStop"
          class="action-btn stop-btn"
          type="button"
          aria-label="停止生成"
          @click="emit('stop')"
        >
          停止
        </button>
        <button
          v-else
          class="action-btn send-btn"
          :disabled="isBusy"
          type="button"
          aria-label="发送消息"
          @click="handleSend"
        >
          <img src="@/assets/photo/发送.png" alt="发送" />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-input-wrapper {
  padding: 0.8rem;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.06);

  .preview-area {
    margin-bottom: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }

  .preview-item {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 10px;
    background: #fafafa;

    .image-preview {
      position: relative;
      width: 100%;
      height: 120px;
      border-radius: 10px;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .file-preview {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 50px;

      .file-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .file-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }

      .file-size {
        color: #6b7280;
        font-size: 12px;
      }
    }

    .hint-line {
      margin-top: 8px;
      font-size: 12px;
      line-height: 1.4;

      &.is-success,
      &.is-image {
        color: #0f766e;
      }

      &.is-warning {
        color: #b45309;
      }
    }
  }

  .remove-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &.inline {
      position: static;
      margin-left: auto;
      background: #e5e7eb;
      color: #111827;
      flex-shrink: 0;
    }
  }

  .speech-hint {
    margin-top: 6px;
    font-size: 12px;
    color: #4b5563;
  }

  .toolbar-footer {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .input-tips {
    color: #6b7280;
    font-size: 12px;
    line-height: 1.4;
  }

  .button-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .divider {
    width: 1px;
    height: 20px;
    background: #e5e7eb;
  }

  .action-btn {
    min-width: 36px;
    height: 36px;
    padding: 0 10px;
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

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.listening {
      border-color: #ef4444;
      background: #fff1f2;
    }
  }

  .send-btn {
    background: #2563eb;
    border-color: #2563eb;

    img {
      filter: brightness(0) invert(1);
    }
  }

  .stop-btn {
    color: #b91c1c;
    border-color: #fecaca;
    background: #fff1f2;
    font-size: 13px;
    font-weight: 600;
  }

  :deep(.el-textarea__inner) {
    border: none;
    box-shadow: none;
    padding: 6px 0;
    font-size: 15px;
    line-height: 1.6;
    min-height: 28px !important;
  }
}

@media (max-width: 768px) {
  .chat-input-wrapper {
    .toolbar-footer {
      align-items: stretch;
    }

    .button-group {
      width: 100%;
      justify-content: flex-end;
    }

    .preview-area {
      grid-template-columns: 1fr;
    }
  }
}
</style>
