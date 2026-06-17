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

Isolate your worker execution logic in a dedicated file. Enabling `useTypescript` auto-configures Node to run `.js` files directly using `--import tsx` under the hood.

#### `main.js`
```typescript
import { MainThread } from 'sharedthread';

// check optimal parallel threads available on the host machine
console.log(`Optimal Threads: ${MainThread.optimalThreads}`); 

async function startWorker() {
  const thread = new MainThread("./my-worker.js", {
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

#### `my-worker.js`
```typescript
import { WorkerThread } from 'sharedthread';

console.log(`Read workerData as ${WorkerThread.workerData}`);

WorkerThread.on('message', (data, label) => {
  console.log(`Received message with label [${label}]:`, data);
});
```

### 2. Variable Sharing

A `SharedHeap` instance acts as a memory manager allowing for shared variables across threads.

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedInt32 } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);

  //wait for worker to setup(prevents rare race conditions)
  await thread.waitFor("worker setup");

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a shared int32 with a starting value of 10 on the heap
  const myInt32 = SharedInt32.fromData(myHeap, 10);

  // make the worker aware of the int32 and wait for confirmation
  await thread.addVar(myInt32, "myInt32");

  //change value
    myInt32.value = 25;

  //tell the worker that the value was modified
  thread.signal("modify value");


}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from "sharedthread";

async function runWorker(){
  // sync the heap
  const promisedHeap = WorkerThread.syncHeap("myHeap");

  // sync to the int32 of the main thread
  const promisedInt32 = WorkerThread.syncVar("myInt32");

  //tell main thread that setup is done
  WorkerThread.signal("worker setup");

  await promisedHeap;

  const myInt32 = await promisedInt32;

  //wait for the value to be mofified
  await WorkerThread.waitFor("modify value");


  console.log(myInt32.value); // outputs: 25
}
runWorker();
```

### 3. Shared Array

A `SharedArray` is a array of a fixed size that can be accessed across workers.

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedArray, SharedInt32 } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);
  await thread.waitFor("worker setup");

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a array of size 6 and type int32
  const myArray = SharedArray.fromData(myHeap, {
    type: SharedInt32,
    length: 3,
    // the array property can be used to set an initial value(optional)
    array: [3, 8, 4],
  });

  // make the worker aware of the array and wait for confirmation
  await thread.addVar(myArray, "myArray");

  //subtract 5 from every value
  for(let i = 0; i < 3; i++){
    myArray[i].value -= 5;
  }

  thread.signal("modify value");

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
async function runWorker(){
  // sync the heap
  const promisedHeap = WorkerThread.syncHeap("myHeap");

  // sync to the array(and get the promise);
  const promisedArray = WorkerThread.syncVar("myArray");

  WorkerThread.signal("worker setup");

  await promisedHeap;

  const myArray = await promisedArray;

  //read value before modification
  console.log(myArray[0].value); //outputs: 3
  console.log(myArray[1].value); //outputs: 8
  console.log(myArray[2].value); //outputs: 4

  await WorkerThread.waitFor("modify value");

  //read data from array after modification
  console.log(myArray[0].value); //outputs: -2
  console.log(myArray[1].value); //outputs: 3
  console.log(myArray[2].value); //outputs: -1
}
runWorker();
```

### 4. Custom Struct

Any class that extends SharedStruct can act as a shared struct.

#### `my-types.js`
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

#### `main.js`
```typescript
import { MainThread, SharedHeap } from "sharedthread";
import { MyStruct } from "./my-types.js";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);

  thread.waitFor("worker setup");

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a array of size 6 and type int32
  const myStruct = MyStruct.fromData(myHeap, {
    foo: 6, // set the initial value of foo to 6
  });
  // array is a reference type so it needs to be dereferenced when on another reference type
  myStruct.bar.deref[2].value = 5;

  // make the worker aware of the struct and wait for confirmation
  await thread.addVar(myStruct, "myStruct");

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from 'sharedthread';
//this import is required to load the custom type properly
import { MyStruct } from "./my-types.js";

async function runWorker(){
  // sync the heap
  const promisedHeap = WorkerThread.syncHeap("myHeap");

  // sync to the array
  const promisedStruct = WorkerThread.syncVar("myStruct");

  WorkerThread.signal("worker setup");

  await promisedHeap;

  const myStruct = await promisedStruct;

  //read data from array
  console.log(myStruct.foo.value); // outputs: 6
  console.log(myStruct.bar.deref[2].value); // outputs: 5
}
runWorker();
```
