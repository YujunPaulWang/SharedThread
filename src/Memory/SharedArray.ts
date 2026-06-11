import { SharedReference, type SharedReferenceStatic } from "./SharedReference.js";
import { SharedType, type SharedTypeClass } from "./SharedType.js";
import { SharedHeap } from "./SharedHeap.js";
import { SharedPointer } from "./SharedPointer.js";
import { SharedPrimitive, type SharedPrimitiveClass } from "./SharedPrimitive.js";
import { TypeRegistry } from "./TypeRegistry.js";
import { SharedUint32 } from "./SharedUint32.js";
import type { VariableDeclaration } from "./SharedStruct.js";

interface ArrayDefinition {
    type: SharedTypeClass,
    length: number,
    array?: any[],
}

export interface SharedArray<T extends SharedType> {
    [index: number]: T;
}

export class SharedArray<T extends SharedType> extends SharedReference {

    public static readonly isArr: boolean = true;

    public static readonly properties: Record<string, VariableDeclaration> = {
        length: { type: SharedUint32 },
    }

    static fromData<U extends SharedReference>(heap: SharedHeap, v: any): U;

    static fromData<U extends SharedReference>(
        this: (new (heap: SharedHeap, addr: number) => U) & SharedReferenceStatic,
        heap: SharedHeap,
        v: ArrayDefinition
    ): U {
        let length = v.length;
        let type = v.type;
        if (type.prototype instanceof SharedPrimitive) {
            type = type as SharedPrimitiveClass<any>;
        } else {
            type = SharedPointer;
        }
        let elementSize = type.byteSize;
        let totalSize = 4 + elementSize * length;
        let addr = heap.allocate(totalSize, type.typeID, false, true);
        heap.view.setUint32(addr, length);

        let obj = new this(heap, addr) as any;

        if (v.array) {
            for (let i = 0; i < length; i++) {
                obj.elements[i].value = v.array[i];
            }
        }

        return obj as U;
    }


    protected readonly _heldType: SharedTypeClass;
    protected readonly _elementType: SharedTypeClass;
    protected readonly _elementSize: number;
    protected readonly _byteSize: number;
    protected readonly _length: number;

    protected readonly elements: T[] = [];


    constructor(heap: SharedHeap, addr: number) {
        super(heap, addr);

        this._elementType = TypeRegistry.getTypeByIndex(heap.getTypeIDAt(addr));
        this._heldType = heap.getPtrAt(addr) ? SharedPointer : this._elementType;
        this._elementSize = (this._heldType as SharedPrimitiveClass<T>).byteSize;
        this._length = heap.view.getUint32(addr);
        this._byteSize = 4 + this._elementSize * this._length;

        let offset = 4;
        for (let i = 0; i < this._length; i++, offset += this._elementSize) {
            this.elements.push(new this._heldType(heap, addr + offset) as unknown as T);
        }


        return new Proxy(this, {
            get(target: SharedArray<T>, prop: any, receiver: typeof Proxy) {
                let n = Number(prop);
                if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0 && n < target._length) {
                    if (target.elements[n] != undefined) {
                        return target.elements[n];
                    }
                }

                return Reflect.get(target, prop, receiver);
            },
            set(target, prop, value, receiver) {
                let n = Number(prop);
                if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0 && n < target._length) {
                    if (target.elements[n] != undefined) {
                        if (target.elements[n] instanceof SharedPrimitive) {
                            target.elements[n].value = value;
                            return true;
                        } else if (target.elements[n] instanceof SharedPointer) {
                            target.elements[n].value = value.addr;
                            return true;
                        }
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
    get heldType(): SharedTypeClass {
        return this._heldType;
    }
    get elementType(): SharedTypeClass {
        return this._elementType;
    }
    get elementSize(): number {
        return this._elementSize;
    }
    static get byteSize(): number {
        throw new Error("cannot precalculate array size");
    };
    get byteSize(): number {
        return this._byteSize;
    }
    get length(): number {
        return this._length;
    }
}
SharedArray satisfies SharedReferenceStatic;

