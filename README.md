# overflow
Construct powerful data-intensive flows using Node.js streams composition

### Introduction

> Node Streams are awesome, but they're a difficult beast to tame. Streams are 
ideal for data-intensive processing due to their ability to regulate the stream of data flowing through them in order to avoid excessive resource
consumption. However, there are many caveats and best-practices to keep track of. This library is design to make it easy, fun and simple to construct powerful data-intensive flows using Node.js streams composition. 

### Usage

```javascript
fs.createFileStream( "data" ) // [{ sum: 1}, {sum: 2}, {sum: 3}]
    .pipe( overflow() )
    .through( JSON.parse )
    .filter( function ( data ) {
        return data.sum > 1;
    })
    .reduce( function ( avg, data ) {
        return { count: avg.count + 1, sum: avg.sum + data.sum }
    }, { count: 0, sum: 0 } )
    .through( function ( avg ) {
        return avg.sum / avg.count;
    })
    .on( "data", console.log ); // => 2.5
```
