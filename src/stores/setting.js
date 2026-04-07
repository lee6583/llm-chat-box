import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingStore = defineStore(
  'llm-setting',
  () => {
    const settings = ref({
      model: 'gpt-5.4',
      apiBaseUrl: '',
      apiKey: '',
      stream: true,
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.7,
      topK: 50,
    })

    return {
      settings,
    }
  },
  {
    persist: true,
  },
)

export const modelOptions = [
  { label: 'GPT-5.4', value: 'gpt-5.4', maxTokens: 4096 },
  { label: 'GPT-5.3 Codex', value: 'gpt-5.3-codex', maxTokens: 4096 },
  { label: 'GPT-5', value: 'gpt-5', maxTokens: 4096 },
  { label: 'GPT-5 Mini', value: 'gpt-5-mini', maxTokens: 4096 },
  { label: 'GPT-4.1', value: 'gpt-4.1', maxTokens: 4096 },
  { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini', maxTokens: 4096 },
  { label: 'DeepSeek R1', value: 'deepseek-r1', maxTokens: 8192 },
]
