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

#### overflow()

Overflow stream constructor.

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

#### .substream( stream )

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

#### .substream( transformFn [, flushFn ] )

* **transformFn** transformation function with the following signature:
    * **data** the input data object
    * [**done**] a callback for ending the transform

A convenient method for building Transform streams on the fly. 

```javascript
overflow()
    .substream( function ( data ) {
        return data * 2; // sync mode
    })

overflow()
    .substream( function ( data, done ) {
        done( null, data * 2 ); // async mode
    })
```