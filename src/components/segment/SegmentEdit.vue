<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', false)"
  >
    <q-card style="width: 300px">
      <q-card-section>
        <div class="row">
          <div class="text-h6 col-10 text-ellipsis">
            {{ t('segment.edit') }}
          </div>
          <div class="col-shrink col-2">
            <q-btn flat @click="$emit('update:modelValue', false)"
              ><q-icon><i-mdi-close /></q-icon
            ></q-btn>
          </div>
          <div class="text-subtitle2 col-12">
            <div class="wrap">{{ item.Name }}: {{ localSegment.Type }}</div>
            <div>
              {{ t('segment.start') }}:
              {{
                getReadableTimeFromSeconds(
                  Math.round(localSegment.StartTicks ?? 0),
                )
              }}
            </div>
            <div>
              {{ t('segment.end') }}:
              {{
                getReadableTimeFromSeconds(
                  Math.round(localSegment.EndTicks ?? 0),
                )
              }}
            </div>
            <div>
              {{ t('segment.duration') }}:
              {{
                getReadableTimeFromSeconds(
                  Math.round(
                    (localSegment.EndTicks ?? 0) -
                      (localSegment.StartTicks ?? 0),
                  ),
                )
              }}
            </div>
          </div>
        </div>
      </q-card-section>
      <q-card-section>
        <q-input
          v-model.number="localSegment.StartTicks"
          :label="t('segment.start')"
          :rules="[rule]"
          reactive-rules
          suffix="s"
          type="number"
        >
          <template #prepend>
            <i-mdi-ray-start-arrow />
          </template>
        </q-input>
        <q-input
          v-model.number="localSegment.EndTicks"
          :label="t('segment.end')"
          :rules="[rule]"
          reactive-rules
          suffix="s"
          type="number"
        >
          <template #prepend>
            <i-mdi-ray-end-arrow />
          </template>
        </q-input>
      </q-card-section>
      <q-card-actions align="around">
        <q-btn @click.prevent="saveSegment">{{
          t('editor.saveSegment')
        }}</q-btn>
        <q-btn @click.prevent="saveSegmentClipboard"
          ><i-mdi-content-copy
        /></q-btn>
        <q-btn @click.prevent="openConfirmDialog"><i-mdi-delete /></q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { MediaSegmentDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUtils } from 'src/composables/utils';
import { useQuasar } from 'quasar';
import { useSessionStore } from 'stores/session';

const { saveSegmentToClipboard } = useSessionStore();
const { getReadableTimeFromSeconds } = useUtils();
const { t } = useI18n();
const $q = useQuasar();

interface Props {
  modelValue: boolean;
  segment: MediaSegmentDto;
  item: BaseItemDto;
}

const props = defineProps<Props>();
const emit = defineEmits(['update:modelValue', 'saveSegment', 'deleteSegment']);

let localSegment = reactive(props.segment);

// whenever we push a new prop we want a copy from it for editing
watch(
  () => props.segment,
  (newValue: Props['segment']) => {
    localSegment = reactive(JSON.parse(JSON.stringify(newValue)));
  },
);

const saveSegment = () => {
  if (rule() !== true) return;
  // we need to delete segment first
  emit('deleteSegment', JSON.parse(JSON.stringify(localSegment)));
  emit('saveSegment', JSON.parse(JSON.stringify(localSegment)));
};
const deleteSegment = () => {
  emit('deleteSegment', JSON.parse(JSON.stringify(localSegment)));
};

const rule = () =>
  (localSegment.StartTicks ?? 0) >= (localSegment.EndTicks ?? 0)
    ? t('validation.StartEnd')
    : true;

const openConfirmDialog = () => {
  $q.dialog({
    title: t('editor.deleteSureTitle'),
    message: t('editor.deleteSure', { Type: localSegment.Type }),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    deleteSegment();
  });
};

const saveSegmentClipboard = () => {
  saveSegmentToClipboard(localSegment);
  $q.notify({ message: t('editor.segmentCopiedToClipboard') });
};
</script>
