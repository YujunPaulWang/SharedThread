import type { SharedHeap } from "../Memory/SharedHeap.js";
import type { SharedPrimitiveStatic } from "../Memory/SharedPrimitive.js";
import { SharedInt32, type int32 } from "../Memory/SharedInt32.js";

import { threadId } from "node:worker_threads";

export class Mutex extends SharedInt32 {
    static readonly threadID: number = threadId;
    static readonly UNLOCKED: number = -1;

    static readonly atomicViews: Int32Array[];


    static fromData(heap: SharedHeap): Mutex {
        let addr = heap.allocate(SharedInt32.byteSize, SharedInt32.typeID);
        let obj = new Mutex(heap, addr);
        obj.value = Mutex.UNLOCKED as int32;

        return obj;
    }

    private readonly viewAddr: number;
    private readonly view: Int32Array;
    private refCount: number = 0;

    constructor(heap: SharedHeap, addr: number) {
        super(heap, addr);

        if (!(heap.heapID in Mutex.atomicViews)) {
            Mutex.atomicViews[heap.heapID] = new Int32Array(heap.buffer);
        }

        this.view = Mutex.atomicViews[heap.heapID] as Int32Array;
        this.viewAddr = Math.floor(addr / 4);
    }

    async lock(timeout?:number): Promise<void> {
        //increase count
        if(Atomics.load(this.view, this.viewAddr) == Mutex.threadID){
            this.refCount++;
            return;
        }

        while(true){
            //try to aquire lock
            let currValue = Atomics.compareExchange(this.view, this.viewAddr, Mutex.UNLOCKED, Mutex.threadID);
            if(currValue === Mutex.UNLOCKED){
                this.refCount = 1;
                return;
            }

            //wait until notif
            let tmp = Atomics.waitAsync(this.view, this.viewAddr, currValue, timeout);
            if(tmp.async){
                await tmp.value;
            }
        }
    }
    unlock() {
        if(Atomics.load(this.view, this.viewAddr) != Mutex.threadID)throw Error("cannot free lock from other thread");

        this.refCount--;

        if(this.refCount == 0){
            Atomics.compareExchange(this.view, this.viewAddr, Mutex.threadID, Mutex.UNLOCKED);

            //notif
            Atomics.notify(this.view, Mutex.threadID, 1);
        }
    }


    set value(_v: int32) {
        throw new Error("cannot modify mutex values");
    }

    get value(): int32{
        return Atomics.load(this.view, this.viewAddr) as int32;
    }
}
Mutex satisfies SharedPrimitiveStatic<int32>;