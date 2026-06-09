import { SharedHeap } from "./SharedHeap.js";
import { SharedType } from "./SharedType.js";

export interface SharedReferenceStatic {
    typeID: number;
    isPtr: boolean;
    isArr: boolean;

    readonly byteSize: number;


    fromData<T extends SharedReference>(heap: SharedHeap, v: any): T;
    new(heap: SharedHeap, addr: number): SharedReference;
}

export abstract class SharedReference extends SharedType {
    public static typeID: number;
    public static readonly isPtr: boolean = false;
    public static readonly isArr: boolean = false;

    abstract get byteSize(): number;
}

export type SharedReferenceClass = SharedReferenceStatic;

