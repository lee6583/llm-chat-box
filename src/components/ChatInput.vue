<script setup>
// 聊天输入组件：负责输入文本、上传文件、语音识别，并向父组件发送消息
import { computed, onBeforeUnmount, ref } from 'vue'
import { Close, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { createSpeechRecognition } from '@/utils/speech'
import { buildApiContentFromAttachments } from '@/utils/fileProcessor'

// 文本输入框的值（通过 v-model 与 UI 绑定）
const inputValue = ref('')
// 当前已选择的文件列表（包含图片和普通文件的元数据）
const fileList = ref([]) // 存储上传的文件列表
const isPreparing = ref(false)

// 语音识别相关的 UI 状态
const isListening = ref(false) // 是否正在录音
const interimText = ref('') // 识别中的临时文本
const speechError = ref('') // 语音识别错误提示文案

// 从父组件接收 loading 状态，用于禁用发送按钮和语音输入
const props = defineProps({
  loading: {
    type: Boolean, // loading 的类型为布尔值
    default: false, // 默认值为 false
  },
})

const isBusy = computed(() => props.loading || isPreparing.value)

// 定义对外暴露的事件，这里只有 send（发送消息）
const emit = defineEmits(['send'])

// 语音识别实例（基于 Web Speech API），统一封装回调
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

// 切换语音识别：点击麦克风触发
const toggleSpeech = () => {
  // 浏览器不支持或正在 loading 时，不允许开启
  if (!speech.isSupported || isBusy.value) return
  if (isListening.value) {
    speech.stop()
  } else {
    speech.start()
  }
}

// 组件销毁时，确保中止语音识别，释放系统资源
onBeforeUnmount(() => {
  if (speech.isSupported) speech.abort()
})

// 处理发送消息的方法
// 负责组装文本 + 文件，并通过 emit 通知父组件（ChatView）
const handleSend = async () => {
  const hasText = !!inputValue.value.trim()
  const hasFiles = fileList.value.length > 0
  if ((!hasText && !hasFiles) || isBusy.value) return

  isPreparing.value = true

  try {
    const { apiContent, displayText } = await buildApiContentFromAttachments(
      inputValue.value,
      fileList.value,
    )

    if (!apiContent) {
      ElMessage.warning('未检测到可发送的文本或附件内容')
      return
    }

    // 构建消息对象（files 仅保留可序列化字段，避免将 File 对象写入持久化 store）
    const messageContent = {
      text: displayText,
      apiContent,
      files: fileList.value.map(({ name, url, type, size }) => ({ name, url, type, size })),
    }

    // 触发 send 事件，将消息内容作为参数传递
    emit('send', messageContent)

    // 清空输入框和文件列表
    inputValue.value = ''
    fileList.value = []
  } catch (error) {
    ElMessage.error(error?.message || '附件处理失败，请稍后重试')
  } finally {
    isPreparing.value = false
  }
}

// 处理换行的方法（Shift + Enter）：插入换行而不是发送
const handleNewline = (e) => {
  e.preventDefault() // 阻止默认的 Enter 发送行为
  inputValue.value += '\n' // 在当前位置添加换行符
}

// 处理文件上传：拦截 el-upload 的默认上传，只在前端保存文件信息
const handleFileUpload = (uploadFile) => {
  // 确保获取到的是文件对象
  const file = uploadFile.raw
  if (!file) return false

  fileList.value.push({
    name: file.name,
    url: URL.createObjectURL(file),
    type: file.type.startsWith('image/') ? 'image' : 'file',
    size: file.size,
    raw: file,
  })
  return false // 阻止自动上传
}

// 移除文件：从预览列表中删除，并释放创建的临时 URL
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
    <!-- 文件预览区域 -->
    <div v-if="fileList.length > 0" class="preview-area">
      <div v-for="file in fileList" :key="file.url" class="preview-item">
        <!-- 图片预览 -->
        <div v-if="file.type === 'image'" class="image-preview">
          <img :src="file.url" :alt="file.name" />
          <div class="remove-btn" @click="handleFileRemove(file)">
            <el-icon><Close /></el-icon>
          </div>
        </div>
        <!-- 文件预览 -->
        <div v-else class="file-preview">
          <el-icon><Document /></el-icon>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-size">{{ (file.size / 1024).toFixed(1) }}KB</span>
          <div class="remove-btn" @click="handleFileRemove(file)">
            <el-icon><Close /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <el-input
      v-model="inputValue"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 6 }"
      placeholder="输入消息，或上传图片/文件；Enter 发送，Shift + Enter 换行"
      resize="none"
      @keydown.enter.exact.prevent="handleSend"
      @keydown.enter.shift="handleNewline"
    />
    <!-- 语音识别中间结果提示 -->
    <div v-if="isPreparing || interimText || speechError" class="speech-hint">
      <span v-if="isPreparing">正在处理附件内容...</span>
      <span v-if="interimText">🎤 {{ interimText }}</span>
      <span v-else-if="speechError">⚠️ {{ speechError }}</span>
    </div>
    <div class="button-group">
      <el-upload
        class="upload-btn"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleFileUpload"
        accept=".pdf,.doc,.docx,.txt"
      >
        <button class="action-btn">
          <img src="@/assets/photo/附件.png" alt="link" />
        </button>
      </el-upload>
      <button
        class="action-btn"
        :class="{ listening: isListening }"
        :disabled="!speech.isSupported || isBusy"
        @click="toggleSpeech"
        title="语音输入"
      >
        <img src="@/assets/photo/麦克风.png" alt="mic" />
      </button>
      <el-upload
        class="upload-btn"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleFileUpload"
        accept="image/*"
      >
        <button class="action-btn">
          <img src="@/assets/photo/图片.png" alt="picture" />
        </button>
      </el-upload>
      <div class="divider"></div>
      <button class="action-btn send-btn" :disabled="isBusy" @click="handleSend">
        <img src="@/assets/photo/发送.png" alt="send" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-input-wrapper {
  padding: 0.8rem;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  .speech-hint {
    margin-top: 6px;
    font-size: 12px;
    color: #555;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  /* 预览区域容器样式 */
  .preview-area {
    margin-bottom: 8px; /* 与输入框的间距 */
    display: flex; /* 使用弹性布局 */
    flex-wrap: wrap; /* 允许多行显示 */
    gap: 8px; /* 预览项之间的间距 */

    /* 预览项容器样式 */
    .preview-item {
      position: relative; /* 为删除按钮定位做准备 */
      border-radius: 8px; /* 圆角边框 */
      overflow: hidden; /* 隐藏超出部分 */

      /* 图片预览样式 */
      .image-preview {
        width: 60px; /* 固定宽度 */
        height: 60px; /* 固定高度，保持正方形 */

        img {
          width: 100%;
          height: 100%;
          object-fit: cover; /* 保持图片比例并填充容器 */
        }
      }

      /* 文件预览样式 */
      .file-preview {
        padding: 8px; /* 内边距 */
        background-color: #f4f4f5; /* 浅灰色背景 */
        border-radius: 8px; /* 圆角边框 */
        display: flex; /* 使用弹性布局 */
        align-items: center; /* 垂直居中对齐 */
        gap: 8px; /* 元素间距 */

        /* 文件名样式 */
        .file-name {
          max-width: 120px; /* 限制最大宽度 */
          overflow: hidden; /* 隐藏超出部分 */
          text-overflow: ellipsis; /* 超出显示省略号 */
          white-space: nowrap; /* 不换行 */
        }

        /* 文件大小样式 */
        .file-size {
          color: #909399; /* 浅灰色文字 */
          font-size: 12px; /* 小字体 */
        }
      }

      /* 删除按钮样式 */
      .remove-btn {
        position: absolute; /* 绝对定位 */
        top: 4px; /* 距顶部距离 */
        right: 4px; /* 距右侧距离 */
        width: 20px; /* 固定宽度 */
        height: 20px; /* 固定高度，保持正圆形 */
        background-color: rgba(0, 0, 0, 0.5); /* 半透明黑色背景 */
        border-radius: 50%; /* 圆形按钮 */
        display: flex; /* 使用弹性布局 */
        align-items: center; /* 垂直居中 */
        justify-content: center; /* 水平居中 */
        cursor: pointer; /* 鼠标指针样式 */
        color: white; /* 图标颜色 */

        /* 鼠标悬停效果 */
        &:hover {
          background-color: rgba(0, 0, 0, 0.7); /* 加深背景色 */
        }
      }
    }
  }

  /* 自定义输入框样式 */
  :deep(.el-textarea__inner) {
    border-radius: 8px;
    resize: none;
    border: none;
    box-shadow: none;

    &:focus {
      border: none;
      box-shadow: none;
    }
  }

  /* 按钮组容器样式 */
  .button-group {
    display: flex; /* 使用弹性布局 */
    justify-content: flex-end; /* 按钮靠右对齐 */
    margin-top: 0.25rem; /* 与输入框的上方间距 */
    gap: 0.5rem; /* 按钮之间的间距 */
    align-items: center; /* 垂直居中对齐，让分隔线居中 */

    .upload-btn {
      display: inline-block;
    }

    /* 分隔线样式 */
    .divider {
      height: 1rem; /* 分隔线高度16px */
      width: 1px; /* 分隔线宽度1px */
      background-color: var(--border-color); /* 使用主题变量设置颜色 */
      margin: 0; /* 重置所有边距 */
      margin-left: 0.125rem; /* 左边距2px */
      margin-right: 0.25rem; /* 右边距4px */
    }

    /* 通用按钮样式 */
    .action-btn {
      width: 1.75rem; /* 默认按钮宽度28px */
      height: 1.75rem; /* 默认按钮高度28px */
      border: none; /* 移除边框 */
      background: none; /* 移除背景色 */
      padding: 0; /* 移除内边距 */
      cursor: pointer; /* 鼠标悬停时显示手型 */
      border-radius: 50%; /* 圆形按钮 */
      display: flex; /* 使用弹性布局使图标居中 */
      align-items: center; /* 垂直居中 */
      justify-content: center; /* 水平居中 */
      transition: background-color 0.3s; /* 背景色过渡动画 */

      /* 按钮内图标样式 */
      img {
        width: 1rem; /* 默认图标宽度16px */
        height: 1rem; /* 默认图标高度16px */
      }

      /* 按钮悬停效果 */
      &:hover {
        background-color: rgba(0, 0, 0, 0.05); /* 悬停时显示浅灰色背景 */
      }

      &.listening {
        background-color: rgba(63, 122, 241, 0.1);
      }

      /* 发送按钮特殊样式 */
      &.send-btn {
        width: 2rem; /* 发送按钮宽度32px */
        height: 2rem; /* 发送按钮高度32px */
        background-color: #3f7af1; /* 蓝色背景 */

        img {
          width: 1.25rem; /* 发送按钮图标宽度20px */
          height: 1.25rem; /* 发送按钮图标高度20px */
        }

        &:hover {
          background-color: #3266d6; /* 悬停时加深背景色 */
        }
      }
    }
  }
}
</style>
