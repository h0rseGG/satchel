import { useMemo } from 'preact/hooks';
import { useLive } from './useLive.js';
import { captureData } from '../data/capture.js';
import { buildNameIndex } from '../core/mentions.js';
import { createIndex, indexRecords } from '../core/search.js';
import { tagCounts } from '../core/tags.js';
import { sortTypes } from '../core/types.js';

// Names, types, tag counts and the search index, rebuilt when the data changes.
export function useCapture() {
  const data = useLive(captureData, [], null);
  return useMemo(() => {
    if (!data) return null;
    const typesById = new Map(data.types.map((t) => [t.id, t]));
    const live = data.entities.filter((e) => !e.deleted);
    return {
      entities: live,
      byId: new Map(data.entities.map((e) => [e.id, e])),
      types: sortTypes(data.types.filter((t) => !t.deleted)),
      typesById,
      nameIndex: buildNameIndex(data.entities, typesById),
      searchIndex: indexRecords(createIndex(), { notes: data.notes, entities: live, typesById }),
      tags: tagCounts(data.notes),
    };
  }, [data]);
}
