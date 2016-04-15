# overflow
Construct powerful data-intensive flows using Node.js streams composition

> Node Streams are awesome, but they're a difficult beast to tame. Streams are 
ideal for data-intensive processing due to their ability to regulate the stream of data flowing through them in order to avoid excessive resource
consumption. However, there are many caveats and best-practices to keep track of. This library is design to make it easy, fun and simple to construct powerful data-intensive flows using Node.js streams composition. 

### Usage

```javascript
var overflow = require( "overflow" );
fs.createFileStream( "data" ) // [{ sum: 1}, {sum: 2}, {sum: 3}]
    .pipe( overflow() )
    .substream( JSON.parse )
    .filter( function ( data ) {
        return data.sum > 1;
    })
    .reduce( function ( avg, data ) {
        return { count: avg.count + 1, sum: avg.sum + data.sum }
    }, { count: 0, sum: 0 } )
    .substream( function ( avg ) {
        return avg.sum / avg.count;
    })
    .on( "data", console.log ); // 2.5
```

### API

- [overflow()](#overflow-1) constructor
- [.substream()](#substream-stream-)
- [.unsubstream()](#unsubstream)
- [.filter()](#filter-filterfn-)
- [.skip()](#skip-predicatefn-)
- [.map()](#map-mapfn-)
- [.reduce()](#reduce-reducefn-initial-)
- [.every()](#every-predicatefn-)
- [.some()](#some-predicatefn-)
- [.each()](#each-fn-)
- [.slice()](#slice-begin--end--)
- [.concat()](#concat-readable-)
- [.chunk()](#chunk-size--delay--)
- [.size()](#size-n-)

Overflow streams are an encapsulated pipeline of substreams. They are useful for packaging data-intensive logic within a single stream that can then be piped together to construct even more complex stream flows. 

These streams also expose a bunch of convenient methods that makes it easy to construct these pipes out of simple functions. For example, the `.filter()` acts similar to Array.filter, except that it instead creates a new stream that does the filter as new data streams in. 

```javascript
overflow()
    .filter( function ( data, done ) {
        done( null, data.sum > 1 );
    })
```

All of these convenient methods support both the async and sync modes. So we can re-write the same code as follows:

```javascript
overflow()
    .filter( function ( data ) { // note: no callback arguments
        return data.sum > 1;
    })
```

> *How Overflow knows if it's sync or async*: it depends on the function definition. If it accepts a last argument for the callback, then it's async.

------
##### overflow()

Overflow stream constructor

> All overflow streams are in objectMode, with a default highWaterMark of 16.

Empty Overflow streams act as pass through: anything written to them is passed as-is to the read buffer. 

```javascript
var s = overflow();
s.write( "hello" );
s.read(); // "hello"
```

However, they represent an entire streams pipeline internally. So, we can start adding substreams to be piped together. Then, everything written to the Overflow stream will tickle down through all of the substreams:

```javascript
var s = overflow()
    .substream( doubleTransform )
    .substream( rejectNegativeTransform );

s.write( 2 );
s.read(); // 4

s.write( -2 );
s.read() // null
```

> Errors always propagate upwards. So a substream emitting error events will cause the wrapping Overflow stream to emit the same errors.

------
##### .substream( stream )

* **stream** a Duplex Stream object
* returns the external Overflow stream

Pipes a new Duplex substream at the end of the internal pipeline. 

```javascript
var s = overflow()
    .substream( createTransform() );

s.write( 3 );
s.read(); // 6

function createTransform() {
    var t = new stream.Transform();
    t._transform = function ( data, encoding, done ) {
        done( null, data * 2 ); // double the input data
    }
    return t;
}
```

##### .substream( transformFn [, flushFn ] )

Overloaded `.substream()` method for building Transform streams on the fly. 

Read about [Transform streams](https://nodejs.org/api/stream.html#stream_class_stream_transform_1) to learn more

* **transformFn** transformation function with the following signature:
    - **data** the input data object
    - [**done**]  callback function, accepts: an error and any output data that should be pushed
* **flushFn** method that runs after all of the data is transform
    - [**done**]  callback function, accepts: an error and any output data that should be pushed
* returns the external Overflow stream

```javascript
var s = overflow()
    .substream( function ( data ) {
        return data * 2;
    })

s.write( -15 );
s.read(); // 30
```

------
##### .unsubstream()

Removes the last substream from the pipeline

* returns the external Overflow stream

```javascript
var s = overflow()
    .substream( function ( data ) {
        return data * 2;
    })
    .unsubstream() // removes the last substream

s.write( -15 );
s.read(); // -15 
```

------
##### .filter( filterFn )

Similar to `Array.filter()`. Adds a new substream that filters the data as it streams in.

* **filterFn**
    - **data**
    - [**done**] callback function, accepts:
        + **error** 
        + **keep** boolean that indicates if the data should be kept in the pipe
* returns the external Overflow stream

```javascript
var s = overflow()
    .filter( function ( data ) {
        return data.sum > 100;
    });

s.write( 50 );
s.read() // null

s.write( 150 );
s.read(); // 150
```

------
##### .skip( predicateFn )

Adds a new substream that skips some of the data by not passing it through the following substreams, but pass it forward directly to the external Overflow stream. This is useful for creating conditional pipes.

* **predicateFn**
    - **data**
    - [**done**] callback function, accepts:
        + **error** 
        + **skip** boolean that indicates if the data should be pushed as-is to the end of the pipeline
* returns the external Overflow stream

```javascript
var s = overflow()
    .map( Math.abs ) // runs on all input
    .skip( function ( data ) {
        return data != 0
    })
    .map( function ( data ) {
        return 1 / data; // runs only on input != 0
    }); 

s.write( 2 );
s.read(); // 0.5

s.write( -2 );
s.read(); // 0.5

s.write( 0 );
s.read(); // 0
```

------
##### .map( mapFn )

Similar to `Array.map()`. Adds a new substream that maps the data as it streams in.

* **mapFn** the mapper function
    - **data** 
    - [**done**] callback function, accepts:
        + **error**
        + **mapped** the mapped output object
* returns the external Overflow stream

```javascript
var s = overflow()
    .map( function ( data ) {
        return Math.abs( data ) // sync mode
    });

s.write( -30 );
s.read(); // 30
```

------
##### .reduce( reduceFn, initial )

Similar to `Array.reduce()`. Adds a new substream that reduces the data as it streams in.

* **reduceFn** the reduction function
    - - **current** the recently updated value
    - **data**
    - [ **done** ] callback function, accepts:
        + **error**
        + **value** new value
* **initial** the initial value to start with
* returns the external Overflow stream

```javascript
var s = overflow()
    .reduce( function ( current, data ) {
        return current + data; // sync mode
    }, 0 )

s.write( 10 );
s.write( 20 );
s.write( 30 );
s.end();
s.read() // 50
```

------
##### .every( predicateFn )

Similar to `Array.every()`. Adds a new substream that checks if all of the data meet some predicate criteria, as it streams in.

* **predicateFn** the matching function
    - **data**
    - [ **done** ] callback function, accepts
        + **error**
        + **match** boolean to indicate if the data meets the criteria
* returns the external Overflow stream

```javascript
var s = overflow()
    .every( function ( data ) {
        return data > 10
    })

s.write( 20 );
s.end( 5 );
s.read(); // false
```

------
##### .some( predicateFn )

Similar to `Array.some()`. Adds a new substream that checks if any of the data meet some predicate criteria, as it streams in.

* **predicateFn** the matching function
    - **data**
    - [ **done** ] callback function, accepts
        + **error**
        + **match** boolean to indicate if the data meets the criteria
* returns the external Overflow stream

```javascript
var s = overflow()
    .some( function ( data ) {
        return data > 10
    })
s.write( 20 );
s.end( 5 );
s.read() // true
```

------
##### .each( fn )

Similar to `Array.forEach()`. Adds a new substream that passes all of the data through the provided function, without modifying it. The input data will pass through as is to the output data. This is mostly useful for side-effects.

* **fn**
    - **data**
    - [ **done** ] callback function, accepts
        + **error**
* returns the external Overflow stream

```javascript
var s = overflow()
    .each( console.log );

s.write( 10 ); // side effects: console.log( 10 )
s.read(); // 10
```

------
##### .slice( begin [, end ] )

Similar to `Array.slice()`. Adds a new substream that only outputs a slice of the input data.

* **begin** integer. the index of the lower bound of the slice
* **end** integer. the index of the upper bound of the slice. If omitted, end is Infinity. Negative values not supported.
* returns the external Overflow stream

```javascript
var s = overflow()
    .slice( 1, 2 );

s.write( 1 );
s.write( 2 );
s.write( 3 );

s.read(); // 2
s.read(); // null. stream ended
```

------
##### .concat( readable )

Similar to `Array.concat()`. Adds a new pass-through substream that also reads all of the data from the provided `readable` stream. It can also be used to conveniently create readable overflow streams.

* **readable** Readable stream, Array of data, or a function that generates data (acts like `Readable._read`)
* returns the external Overflow stream

```javascript
var s = overflow()
    .concat( [ 3, 4 ] )

s.write( 1 )
s.end();
s.read(); // 1
s.read(); // 3
s.read(); // 4
s.read(); // null, stream ended
```

------
##### .chunk( size [, delay ] )

Adds a new substream that chunks data together into lists. Mostly useful for batching data together.

* **size** integer. the maximum chunk size
* **delay** integer. number of milliseconds to wait before pushing incomplete chunks (smaller than `size`)
* returns the external Overflow stream

```javascript
var s = overflow()
    .chunk( 2 );

s.write( 1 );
s.write( 2 );
s.write( 3 );
s.read(); // [ 1, 2 ]
s.read(); // null, chunk is incomplete

s.end();
s.read(); // [ 3 ]
```

------
##### .size( n )

Set the internal buffer size (`highWaterMark`) of the stream.

* **size** integer. the new buffer size, both readable and writable.




