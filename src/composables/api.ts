import { useApiStore } from 'stores/api'

import { VirtualFolderInfo, ImageType, ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import { getItemsApi  } from '@jellyfin/sdk/lib/utils/api/items-api'
import { Jellyfin } from '@jellyfin/sdk'
import { ItemFields, ItemSortBy } from '@jellyfin/sdk/lib/generated-client'


export function useApi() {
  const { fetchWithAuthJson, fetchWithAuth, serverAddress, apiKey } = useApiStore()
  const jellyfin = new Jellyfin({
    clientInfo: {
      name: 'Jellyfin Segment Editor',
      version: '0.4.7'
    },
    deviceInfo: {
      name: 'Web Browser',
      id: 'segment-editor-browser'
    }
  })
  const api = jellyfin.createApi(serverAddress, apiKey)

  // Get the typed API client
  const itemsApi = getItemsApi(api)
  /*
    type RequestBody = {
      userId: number
      title: string
      body: string
    }

    type ResponseBody = RequestBody & {
      id: string
    }

    const newPost = {
      userId: 1,
      title: 'my post',
      body: 'some content',
    }

    const response = await fetch.post<RequestBody, ResponseBody>(
      'https://jsonplaceholder.typicode.com/posts',
      newPost,
    )
  */

  // Get items for collection
  /*
  async function getItems(collectionId: string, index?: number) {
    const query: Map<string, any> = new Map();
    query.set('parentId', collectionId);
    query.set('fields', 'MediaStreams');
    query.set('sortBy', 'AiredEpisodeOrder,SortName');
    query.set('isMissing', 'false');
    if (index != undefined) {
      // TODO all broken?!?!
      //query.set('startIndex', index)
      //query.set('parentIndexNumber', index)
      //query.set('searchTerm', 'Ava')
      //query.set('limit', '5')
    }

    const items = await fetchWithAuthJson('Items', query)
    return items;
  }
  */

  async function getItems(collectionId: string, index?: number) {
    const params = {
      parentId: collectionId,
      fields: [ItemFields.MediaStreams],
      sortBy: [ItemSortBy.AiredEpisodeOrder, ItemSortBy.SortName],
      isMissing: false
    } as ItemsApiGetItemsRequest

    const response = await itemsApi.getItems(params)
    return response.data
  }

  // Get all collections
  async function getCollections() {
    const collections: VirtualFolderInfo[] = await fetchWithAuthJson('Library/VirtualFolders')
    return collections
  }

  // Get Image for item
  async function getImage(itemId: string, width = 133, height = 200, type: ImageType = ImageType.Primary) {
    const query: Map<string, any> = new Map();

    query.set('tag', `segmenteditor_${itemId}_${type}`);
    query.set('width', width);
    query.set('height', height);

    const image = await fetchWithAuth(`Items/${itemId}/Images/${type}`)
    return image
  }

  return { getItems, getImage, getCollections }
}
