var stream = require( "stream" );
var assert = require( "assert" );
var overflow = require( "./overflow" );

describe( "Overflow", function () {

    it( "passes through data by default", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 1, 2, 3, 4, 5 ] );
                done();
            });
    })

    it( "adds substreams", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var double_ = new stream.Transform({ objectMode: true });
        double_._transform = function ( chunk, encoding, cb ) {
            cb( null, chunk * 2 );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .substream( double_ )
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 2, 4, 6, 8, 10 ] );
                done();
            });
    });

    it( "pops substreams", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var double_ = new stream.Transform({ objectMode: true });
        double_._transform = function ( chunk, encoding, cb ) {
            cb( null, chunk * 2 );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .substream( double_ )
            .unsubstream()
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 1, 2, 3, 4, 5 ] );
                done();
            });
    });



    it( "finish the underlying stream after .end()", function ( done ) {
        function _done () {
            if ( doubleFinished && currentFinished ) done();
        }

        var doubleFinished = currentFinished = false;
        var written = [];
        var double_ = new stream.Transform({ objectMode: true });
        double_._transform = function ( chunk, encoding, cb ) {
            process.nextTick( function () {
                written.push( chunk )
                cb( null, chunk * 2 );
            })
        }

        var s = overflow().substream( double_ );

        double_.on( "finish", function () {
            assert.deepEqual( written, [ 1, 2, 3, 4, 5 ] );
            doubleFinished = true;
            _done()
        })

        s.on( "finish", function () {
            currentFinished = true;
            _done();
        })


        s.write( 1 );
        s.write( 2 );
        s.write( 3 );
        s.write( 4 );
        s.end( 5 );

    });

    it( "prevents substream overflow", function ( done ) {

        // reader generates data endlessly, as long as someone is consuming
        var i = 0;
        var reader = new stream.Readable({ objectMode: true });
        reader._read = function () {
            // 10 is a rough limit instead of an exact match
            // of the highWaterMark, due to internal substreams maintaining
            // their own highWaterMark. This is not ideal but fixing it will
            // require a huge increase in code complexity which is not
            // a tradeoff i'm willing to make at this point.
            assertLessThen( i, 100 );
            this.push( i++ )
        }

        reader.pipe( overflow() ).resize( 1 ); 
        // does not consume by current.read() or current.on( "data" )
        // in an attempt to overflow the internal buffers.

        setTimeout( done, 10 ); // 10ms went by without an assertion error
    })

    it( "propagates errors", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        reader
            .pipe( overflow() )
            .on( "error", function ( err ) {
                assert.equal( err.message, "test" );
                done();
            })
            .substream( function ( d, done ) {
                done( new Error( "test" ) )
            })
            .read();
    });

    it( "accepts predefine sync functions", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ '{"n":1}', '{"n":2}', '{"n":3}' ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .map( JSON.parse )
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ { n: 1 }, { n: 2 }, { n: 3 } ] )
                done();
            })
    })

    it( ".filter()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .filter( function ( d, done ) {
                done( null, d % 2 == 1 )
            })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 1, 3, 5 ] )
                done();
            })
    })

    it( ".map()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .map( function ( d, done ) {
                done( null, d * 2 );
            })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 2, 4, 6, 8, 10 ] );
                done();
            })
    })

    it( ".reduce()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .reduce( function ( memo, d, done ) {
                done( null, { 
                    count: memo.count + 1, 
                    sum: memo.sum + d
                });
            }, { count: 0, sum: 0 })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [{ count: 5, sum: 15 }] )
                done();
            })
    })

    it( ".every()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .every( function ( d, done ) {
                done( null, d > 2 );
            })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ false ] )
                done();
            })
    })

    it( ".some()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .some( function ( d, done ) {
                done( null, d > 2 );
            })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ true ] )
                done();
            })
    })

    it( ".each()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var received = [];
        var results = [];
        reader
            .pipe( overflow() )
            .each( function ( d, done ) {
                received.push( d );
                done();
            })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 1, 2, 3, 4, 5 ] )
                assert.deepEqual( received, [ 1, 2, 3, 4, 5 ] )
                done();
            })
    })

    it( ".slice()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .slice( 2, 4 )
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 3, 4 ] )
                done();
            })
    })

    it( ".concat()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .concat( [ 6, 7, 8 ])
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 1, 2, 3, 4, 5, 6, 7, 8 ] )
                done();
            })
    })

    it( ".skip()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .skip( function ( data ) {
                return data < 4;
            })
            .map( function ( data ) {
                return data * 2
            })
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ 1, 2, 3, 8, 10 ] );
                done();
            })
    })

    it( ".skip() doesn't overflow the pipe", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [];
        for ( var i = 1 ; i < 99 ; i += 1 ) {
            data.push( i );
        }
        var i = 0;
        reader._read = function () {
            process.nextTick( function () {
                this.push( data[ i++ ] || null );
            }.bind( this ));
        }

        var results = [];
        var writer = new stream.Writable({ objectMode: true, highWaterMark: 1 });
        writer._write = function ( data, encoding, cb ) {
            // if ( results.length > 5 ) return; // consume the first 5 items
            results.push( data );
            setTimeout( cb, 10 );
        }

        var s;
        reader
            .pipe( s = overflow() )
            .skip( function ( data ) {
                return true; // skip everything
            })
            .pipe( writer )
            .on( "finish", function () {
                assert.deepEqual( data, results );
                done();
            });

        var write = s.r.write;
        s.r.write = function ( d ) {
            var ws = this._writableState;
            if ( ws.length > ws.highWaterMark ) {
                done( "Readable end overflow" );
                done = function () {};
            }
            return write.apply( this, arguments );
        }

    })

    it( ".chunk()", function ( done ) {
        var reader = new stream.Readable({ objectMode: true });
        var data = [ 1, 2, 3, 4, 5 ];
        reader._read = function () {
            this.push( data.shift() || null );
        }

        var results = [];
        reader
            .pipe( overflow() )
            .chunk( 2 )
            .on( "data", results.push.bind( results ) )
            .on( "end", function () {
                assert.deepEqual( results, [ [ 1, 2 ], [ 3, 4 ], [ 5 ] ] )
                done();
            })
    })

});

function assertLessThen( small, big ) {
    assert( small < big, small + " < " + big );
}





