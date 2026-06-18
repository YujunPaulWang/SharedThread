import { TypeRegistry } from "../Memory/TypeRegistry.js";
import { Thread, type PortHandle, type ThreadStatic, type WorkerMessage } from "./Thread.js";

import { parentPort, threadName, threadId, workerData } from "node:worker_threads";


export class WorkerThread extends Thread {

    private _workerData: any = workerData.workerData;

    /**
     * Creates and initializes a new WorkerThread instance connected to the parent thread port.
     */
    constructor() {
        if (parentPort == null) throw new Error("cannot find parent port");
        super(parentPort as PortHandle, workerData.orig.config);

        this._workerData = workerData.orig.default;
        queueMicrotask(() => {
            TypeRegistry.verifyTypeBuffer(workerData.types);
        });

        //set up event handlers
        this.port.on("message", async(msg: WorkerMessage) => {
            const delay = (t: number) => new Promise(res => setTimeout(res, t));
            this.emit("internalmessage", msg);
            let c = 0;
            switch (msg.tag) {
                case "message":
                    this.emit("message", msg.data, msg.label);
                    break;
                case "sync":
                    while(!this.emit("sync", msg.name, msg.buffer, msg.heapID, msg.rebound)){
                        await delay(5);
                        if(c++ > 100){
                            console.warn("unmatched syncHeap/addHeap");
                            break;
                        }
                    }
                    break;
                case "assign":
                    while(!this.emit("assign", msg.name, msg.heapID, msg.addr, msg.rebound)){
                        await delay(5);
                        if(c++ > 100){
                            console.warn("unmatched syncVar/addVar");
                            break;
                        }
                    }
                    break;
                case "signal":
                    while(!this.emit("signal", msg.label)){
                        await delay(10);
                        if(c++ > 100){
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
     * Gets the initial configuration data passed to this worker thread.
     */
    public get workerData() {
        return this._workerData;
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