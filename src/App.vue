<template>
  <div v-if="!isReady" class="global-loading">
    正在连接服务器，请稍候...
  </div>
  <router-view v-show="isReady" />
</template>

<script setup>
import { ref, onMounted } from 'vue'
const isReady = ref(false)
onMounted(() => {
  // 稍微延迟显示内容，等网络请求
  setTimeout(() => { isReady.value = true }, 500)
})
</script>

<style>
.global-loading {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f6fa;
  color: #409eff;
  font-size: 16px;
}
</style>
