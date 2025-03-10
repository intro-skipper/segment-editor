<template>
  <div class="column">
    <div class="row items-center">
      <q-btn @click="$router.back()" color="primary" round>
        <i-mdi-chevron-left></i-mdi-chevron-left>
      </q-btn>
      <div class="q-ml-md text-h6">
        {{
          item.SeriesName
            ? `${item.SeriesName} S${item.ParentIndexNumber}E${item.IndexNumber}: ${item.Name}`
            : item.Name
        }}
      </div>
    </div>
    <player
      @create-segment="createSegmentFromPlayer"
      :timestamp="playerTimestamp"
      :item="item"
      @update-segment-timestamp="newSegmentTimestamp = $event"
    ></player>
    <div class="row justify-center" v-if="!showVideoPlayer">
      <plus-new-segment
        @create-segment="createSegmentFromPlayer"
      ></plus-new-segment>
    </div>
    <div class="q-my-md">
      <SegmentSlider
        @player-timestamp="updatePlayerTimestamp"
        @update:model-value="updateItem"
        @delete-segment="deleteLocalSegment"
        @update-active-index="activeIdx = $event"
        :idx="idx"
        :activeIdx="activeIdx"
        :newTimestamp="newSegmentTimestamp"
        v-for="(segment, idx) in editingSegments"
        :segment="segment"
        :segments="editingSegments"
        :item="item"
        :key="segment.Id"
        min="0"
        :max="runtimeSeconds"
        thumb-label="always"
        class="full-width q-mt-sm"
      >
      </SegmentSlider>
      <div v-if="!editingSegments.length" class="row justify-center">
        <div>{{ $t('editor.noSegments') }}</div>
      </div>
    </div>

    <div class="row justify-center col">
      <q-btn @click="saveAllSegments"> {{ $t('editor.saveSegment') }}</q-btn>
      <q-btn @click="$router.back()"> {{ $t('back') }}</q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUtils } from 'src/composables/utils';
import {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@jellyfin/sdk/lib/generated-client';
import { useSegmentsStore } from 'stores/segments';
import { useItemsStore } from 'stores/items';

import { storeToRefs } from 'pinia';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from 'stores/app';

const appStore = useAppStore();
const { showVideoPlayer } = storeToRefs(appStore);

const { sortSegmentsStart, ticksToMs, generateUUID } = useUtils();

const route = useRoute();
const router = useRouter();
const segmentsStore = useSegmentsStore();
const itemsStore = useItemsStore();
const { saveNewSegments, deleteSegments } = segmentsStore;
const { localSegments } = storeToRefs(segmentsStore);
const { localItems } = storeToRefs(itemsStore);
const playerTimestamp = ref<number | undefined>(undefined);
// the current active segmentslider which reacts to player start/end time pushes
const activeIdx = ref(0);
const newSegmentTimestamp = ref<object | undefined>({});
// get current item from params
const item = localItems.value.find(
  (i: BaseItemDto) => i.Id === route.params.itemId,
) as BaseItemDto;
if (item === undefined) {
  router.push('/');
}
// fetch segments
if (route.query.fetchSegments) await segmentsStore.getNewSegmentsById(item.Id);

const segs = localSegments.value
  .filter((seg: MediaSegmentDto) => seg.ItemId == item.Id)
  .sort(sortSegmentsStart);
let editingSegments = reactive(JSON.parse(JSON.stringify(segs)));

const runtimeSeconds = ticksToMs(item.RunTimeTicks) / 1000;

const updateItem = (obj: any) => {
  const found = editingSegments.find(
    (seg: MediaSegmentDto) => seg.Id == obj.id,
  );
  if (found) {
    found.StartTicks = obj.start;
    found.EndTicks = obj.end;
  }
};

const updatePlayerTimestamp = (newtimestamp: number) => {
  // reset prop
  setTimeout(() => (playerTimestamp.value = undefined), 500);
  playerTimestamp.value = newtimestamp;
};

const createSegmentFromPlayer = (obj: {
  type: MediaSegmentType;
  start: number;
  end: number;
}) => {
  const seg: MediaSegmentDto = {
    Type: obj.type,
    StartTicks: obj.start,
    EndTicks: obj.end ? obj.end : obj.start + 1,
    ItemId: item.Id,
    Id: generateUUID(),
  };

  editingSegments.push(seg);
  activeIdx.value = editingSegments.length - 1;
};

const deleteLocalSegment = (idx: number) => {
  editingSegments.splice(idx, 1);
};

const saveAllSegments = () => {
  // delete all current segments
  deleteSegments(item.Id);
  // save all
  saveNewSegments(editingSegments);
  // navigate back
  router.back();
};
</script>
