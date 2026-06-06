import { SharedHeap } from "./SharedHeap.js";

export interface SharedPrimitiveStatic<T> {
    readonly size: number;

    new(heap: SharedHeap, v?: T | null): SharedPrimitive<T>;

    //read(heap: SharedHeap, addr: number): T;
    //write(heap: SharedHeap, addr: number, v: T): void;
}

export interface SharedPrimitive<T> {
    readonly addr: number;
    readonly heap: SharedHeap;

    set value(v: T);
    get value(): T;
}
