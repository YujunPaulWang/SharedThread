import { SharedHeap } from "./SharedHeap.js";

export interface SharedReference {
    readonly addr: number;
    readonly heap: SharedHeap;
}

