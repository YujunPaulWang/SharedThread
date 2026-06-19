import type { SharedHeap } from "../Memory/SharedHeap.js";
import { SharedInt32, type int32 } from "../Memory/SharedInt32.js";
import { type SharedPrimitiveStatic } from "../Memory/SharedPrimitive.js";
import { TypeRegistry } from "../Memory/TypeRegistry.js";

import { threadId } from "node:worker_threads";


export class Semaphore extends SharedInt32 {
    static readonly threadID: number = threadId;
    static readonly UNLOCKED: number = -1;

    static readonly atomicViews: Int32Array[];


    static fromData(heap: SharedHeap, maxRes: int32): Semaphore {
        let addr = heap.allocate(Semaphore.byteSize, Semaphore.typeID);
        let obj = new Semaphore(heap, addr);
        Atomics.store(obj.view, obj.viewAddr, maxRes);

        return obj;
    }

    private readonly viewAddr: number;
    private readonly view: Int32Array;

    constructor(heap: SharedHeap, addr: number) {
        super(heap, addr);

        if (!(heap.heapID in Semaphore.atomicViews)) {
            Semaphore.atomicViews[heap.heapID] = new Int32Array(heap.buffer);
        }

        this.view = Semaphore.atomicViews[heap.heapID] as Int32Array;
        this.viewAddr = Math.floor(addr / 4);
    }

    async acquire(timeout?: number): Promise<void>{
        while(true){
            let currValue = Atomics.load(this.view, this.viewAddr);

            if(currValue > 0){
                let tmp = Atomics.compareExchange(this.view, this.viewAddr, currValue, currValue - 1);

                if(currValue == tmp){
                    return;
                }
                continue;
            }

            let tmp = Atomics.waitAsync(this.view, this.viewAddr, 0, timeout);

            if(tmp.async){
                await tmp.value;
            }
        }
    }

    release(){
        Atomics.add(this.view, this.viewAddr, 1);
        Atomics.notify(this.view, this.viewAddr, 1);
    }

    async use(lmb: Function, timeout?: number) : Promise<void> {
        try {
            await this.acquire(timeout);
            return await lmb();
        } catch (e) {
            throw e;
        } finally {
            this.release();
        }
    }


    set value(_v: int32) {
        throw new Error("cannot modify semaphore values");
    }

    get value(): int32 {
        return Atomics.load(this.view, this.viewAddr) as int32;
    }
}
Semaphore satisfies SharedPrimitiveStatic<int32>;

TypeRegistry.registerType(Semaphore);