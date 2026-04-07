<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { WarningFilled } from '@element-plus/icons-vue'

const chatStore = useChatStore()
const dialogVisible = ref(false)
const inputTitle = ref('')
const currentConversationId = ref(null)
const dialogType = ref('edit')

const openDialog = (conversationId, type = 'edit') => {
  currentConversationId.value = conversationId
  dialogType.value = type

  if (type === 'edit') {
    const conversation = chatStore.conversations.find((item) => item.id === conversationId)
    inputTitle.value = conversation?.title || ''
  }

  dialogVisible.value = true
}

const handleConfirm = () => {
  if (dialogType.value === 'edit') {
    if (!inputTitle.value.trim()) {
      ElMessage.warning('标题不能为空')
      return
    }
    chatStore.updateConversationTitle(currentConversationId.value, inputTitle.value.trim())
    ElMessage.success('对话标题已更新')
  } else {
    chatStore.deleteConversation(currentConversationId.value)
    ElMessage.success('对话已删除')
  }

  dialogVisible.value = false
  inputTitle.value = ''
}

const handleCancel = () => {
  dialogVisible.value = false
  inputTitle.value = ''
}

defineExpose({
  openDialog,
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogType === 'edit' ? '编辑对话名称' : '确定删除对话？'"
    width="min(92vw, 420px)"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
  >
    <template v-if="dialogType === 'edit'">
      <el-input v-model="inputTitle" placeholder="请输入对话名称" maxlength="50" />
    </template>
    <template v-else>
      <div class="delete-warning">
        <el-icon class="warning-icon"><WarningFilled /></el-icon>
        <span>删除后，聊天记录将不可恢复。</span>
      </div>
    </template>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleCancel">取消</el-button>
        <el-button :type="dialogType === 'edit' ? 'primary' : 'danger'" @click="handleConfirm">
          {{ dialogType === 'edit' ? '保存' : '删除' }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.delete-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;

  .warning-icon {
    color: #ed3336;
    font-size: 20px;
  }
}
</style>
