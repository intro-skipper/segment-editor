<template>
  <div class="row items-center">
    <q-btn @click="$router.back()" color="primary" round>
      <i-mdi-chevron-left></i-mdi-chevron-left>
    </q-btn>
    <div class="q-ml-md text-h6">
      {{ albums[0].AlbumArtist }}
    </div>
  </div>
  <div class="row q-mt-md">
    <div
      class="album-cover-container cursor-pointer q-ma-sm relative-position"
      v-for="item in albums"
      :key="item.Id"
      @click="$router.push(`/album/${item.Id}`)"
    >
      <ItemImage :width="200" :height="200" :item="item"> </ItemImage>
      <div class="text-ellipsis text-center absolute album-cover-subtext">
        {{ item.Name }}
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from 'src/composables/api';
import { useRoute, useRouter } from 'vue-router';
import { useItemsStore } from 'stores/items';

const { pushMoreItems } = useItemsStore();
const route = useRoute();
const router = useRouter();
const { getItems } = useApi();

// get current item from params
const itemId = route.params.itemId;
if (itemId === undefined) {
  router.replace('/');
}

const ralbums = await getItems(itemId as string);
const albums: BaseItemDto[] = ralbums.Items;
// push items into local cache
pushMoreItems(albums);
</script>

<style>
.album-cover-container {
  width: 200px;
  height: 230px;
}

.album-cover-subtext {
  bottom: 0px;
  height: 20px;
  width: 200px;
}
</style>
