import { SharedArray } from "../Memory/SharedArray.js";
import { SharedHeap } from "../Memory/SharedHeap.js";
import { SharedPointer } from "../Memory/SharedPointer.js";
import type { SharedType, SharedTypeClass } from "../Memory/SharedType.js";
import { TypeRegistry } from "../Memory/TypeRegistry.js";
import { Thread, type PortHandle, type ThreadStatic, type WorkerMessage } from "./Thread.js";

import { parentPort, threadName, threadId, workerData } from "node:worker_threads";


export class WorkerThread extends Thread {

    private _workerData: any = workerData.workerData;

    private _heaps: Map<string, SharedHeap> = new Map();
    private _variables: Map<string, SharedType> = new Map();

    /**
     * Creates and initializes a new WorkerThread instance connected to the parent thread port.
     */
    constructor() {
        if (parentPort == null) throw new Error("cannot find parent port");
        super(parentPort as PortHandle, workerData.orig.config);

        this._workerData = workerData.orig.default;

        //set up event handlers
        this.port.on("message", async (msg: WorkerMessage) => {
            const delay = (t: number) => new Promise(res => setTimeout(res, t));
            this.emit("internalmessage", msg);
            let c = 0;
            switch (msg.tag) {
                case "message":
                    this.emit("message", msg.data, msg.label);
                    break;
                case "sync":
                    while (!this.emit("sync", msg.name, msg.buffer, msg.heapID, msg.rebound)) {
                        await delay(5);
                        if (c++ > 100) {
                            console.warn("unmatched syncHeap/addHeap");
                            break;
                        }
                    }
                    break;
                case "assign":
                    while (!this.emit("assign", msg.name, msg.heapID, msg.addr, msg.rebound)) {
                        await delay(5);
                        if (c++ > 100) {
                            console.warn("unmatched syncVar/addVar");
                            break;
                        }
                    }
                    break;
                case "signal":
                    while (!this.emit("signal", msg.label)) {
                        await delay(10);
                        if (c++ > 100) {
                            console.warn("unmatched waitFor/signal");
                            break;
                        }
                    }
                    break;
            }
        });

        this.port.on("messageerror", (err: Error) => {
            let caught: boolean = this.emit("messageerror", err);

            if (!caught) {
                this.err(err);
            }
        });
    }

    /**
     * verify types and load variables
     */
    public verifyTypes(){
        TypeRegistry.verifyTypeBuffer(workerData.types);

        //get variables and heaps
        for (let name in workerData.heaps) {
            let { heapID, buffer } = workerData.heaps[name];
            let heap = new SharedHeap(buffer as SharedArrayBuffer, heapID);
            this._heaps.set(name, heap);
        }
        for (let name in workerData.variables) {
            let { heapID, addr } = workerData.variables[name];
            let heap = SharedHeap.getHeapByID(heapID);
            let isArr: number = heap.getArrayAt(addr);
            let isPtr: number = heap.getPtrAt(addr);
            let dataType: SharedTypeClass = TypeRegistry.getTypeByIndex(heap.getTypeIDAt(addr));
            let data: SharedType;

            if (isArr) {
                data = new SharedArray(heap, addr);
            } else if (isPtr) {
                data = new SharedPointer(heap, addr);
            } else {
                data = new dataType(heap, addr);
            }
            this._variables.set(name, data);
        }
    }

    /**
     * Gets the initial configuration data passed to this worker thread.
     */
    public get workerData() {
        return this._workerData;
    }

    /**
     * Gets a heap by name
     * @param name the name of the heap
     */
    public getHeap(name: string) {
        if (!this._heaps.has(name)) {
            throw new Error("cannot find heap");
        }
        return this._heaps.get(name);
    }

    /**
     * Gets a heap by name
     * @param name the name of the heap
     */
    public getVar(name: string) {
        if (!this._variables.has(name)) {
            throw new Error("cannot find variable");
        }
        return this._variables.get(name);
    }

    /**
     * Formats and throws an internal execution error for the worker thread environment.
     * @param msg The error instance or error message string.
     */
    private err(msg: string | Error) {
        ///TODO
        throw new Error(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    }
}
WorkerThread satisfies ThreadStatic;