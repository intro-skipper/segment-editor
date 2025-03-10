import { useApiStore } from 'stores/api';

import {
  ImageType,
  ItemsApiGetItemsRequest,
  TvShowsApiGetEpisodesRequest,
} from '@jellyfin/sdk/lib/generated-client';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getLibraryStructureApi } from '@jellyfin/sdk/lib/utils/api/library-structure-api';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { ItemFields, ItemSortBy } from '@jellyfin/sdk/lib/generated-client';
import { getPluginsApi } from '@jellyfin/sdk/lib/utils/api/plugins-api';
import { ImageUrlsApi } from '@jellyfin/sdk/lib/utils/api/image-urls-api';
import { ImageRequestParameters } from '@jellyfin/sdk/lib/models/api/image-request-parameters';

export function useApi() {
  const { toApi } = useApiStore();

  // Get the typed API client
  const api = toApi();
  const itemsApi = getItemsApi(api);
  const libraryStructureApi = getLibraryStructureApi(api);
  const tvShowsApi = getTvShowsApi(api);
  const pluginsApi = getPluginsApi(api);
  const imageUrlsApi = new ImageUrlsApi(api.configuration);
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
    const params: ItemsApiGetItemsRequest = {
      parentId: collectionId,
      fields: [ItemFields.MediaStreams],
      sortBy: [ItemSortBy.AiredEpisodeOrder, ItemSortBy.SortName],
      isMissing: false,
    };
    const response = await itemsApi.getItems(params);
    return response.data;
  }

  // Get all collections
  async function getCollections() {
    const libraries = await libraryStructureApi.getVirtualFolders();
    return libraries.data;
  }

  // Get all episodes for a season
  async function getEpisodes(seriesId: string, seasonId: string) {
    const params: TvShowsApiGetEpisodesRequest = {
      seasonId: seasonId,
      seriesId: seriesId,
      fields: [ItemFields.MediaStreams],
      sortBy: ItemSortBy.AiredEpisodeOrder,
      isMissing: false,
    };
    const episodes = await tvShowsApi.getEpisodes(params);
    return episodes.data;
  }

  async function getPlugins() {
    const response = await pluginsApi.getPlugins();
    return response.data;
  }

  function getImageUrl(itemId: string, width = 133, height = 200, type: ImageType = ImageType.Primary) {
    const params: ImageRequestParameters = {
      width: width,
      height: height,
      tag: `segmenteditor_${itemId}_${type}`,
    };
    const response = imageUrlsApi.getItemImageUrlById(itemId, type, params);
    return response;
  }

  return { getItems, getEpisodes, getCollections, getPlugins, getImageUrl };
}
