<template>
  <div
    v-for="key in keyboardKeys"
    :key="`kkey_${key}`"
    class="keyboard-keys q-px-xs q-ma-xs items-center"
  >
    {{ key }}
  </div>
</template>

<script setup lang="ts">
interface Props {
  keyboardKeys: string[];
}

defineProps<Props>();
</script>

<style>
.keyboard-keys {
  display: inline-block;
  border-style: solid;
  border-radius: 5px;
  border-width: 2px;
  border-color: darkgray;
  min-width: 27px;
  text-align: center;
  color: darkgray;
}
</style>
