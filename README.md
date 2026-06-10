# SharedThread

[![v1.0.1](https://img.shields.io/npm/v/sharedthread)](https://www.npmjs.com/package/sharedthread)

A high-performance asynchronous multithreading library that wraps Node.js Worker Threads and SharedArrayBuffer for efficient, zero-copy variable sharing.

## Features

- **Zero-Copy Architecture**: Uses `SharedArrayBuffer` to mutate variables across threads.
- **Type-Safe Worker Communication**: Fully typed API for passing tasks, payloads, and shared memory structures.
- **Promise-Based API**: Interact with low-level worker threads using clean, modern `async/await` patterns.

## Installation

Install the package and its peer dependencies via npm:

```bash
npm install sharedthread
```
## Usage


### 1. External Worker File (Recommended)

Isolate your worker execution logic in a dedicated file. Enabling `useTypescript` auto-configures Node to run `.ts` files directly using `--import tsx` under the hood.

#### `main.ts`
```typescript
import { MainThread } from 'sharedthread';

// check optimal parallel threads available on the host machine
console.log(`Optimal Threads: ${MainThread.optimalThreads}`); 

async function startWorker() {
  const thread = new MainThread("./my-worker.ts", {
    useTypescript: true,
    timeout: 5000, // messaging timeout for functions that expect responses
    workerOptions: { // any data you sent here can be accessed from the worker immediately
      workerData: { initialPayload: "Custom Meta Data" }
    }
  });

  // listen to cross-thread communication events(not required)
  thread.on('message', (data, label) => {
    console.log(`Received message with label [${label}]:`, data);
  });

  thread.on('error', (err) => {
    console.error('Thread threw an unhandled error:', err);
  });

  // wait safely until the worker signals it is online
  await thread.ready();
  console.log(`Thread status active: ${thread.isActive}`); // outputs: true
}

startWorker().catch(console.error);
```

#### `my-worker.ts`
```typescript
import { WorkerThread } from 'sharedthread';

console.log(`Read workerData as ${WorkerThread.workerData}`);

WorkerThread.on('message', (data, label) => {
  console.log(`Received message with label [${label}]:`, data);
});
```

### 2. Variable Sharing

A `SharedHeap` instance acts as a memory manager allowing for shared variables across threads.

#### `main.ts`
```typescript
import { MainThread, SharedHeap, SharedInt32 } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.ts");

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a shared int32 with a starting value of 10 on the heap
  const myInt32 = SharedInt32.fromData(myHeap, 10);

  // make the worker aware of the int32 and wait for confirmation
  await thread.addVar(myInt32, "myInt32");


}
startWorker().catch(console.error);
```

#### `my-worker.ts`
```typescript
import { WorkerThread } from "sharedthread";

async function runWorker(){
  // get the sharedheap(optional)
  const myHeap = WorkerThread.syncHeap("myHeap");

  // sync to the int32 of the main thread
  const myInt32 = await WorkerThread.syncVar("myInt32");

  console.log(myInt32.value); // outputs: 10
}
runWorker();
```

### 3. Shared Array

A `SharedArray` is a array of a fixed size that can be accessed across workers.

#### `main.ts`
```typescript
import { MainThread, SharedHeap, SharedArray, SharedInt32 } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.ts");

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a array of size 6 and type int32
  const myArray = SharedArray.fromData(myHeap, {
    type: SharedInt32,
    length: 6,
    // the array property can be used to set an initial value(optional)
    /*array: [3, 8, 3, 1, 0, -5],*/
  });
  myArray[3] = 1;

  // make the worker aware of the array and wait for confirmation
  await thread.addVar(myArray, "myArray");

}
startWorker().catch(console.error);
```

#### `my-worker.ts`
```typescript
import { WorkerThread } from 'sharedthread';

async function runWorker(){
  // sync to the array
  const myArray = await WorkerThread.syncVar("myArray");

  //read data from array
  console.log(myArray.length); // outputs: 6
  console.log(myArray[3]); // outputs: 1
}
runWorker();
```

### 4. Custom Struct

Any class that extends SharedStruct can act as a shared struct.

#### `my-types.ts`
```typescript
import { TypeRegistry, SharedStruct, SharedArray, SharedInt32 } from "sharedthread";

//it is reccomended to have the type declaration in a different file
//this allows both the main thead and the worker to access the type
export class MyStruct extends SharedStruct{
  static properties = {
    foo: { type: SharedInt32, param: 9},// int32 foo = 9
    bar: { type: SharedArray, param: { // int32[] bar = new int[7]
      type: SharedInt32,
      length: 7,
    }},
  }
}
/*equivalent structure
struct MyStruct{
  int32 foo = 9;
  int32[] arr = new int32[7];
}
*/

//notifies the libary to a custom type
TypeRegistry.registerType(MyStruct);
```

#### `main.ts`
```typescript
import { MainThread, SharedHeap } from "sharedthread";
import { MyStruct } from "./my-types.js";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.ts");

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a array of size 6 and type int32
  const myStruct = MyStruct.fromData(myHeap, {
    foo: 6, // set the initial value of foo to 6
  });
  // array is a reference type so it needs to be dereferenced when on another reference type
  myStruct.bar.deref[2] = 5;

  // make the worker aware of the struct and wait for confirmation
  await thread.addVar(myStruct, "myStruct");

}
startWorker().catch(console.error);
```

#### `my-worker.ts`
```typescript
import { WorkerThread } from 'sharedthread';

async function runWorker(){
  // sync to the array
  const myStruct = await WorkerThread.syncVar("myStruct");

  //read data from array
  console.log(myStruct.foo); // outputs: 6
  console.log(myStruct.bar.deref[2]); // outputs: 5
}
runWorker();
```
