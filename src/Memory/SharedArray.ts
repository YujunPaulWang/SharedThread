import type { SharedReference } from "./SharedReference.js";
import type { SharedType, SharedTypeClass } from "./SharedType.js";
import { SharedHeap } from "./SharedHeap.js";
import { SharedPointer } from "./SharedPointer.js";


export class SharedArray<T extends SharedType> implements SharedReference {
    private readonly _addr: number;
    private readonly _heap: SharedHeap;
    private readonly _elementType: SharedTypeClass;
    private readonly _elementSize: number;
    private readonly _length: number;

    private readonly elements: T[] = [];

    constructor(heap: SharedHeap, elementType: SharedTypeClass, init: T[] | number) {
        this._heap = heap;
        this._elementType = elementType;
        if ("size" in this._elementType) {
            this._elementSize = this._elementType.size as number;
        } else {
            this._elementType = SharedPointer;
            this._elementSize = SharedPointer.size;
        }

        if (typeof init == "number") {
            this._length = init;
            this._addr = heap.allocate(this._length * this._elementSize);

            for (let i: number = 0; i < this._length; i++) {
                this.elements[i] = new elementType(this._heap) as T;
            }
        } else {
            this._length = init.length;
            this._addr = heap.allocate(this._length * this._elementSize);

            for (let i: number = 0; i < this._length; i++) {
                this.elements[i] = new elementType(this._heap, init[i]) as T;
            }
        }

        Object.preventExtensions(this);

        return new Proxy(this, {
            get(target: SharedArray<T>, prop: any, receiver: typeof Proxy) {
                if (typeof prop == "number" && prop >= 0 && prop < target._length) {
                    return target.elements[prop];
                }

                return Reflect.get(target, prop, receiver);
            },
            set(target, prop, value, receiver) {
                if (typeof prop == "number" && prop >= 0 && prop < target._length) {
                    if (target.elements[prop] && "value" in target.elements[prop]) {
                        target.elements[prop].value = value;
                        return true;
                    }
                }

                return Reflect.set(target, prop, value, receiver);
            }
        });
    }

    get addr(): number {
        return this._addr;
    }
    get heap(): SharedHeap {
        return this._heap;
    }
    get elementType(): SharedTypeClass {
        return this._elementType;
    }
    get elementSize(): number {
        return this._elementSize;
    }
    get length(): number {
        return this._length;
    }
}

