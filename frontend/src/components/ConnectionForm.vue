<template>
  <el-dialog v-model="visible" :title="isEdit ? 'Edit Connection' : 'New Connection'" width="500px">
    <el-form id="conn-form" :model="form" label-width="100px" @submit.prevent="onConnect">
      <el-form-item label="Name">
        <el-input v-model="form.name" placeholder="My Server" />
      </el-form-item>
      <el-form-item label="Type">
        <el-radio-group v-model="form.type">
          <el-radio-button label="ssh">SSH</el-radio-button>
          <el-radio-button label="sftp">SFTP</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Host">
        <el-input v-model="form.host" placeholder="192.168.1.1" />
      </el-form-item>
      <el-form-item label="Port">
        <el-input-number v-model="form.port" :min="1" :max="65535" />
      </el-form-item>
      <el-form-item label="User">
        <el-input v-model="form.user" placeholder="root" />
      </el-form-item>
      <el-form-item label="Auth Type">
        <el-radio-group v-model="form.authType">
          <el-radio-button label="password">Password</el-radio-button>
          <el-radio-button label="key">Key</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.authType === 'password'" label="Password">
        <el-input v-model="form.password" type="password" show-password />
      </el-form-item>
      <el-form-item v-if="form.authType === 'key'" label="Key Path">
        <el-input v-model="form.keyPath" placeholder="~/.ssh/id_rsa" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">Cancel</el-button>
      <el-button type="primary" native-type="submit" form="conn-form">{{ isEdit ? 'Save & Connect' : 'Connect' }}</el-button>
      <el-button @click="onSave">{{ isEdit ? 'Save' : 'Save Only' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import type { ConnectionConfig } from '../types/session'

const props = defineProps<{
  modelValue: boolean
  editConfig?: ConnectionConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [config: ConnectionConfig]
  connect: [config: ConnectionConfig]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const isEdit = computed(() => !!props.editConfig)

const form = reactive<ConnectionConfig>({
  id: '',
  name: '',
  type: 'ssh',
  host: '',
  port: 22,
  user: '',
  authType: 'password',
  password: '',
  keyPath: ''
})

watch(() => props.editConfig, (config) => {
  if (config) {
    Object.assign(form, { ...config })
  } else {
    resetForm()
  }
}, { immediate: true })

function resetForm() {
  form.id = ''
  form.name = ''
  form.type = 'ssh'
  form.host = ''
  form.port = 22
  form.user = ''
  form.authType = 'password'
  form.password = ''
  form.keyPath = ''
}

function onSave() {
  emit('save', { ...form })
  visible.value = false
  if (!props.editConfig) {
    resetForm()
  }
}

function onConnect() {
  emit('connect', { ...form })
  visible.value = false
  if (!props.editConfig) {
    resetForm()
  }
}
</script>
