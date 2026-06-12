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
        super(parentPort as PortHandle, workerData.config);

        this._workerData = workerData.default;
        queueMicrotask(() => {
            TypeRegistry.verifyTypeBuffer(workerData.types);
        });

        //set up event handlers
        this.port.on("message", (msg: WorkerMessage) => {
            this.emit("internalmessage", msg);
            switch (msg.tag) {
                case "message":
                    this.emit("message", msg.data, msg.label);
                    //todo
                    break;
                case "sync":
                    this.emit("sync", msg.name, msg.buffer, msg.heapID, msg.rebound);
                    //todo
                    break;
                case "assign":
                    this.emit("assign", msg.name, msg.heapID, msg.addr, msg.rebound);
                    //todo
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