var stream = require( "stream" );
var util = require( "util" );

module.exports = Stream;
module.exports.Stream = Stream;

util.inherits( Stream, stream.Duplex );

function Stream () {
    if ( !( this instanceof Stream ) ) {
        return new Stream()
    }

    var options = { objectMode: true, highWaterMark: 16 };
    stream.Duplex.call( this, options )

    this.w = new stream.PassThrough( options );
    this.r = new stream.PassThrough( options );
    this.last = this.w;

    this.r.on( "readable", maybeReadMore( this ) );
    this.r.on( "end", maybeReadMore( this ) );

    this.w.pipe( this.r );
}

// write into the writable substream
Stream.prototype._write = function ( chunk, encoding, callback ) {
    var ret = this.w.write.call( this.w, chunk, encoding, callback );

    // if the writable substream has ended, end this external stream as well
    maybeEndWriter( this );
    return ret;
}

// read from the readable substream
Stream.prototype._read = function () {
    var data = this.r.read();
    if ( data !== null ) {
        this.push( data );
    } else if ( this.r._readableState.ended ) {
        this.push( null );
    }
}

// end the underlying writer upon end
Stream.prototype.end = function () {
    var ret = stream.Duplex.prototype.end.apply( this, arguments );
    maybeEndWriter( this );
    return ret;
}

// resize the internal buffers
Stream.prototype.resize = function ( n ) {
    [ this, this.w, this.r ].forEach( function ( s ) {
        s._writableState.highWaterMark = 
        s._readableState.highWaterMark = n;
    })
    return this;
}

Stream.prototype.through = 
Stream.prototype.transform = 
Stream.prototype.substream = function ( substream, flush ) {
    // in-line function constructs transform substreams
    if ( typeof substream == "function" ) {
        var transform = substream;
        substream = new stream.Transform({ objectMode: true, highWaterMark: 16 });
        substream._transform = function ( data, encoding, done ) {
            return transform.call( this, data, done );
        }

        if ( typeof flush == "function" ) {
            substream._flush = flush;
        }
    }

    // is it a valid through stream, duck-typed instead of strong type
    if ( !substream.pipe || !substream.write || !substream.end ) {
        throw new Error( "not a Duplex substream" );
    }

    // re-pipe the substreams to plug this through at the end
    this.last
        .unpipe( this.r )
        .pipe( substream )
        .on( "error", this.emit.bind( this, "error" ) ) // propagate errors
        .pipe( this.r );

    this.emit( "through", substream );
    this.last = substream
    return this;
}

Stream.prototype.filter = function ( fn ) {
    return this.through( function ( data, done ) {
        return fn.call( this, data, function ( err, keep ) {
            return done( err, keep ? data : undefined );
        })
    });
}

Stream.prototype.map = function ( fn ) {
    return this.through( function ( data, done ) {
        return fn.call( this, data, function ( err, mapped ) {
            return done( err, mapped );
        })
    })
}

Stream.prototype.reduce = function ( fn, memo ) {
    return this.through( function ( data, done ) {
        return fn.call( this, memo, data, function ( err, _memo ) {
            memo = _memo;
            done( err );
        })
    }, function ( done ) {
        if ( memo !== null ) {
            this.push( memo );
        }
        done();
    })
}

Stream.prototype.every = function ( fn ) {
    var res = true;
    return this.through( function ( data, done ) {
        return fn.call( this, data, function ( err, _res ) {
            res = res && _res;
            done( err );
        })
    }, function ( done ) {
        this.push( res );
        done();
    })
}

Stream.prototype.some = function ( fn ) {
    var res = false;
    return this.through( function ( data, done ) {
        return fn.call( this, data, function ( err, _res ) {
            res = res || _res;
            done( err );
        })
    }, function ( done ) {
        this.push( res );
        done();
    })
}

Stream.prototype.each = function ( fn ) {
    return this.through( function ( data, done ) {
        return fn.call( this, data, function ( err ) {
            done( err, data );
        })
    })
}

Stream.prototype.slice = function ( begin, end ) {
    begin = begin || 0;
    end = end || Infinity;
    var i = 0;
    return this.filter( function ( data, done ) {
        done( null, i >= begin && i < end );
        i += 1;
    })
}




function maybeEndWriter ( stream ) {
    var state = stream._writableState
    if ( state.ended && state.length <= 1 ) {
        stream.w.end();
    }
}

function maybeReadMore ( stream ) {
    return function () {
        if ( stream._readableState.reading ) {
            stream._read();
        }
    }
}