# SharedThread

[![v1.1.2](https://img.shields.io/npm/v/sharedthread)](https://www.npmjs.com/package/sharedthread)


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


### External Worker File (Recommended)

Create a new instance using `new MainThread(filepath)`.

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
### Same File Worker

In CommonJS(require syntax), `__filename` is the current file.
In ES Modules(import syntax), `import.meta.filename` is is the current file;

#### `main.js`
```typescript
import { MainThread, WorkerThread, isMainThread } from 'sharedthread';

if(isMainThread){
  startWorker().catch(console.error);
}else{
  workerFunction().catch(console.error);
}

async function startWorker() {
  const thread = new MainThread(import.meta.filename);

  //do stuff for main thread
  console.log("main code");
}

async function workerFunction(){
  //do stuff in worker
  console.log("worker code")
}
```

### Variable Sharing

A `SharedHeap` instance acts as a memory manager allowing for shared variables across threads. Shared variables are defined on the `SharedHeap` instance using `.fromData` on the specified data type. `MainThread.declareHeap` and `MainThread.declareVar` are used to predefine a variable to all future worker threads. `.addHeap`, `.addVar`, `.syncHeap`, and `.syncVar` on the thread instance are used if new variables need to be defined and refernced after thread creation.

**directly calling the constructor of a type is not recomended as it constructs from a memory address directly instead of using the build in memory manager*

**variables don't need to declared/synced if it is only indirectly referenced(such as through a pointer)*

#### `main.js`
```typescript
import { MainThread, SharedFloat64, SharedHeap, SharedInt32, SharedUint32 } from "sharedthread";

// create a heap with 1000 bytes
let myHeap = new SharedHeap(1000);

// create a int32 on the heap with starting value of 10
let myInt32 = SharedInt32.fromData(myHeap, 10);

// declare the heap and variable(only use before worker creation)
MainThread.declareHeap(myHeap, "myHeap");
MainThread.declareVar(myInt32, "myInt32");

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);
  await thread.ready();

  // create a new heap
  let myHeap2 = new SharedHeap(1000);

  // create a int32 on the old heap
  let myUint32 = SharedUint32.fromData(myHeap, 83);

  // create a float64(can hold same values as js number type) on the new heap
  let myFloat64 = SharedFloat64.fromData(myHeap2, 3.14);

  // add the new heap and variables(only use after thread creation)
  thread.addHeap(myHeap2, "myHeap2");
  thread.addVar(myUint32, "myUint32");
  thread.addVar(myFloat64, "myFloat64");

  // wait for the worker thread to modify the values
  await thread.waitFor("modify values");

  // check values after modification
  console.log("on main");

  console.log(myInt32.value); // outputs: 30
  console.log(myUint32.value); // outputs: 59
  console.log(myFloat64.value); // outputs: 2.71

  //terminate the thread now that tasks are finished
  thread.terminate();
}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from "sharedthread";

// get predeclared heap and variables
let myHeap = WorkerThread.getHeap("myHeap");
let myInt32 = WorkerThread.getVar("myInt32");

async function runWorker() {
  // sync to heap and variables declared after thread creation
  // note that syncHeap is a required function(for any variables declared on this heap) even if the heap variable isn't used
  let myHeap2 = await WorkerThread.syncHeap("myHeap2");
  let myUint32 = await WorkerThread.syncVar("myUint32");
  let myFloat64 = await WorkerThread.syncVar("myFloat64");

  //check values
  console.log("on worker");

  console.log(myInt32.value); // outputs: 10
  console.log(myUint32.value); // outputs: 83
  console.log(myFloat64.value); // outputs: 3.14

  //modify values
  myInt32.value *= 3;
  myUint32.value -= 24;
  myFloat64.value = 2.71;

  //tell the main thread that the value was modified
  //note that for frequent read/write, a mutex should be used instead
  WorkerThread.signal("modify values");
}
runWorker();
```

### Shared Array

A `SharedArray` is a array of a fixed size and fixed type that can be accessed across workers.
For a resizable array use `SharedArrayList` instead.

**length is an optional paramater for `SharedArrayList` but not for `SharedArray`*

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedArray, SharedInt32 } from "sharedthread";

const myHeap = new SharedHeap(1000);
const myArray = SharedArray.fromData(myHeap, {
type: SharedInt32,
  length: 3,
  // the array property can be used to set an initial value(optional)
  array: [3, 8, 4],
});

MainThread.declareHeap(myHeap, "myHeap");
MainThread.declareVar(myArray, "myArray");

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);
  await thread.ready();

  //wait for thread to finish reading values
  await thread.waitFor("finished reading");

  //subtract 5 from every value
  for(let i = 0; i < myArray.length; i++){
    myArray[i].value -= 5;
  }

  //tell thread that the values were modified
  thread.signal("modify value");

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from "sharedthread";

let myArray = WorkerThread.getVar("myArray");

