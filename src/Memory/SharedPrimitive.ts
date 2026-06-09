import { SharedHeap } from "./SharedHeap.js";
import { SharedType } from "./SharedType.js";

export interface SharedPrimitiveStatic<T> {
    typeID: number;
    byteSize: number
    isPtr: boolean;
    isArr: boolean;

    fromData(heap: SharedHeap, v: any): SharedPrimitive<T>;
    new(heap: SharedHeap, addr: number): SharedPrimitive<T>;
}

export abstract class SharedPrimitive<T> extends SharedType {
    public static typeID: number;
    public static readonly byteSize: number;
    public static readonly isPtr: boolean = false;
    public static readonly isArr: boolean = false;

    public abstract set value(v: T);
    public abstract get value(): T;
}

export type SharedPrimitiveClass<T> = SharedPrimitiveStatic<T>;