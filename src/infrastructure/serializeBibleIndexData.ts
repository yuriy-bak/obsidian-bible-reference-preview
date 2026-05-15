import { BibleIndexData } from "./BibleIndexData";

export function serializeBibleIndexData(data: BibleIndexData): string {
    return JSON.stringify(data, null, 2);
}