async function runWorker(){
  //read value before modification
  console.log("before");
  for(let int32 of myArray){
    console.log(int32.value);// outputs 3, 8, 4
  }

  WorkerThread.signal("finished reading");
  await WorkerThread.waitFor("modify value");

  //read data from array after modification
  console.log("after")
  for(let int32 of myArray){
    console.log(int32.value);// outputs -2, 3, -1
  }
}
runWorker();
```

### Custom Struct

Any class that extends SharedStruct can act as a shared struct. Structs automatically convert reference types to pointers to that reference type.
**.deref and .value calls on SharedStruct, SharedArray, SharedArrayList may be bypassed using a public property on SharedStruct(.autoDeref and .autoValue), this does NOT work on isolated primitives and pointers*
**if the property is set set it on both the worker and main thread(it is advised to put it in the types file)*

#### `my-types.js`
```typescript
import { TypeRegistry, SharedStruct, SharedArray, SharedInt32 } from "sharedthread";

SharedStruct.autoDeref = false;//set to true to skip .deref calls on structs
SharedStruct.autoValue = false//set to true to skip .value calls on structs

//it is reccomended to have the type declaration in a different file
//this allows both the main thead and the worker to access the type
export class CustomStruct extends SharedStruct{
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
TypeRegistry.registerType(CustomStruct);
```

#### `main.js`
```typescript
import { MainThread, SharedHeap } from "sharedthread";
import { CustomStruct } from "./my-types.js";


let myHeap = new SharedHeap(1000);
// create a custom strut
let myStruct = CustomStruct.fromData(myHeap, {
    foo: 6,// set initial value of foo to 6
    // note that since bar is a reference type it is translated to a pointer to a SharedArray
    // this means it cannot have a value set in .fromData
});

MainThread.declareHeap(myHeap, "myHeap");
MainThread.declareVar(myStruct, "myStruct");

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);

  // array is a reference type so it needs to be dereferenced when on another reference type
  myStruct.bar.deref[2].value = 5;
}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from 'sharedthread';
//this import is required to load the custom type properly
import "./my-types.js";

//verify that the types are loaded properly(declared variables wont be available if not run)
WorkerThread.verifyTypes();

let myStruct = WorkerThread.getVar("myStruct");

async function runWorker(){
  //read data from array
  console.log(myStruct.foo.value); // outputs: 6
  // array is a reference type so it needs to be dereferenced when on another reference type
  console.log(myStruct.bar.deref[2].value); // outputs: 5
}
runWorker();
```

### Pointers

Pointers can point to any shared primitive or reference variable in the **same** heap. 

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedFloat64, SharedPointer } from "sharedthread";

let myHeap = new SharedHeap(1000);
let myFloat64 = SharedFloat64.fromData(myHeap, Math.PI);
let myPointer = SharedPointer.fromData(myHeap, {
    type: SharedFloat64,
    addr: myFloat64.addr,
})

// notice how we only declare the heap and the pointer
// this is because the float64 is indirectly referenced
MainThread.declareHeap(myHeap, "myHeap");
MainThread.declareVar(myPointer, "myPointer");

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);

  //wait for the worker thread
  await thread.waitFor("pointer modified");

  //read the new number
  console.log(myPointer.deref.value);//outputs: 2.718281828459045(Math.E)

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { SharedFloat64, WorkerThread } from 'sharedthread';


let myHeap = WorkerThread.getHeap("myHeap");
let myPointer = WorkerThread.getVar("myPointer");

async function runWorker(){
  console.log(myPointer.heldType);// outputs: Class SharedFloat64{...}
  console.log(myPointer.deref.value);// outputs: 3.141592653589793(Math.PI)

  //add a different float32 to the pointer(has to be the same type as before and same heap as pointer)
  let myNewFloat64 = SharedFloat64.fromData(myHeap, Math.E);
  myPointer.deref = myNewFloat64;

  //tell the main thread the pointer has been modified
  WorkerThread.signal("pointer modified");
}
runWorker();
```

### Mutex

A mutex can restrict access to a variable so only one thread has access at a time, preventing data corruption.

#### `main.js`
```typescript
import { MainThread, Mutex, SharedHeap, SharedInt32 } from "sharedthread";

let myHeap = new SharedHeap(1000);
let myMutex = Mutex.fromData(myHeap);
let myInt32 = SharedInt32.fromData(myHeap, 0);

MainThread.declareHeap(myHeap, "myHeap");
MainThread.declareVar(myMutex, "myMutex");
MainThread.declareVar(myInt32, "myInt32");

async function startWorker(){
  // create 4 workers
  const threads = [];
  for(let i = 0; i < 4; i++){
    let thread = new MainThread("./my-worker.js");
    thread.on("error", console.error);

    threads.push(thread);
  }

  //wait for all threads to finish adding
  await Promise.all(threads.map(t => t.waitFor("done")));

  console.log(myInt32.value);//outputs: 400

  //terminate all threads
  threads.forEach(t => t.terminate());
}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from 'sharedthread';

let myMutex = WorkerThread.getVar("myMutex");
let myInt32 = WorkerThread.getVar("myInt32");

async function runWorker(){
  for(let i = 0; i < 100; i++){
    //enter critical section using mutex
    await myMutex.use(() => {
        myInt32.value += 1;
    });
    //alternative syntax
    /*
    await myMutex.lock();
    myInt32.value += 1;
    myMutex.unlock();
    */
  }

  WorkerThread.signal("done");
}
runWorker();
```