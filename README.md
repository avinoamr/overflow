# overflow
Construct complex data-intensive flows by Node.js stream composition

### Introduction

Node Streams are awesome, but they're a difficult beast to tame. Streams are 
ideal for data-intensive processing due to their ability to regulate the stream of data flowing through them in order to avoid excessive  

### Usage

```javascript
overflow( fs.createFileStream( "data" ) )
    .map( JSON.parse )
    .filter( function ( d ) {
        return d.sum > 10;
    })
    .on( "data", console.log );
```

A key feature of overflow is the ability to encapsulate complex flows within
simple streams by composing them together:

```javascript

// stream that computes the average sum of all input data
var avgsum = overflow()
    .reduce( function ( avg, d ) {
        return { count: avg.count + 1, sum: avg.sum + d.sum };
    }, { count: 0, sum: 0 } )
    .transform( function ( d ) {
        return d.sum / d.count;
    })

// stream that parses json strings and filters their results
var parse = overflow()
    .map( JSON.parse )
    .filter( function ( d ) {
        return d.sum > 10;
    });

// use the overflow streams within another stream
fs.createFileStream( "data" )
    .pipe( parse )
    .pipe( avgsum )
    .on( "data", console.log ); // spits out the average
```

### Substreams

An empty overflow stream acts as a pass through:

```javascript
var s = overflow();
s.write( "hello" );
s.read(); // hello
```

But the core functionality allows us to add substreams to the overflow, which acts as an internal data pipeline.

```javascript
s.add( transform );
s.write( "hello" );
s.read(); // "hello2"
```

The substreams are piped together, but are kept encapsulated within the external substream. Everything that is written to the overflow is then passed to the first substream, runs through the entire pipeline - including any nested overflow streams - and the output is read back from the overflow stream. Thus the entire process is encapsulated within the external overflow
stream.

```javascript
s.add( )
```

A key capability that can be used here is to dynamically mutate the substreams while data is flowing in. For example:

```javascript
// .add can accept a function as well 
s.add( function ( d ) { 
    
})
```

### API

##### overflow( [ input ] )

Creates a new overflow stream which acts as a pass-through by default. This stream can be used to construct complex flows by adding substreams to it:

```javascript

```

##### .add( stream )




##### .transform( fn [, flush ] )

Similar to Node's transform streams, 

```javascript
overflow( [ 1, 2, 3, 4 ] )
    .transform( function ( d, done ) {
        // can also call this.push( d )
        done( null, d, d );
    })
    .on( "data", console.log ) // 1, 1, 2, 2, 3, 3, 4, 4, 5, 5
```




