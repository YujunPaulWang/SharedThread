import { SharedArray } from "./SharedArray.js";
import type { SharedHeap } from "./SharedHeap.js";
import { SharedPointer } from "./SharedPointer.js";
import { SharedReference, type SharedReferenceStatic } from "./SharedReference.js";
import { SharedStruct, type VariableDeclaration } from "./SharedStruct.js";
import type { SharedType, SharedTypeClass } from "./SharedType.js";
import { SharedUint32 } from "./SharedUint32.js";
import { TypeRegistry } from "./TypeRegistry.js";


interface ArrayDefinition {
    type: SharedTypeClass,
    length?: number,
    array?: any[],
}

export interface SharedArrayList<T extends SharedType> {
    [index: number]: T;
}

export class SharedArrayList<T extends SharedType> extends SharedStruct {

    public static readonly INIT_SIZE = 10;
    public static readonly EXPANSION_FACTOR = 1.5;

    public static readonly properties: Record<string, VariableDeclaration> = {
        _length: { type: SharedUint32 },
        _internalLength: { type: SharedUint32 },
        arrayPtr: {
            type: SharedPointer, param: {
                type: SharedArray
            }
        },
    }

    /**
     * Overload for initializing a SharedReference wrapper from generic data.
     * 
     * @template U The expected return reference type.
     * @param heap The shared heap instantiation target.
     * @param v Generic input payload.
     * @returns A fresh reference instance.
     */
    static fromData<U extends SharedReference>(heap: SharedHeap, v: any): U;

    /**
     * Allocates memory on the heap and creates a SharedArrayList from an array definition.
     * Populates initial values if provided in the definition payload.
     * 
     * @template U The expected return reference type.
     * @this The constructor context bound to a SharedReference class type.
     * @param heap The target shared heap layout.
     * @param v Configuration detailing item layout, element type, optional length, and optional initial array values.
     * @returns A newly allocated SharedArrayList instance.
     */
    static fromData<U extends SharedReference>(
        this: (new (heap: SharedHeap, addr: number) => U) & SharedReferenceStatic,
        heap: SharedHeap,
        v: ArrayDefinition
    ): SharedArrayList<any> {
        let length = Math.max(v?.length ?? 0, v?.array?.length ?? 0, 0) ?? SharedArrayList.INIT_SIZE;

        let obj = super.fromData(heap, {}) as SharedStruct;

        let array = SharedArray.fromData(heap, {
            type: v.type,
            length,
            array: v.array,
        });

        if(obj.autoValue){
            obj._length = length;
        }else{
            obj._length.value = length;
        }
        obj.internalLength = length;

        let state = obj.autoDeref;
        obj.autoDeref = false;
        obj.arrayPtr.deref = array;
        obj.autoDeref = state;

        return obj as SharedArrayList<any>;
    }


    constructor(heap: SharedHeap, addr: number) {
        const parent = super(heap, addr) as any;

        return new Proxy(this, {
            get(target: SharedArrayList<T>, prop: string | Symbol, receiver: typeof Proxy) {
                if (typeof prop == "symbol") return Reflect.get(parent, prop, receiver);
                let n = Number(prop);
                if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0) {
                    if (n >= target.length) {
                        target.length = n + 1;
                    }
                    if(target.autoDeref){
                        return target.arrayPtr[n];
                    }else{
                        return target.arrayPtr.deref[n];
                    }
                }
                return Reflect.get(parent, prop as string, receiver);
            },
            set(target: SharedArrayList<T>, prop: string | Symbol, value: any, receiver: typeof Proxy) {
                if (typeof prop == "symbol") return Reflect.set(parent, prop, value, receiver);
                let n = Number(prop);
                if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0) {
                    if (n >= target.length) {
                        target.length = n + 1;
                    }
                    let array = target.arrayPtr;
                    if(!SharedStruct.autoDeref){
                        array = array.deref;
                    }
                    array[n] = value;
                    return true;
                }

                return Reflect.set(parent, prop as string, value, receiver);
            }
        });
    }
    get length(): number {
        if(this.autoValue){
            return this._length;
        }else{
            return this._length.value;
        }
    }
    set length(n: number) {
        if (n >= this.length && n >= this.internalLength) {
            let oldArray = this.autoDeref ? this.arrayPtr : this.arrayPtr.deref;
            let newLen = Math.max(1, this.internalLength);
            while (newLen < n) {
                newLen = newLen * SharedArrayList.EXPANSION_FACTOR;
            }
            let newArray = SharedArray.fromData(this._heap, {
                type: oldArray.elementType,
                length: newLen,
                //array: oldArray,
            }) as SharedArray<any>;
            for (let i = 0; i < oldArray.length; i++) {
                let v = oldArray.autoValue ? oldArray[i] : oldArray[i].value;
                if(newArray.autoValue){
                    newArray[i] = v;
                }else{
                    newArray[i].value = v;
                }
            }

            this.internalLength = newArray.length;
            this._heap.free(oldArray.addr);

            let state = this.autoDeref;
            this.autoDeref = false;
            this.arrayPtr.deref = newArray;
            this.autoDeref = state;
        }
        if(this.autoValue){
            this._length = n;
        }else{
            this._length.value = n;
        }
    }
    get internalLength(): number{
        if(this.autoValue){
            return this._internalLength;
        }else{
            return this._internalLength.value;
        }
    }
    set internalLength(n: number){
        if(this.autoValue){
            this._internalLength = n;
        }else{
            this._internalLength.value = n;
        }
    }

    /**
     * Creates an iterator that yields elements of the array.
     * 
     * @generator
     */
    *[Symbol.iterator]() {
        let array = this.autoDeref ? this.arrayPtr : this.arrayPtr.deref as SharedArray<any>;
        let len = this.length;
        for (let i = 0; i < len; i++) {
            yield array[i];
        }
    }
}
TypeRegistry.registerType(SharedArrayList);