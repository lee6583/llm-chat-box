<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import DialogEdit from '@/components/DialogEdit.vue'

const isVisible = ref(false)
const keyword = ref('')
const chatStore = useChatStore()
const dialogEdit = ref(null)

const filteredConversations = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return chatStore.conversations
  return chatStore.conversations.filter((conversation) => {
    const title = String(conversation.title || '').toLowerCase()
    const preview = String(chatStore.getConversationPreview(conversation) || '').toLowerCase()
    return title.includes(query) || preview.includes(query)
  })
})

const handleClickOutside = (event) => {
  const wrapper = document.querySelector('.popup-wrapper')
  if (wrapper && !wrapper.contains(event.target)) {
    isVisible.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const toggle = () => {
  isVisible.value = !isVisible.value
}

const handleNewChat = () => {
  chatStore.createConversation()
  isVisible.value = false
}

const handleSwitchChat = (conversationId) => {
  chatStore.switchConversation(conversationId)
  isVisible.value = false
}

defineExpose({
  toggle,
})
</script>

<template>
  <div class="popup-wrapper">
    <button class="action-btn" type="button" aria-label="打开历史对话列表" @click="toggle">
      <img src="@/assets/photo/弹出框.png" alt="菜单" />
    </button>

    <Transition
      enter-active-class="animate__animated animate__fadeInLeft"
      leave-active-class="animate__animated animate__fadeOutLeft"
    >
      <div v-show="isVisible" class="popup-menu">
        <div class="menu-top">
          <el-button class="new-chat-btn" :icon="Plus" @click="handleNewChat">新对话</el-button>
          <div class="search-box">
            <el-icon><Search /></el-icon>
            <input v-model="keyword" type="text" placeholder="搜索对话或内容" aria-label="搜索历史对话" />
          </div>
        </div>

        <div class="section-title">历史对话</div>
        <div v-if="filteredConversations.length > 0" class="history-list">
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="menu-item"
            :class="{ active: conversation.id === chatStore.currentConversationId }"
            @click="handleSwitchChat(conversation.id)"
          >
            <div class="item-main">
              <div class="item-row">
                <span class="item-title" :title="conversation.title">{{ conversation.title }}</span>
                <span class="item-time">{{ chatStore.getConversationTimeText(conversation) }}</span>
              </div>
              <p class="item-preview">{{ chatStore.getConversationPreview(conversation) }}</p>
            </div>
            <div class="item-actions">
              <button
                class="action-btn small"
                type="button"
                aria-label="编辑对话标题"
                @click.stop="dialogEdit.openDialog(conversation.id, 'edit')"
              >
                <img src="@/assets/photo/编辑.png" alt="编辑" />
              </button>
              <button
                class="action-btn small"
                type="button"
                aria-label="删除当前对话"
                @click.stop="dialogEdit.openDialog(conversation.id, 'delete')"
              >
                <img src="@/assets/photo/删除.png" alt="删除" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-list">没有找到匹配的会话</div>
      </div>
    </Transition>

    <DialogEdit ref="dialogEdit" />
  </div>
</template>

<style lang="scss" scoped>
.popup-wrapper {
  position: relative;

  .action-btn {
    width: 34px;
    height: 34px;
    border: 1px solid #e5e7eb;
    background: #fff;
    border-radius: 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s ease;

    img {
      width: 18px;
      height: 18px;
    }

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    }

    &.small {
      width: 28px;
      height: 28px;
      border-radius: 8px;
    }
  }
}

.popup-menu {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  width: 320px;
  max-height: min(70vh, 640px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #fff;
  border-radius: 18px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
  z-index: 1000;
}

.menu-top {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.new-chat-btn {
  width: 100%;
  border-radius: 999px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 10px;
  background: #f8fafc;

  input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    outline: none;
    font-size: 13px;
  }
}

.section-title {
  margin: 14px 0 8px;
  font-size: 12px;
  color: #64748b;
}

.history-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: 0.2s ease;

  &:hover,
  &.active {
    background: #f8fbff;
    border-color: #dbeafe;
  }
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-time {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 12px;
}

.item-preview {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  opacity: 0;
  transition: 0.2s ease;
}

.menu-item:hover .item-actions,
.menu-item.active .item-actions {
  opacity: 1;
}

.empty-list {
  padding: 24px 12px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 768px) {
  .popup-menu {
    width: min(90vw, 320px);
  }
}
</style>
