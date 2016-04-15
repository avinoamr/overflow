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
    this.r.on( "finish", this.emit.bind( this, "complete" ) );

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

Stream.prototype.substream = function ( substream, flush ) {
    // in-line function constructs transform substreams
    if ( typeof substream == "function" ) {
        var transform = toAsync( substream, 2 );
        var size = this._readableState.highWaterMark;
        substream = new stream.Transform({ objectMode: true, highWaterMark: size });
        substream._transform = function ( data, encoding, done ) {
            return transform.call( this, data, done );
        }

        if ( typeof flush == "function" ) {
            flush = toAsync( flush, 1 );
            substream._flush = function ( done ) {
                return flush.call( this, function ( err ) {
                    if ( err ) return done( err );
                    var data = [].slice.call( arguments, 1 );
                    for ( var i = 0 ; i < data.length ; i += 1 ) {
                        this.push( data[ i ] )
                        if ( data[ i ] == null ) {
                            break;
                        }
                    }
                    done();
                }.bind( this ))
            }
        }
    }

    // is it a valid through stream, duck-typed instead of strong type
    if ( !substream.pipe || !substream.write || !substream.end ) {
        throw new Error( "not a Duplex substream" );
    }

    // re-pipe the substreams to plug this through at the end
    substream.parent = this;
    substream.prev = this.last;
    this.last
        .unpipe( this.r )
        .pipe( substream )
        .on( "error", this.emit.bind( this, "error" ) ) // propagate errors
        .pipe( this.r );

    substream.emit( "substream", this );
    this.last = substream
    return this;
}

Stream.prototype.unsubstream = function () {
    // pops the last substream from the pipeline
    var last = this.last;
    var prev = last.prev;
    if ( !prev ) {
        return this;
    }

    prev.unpipe( last )
        .pipe( this.r );
    this.last = prev;
    return this;
}

Stream.prototype.skip = function ( fn ) {
    fn = toAsync( fn, 2 )
    return this.substream( function ( data, done ) {
        return fn.call( this, data, function ( err, skip ) {
            if ( err ) return done( err );
            if ( skip ) {
                var ret = this.parent.r.write( data );
                if ( ret === false ) {
                    this.cork();
                    this.parent.r.once( "drain", this.uncork.bind( this ) );
                }
                done();
            } else {
                done( null, data )
            }
        }.bind( this ) )
    });
}

Stream.prototype.chunk = function ( size, delay ) {
    var buffer = [], timeout;
    return this.substream( function ( data ) {
        // console.log( "ONE?", this.push );
        clearTimeout( timeout );
        buffer.push( data );
        var flush = this._flush.bind( this, function () {} );
        if ( buffer.length >= size ) {
            return flush()
        } else if ( delay ) {
            timeout = setTimeout( flush, delay );
        }
    }, function () {
        clearTimeout( timeout );
        var data = buffer.length ? buffer : undefined;
        buffer = [];
        if ( data ) {
            this.push( data );
        }
    })
}

Stream.prototype.filter = function ( fn ) {
    fn = toAsync( fn, 2 )
    return this.substream( function ( data, done ) {
        return fn.call( this, data, function ( err, keep ) {
            return done( err, keep ? data : undefined );
        })
    });
}

Stream.prototype.map = function ( fn ) {
    fn = toAsync( fn, 2 )
    return this.substream( function ( data, done ) {
        return fn.call( this, data, function ( err, mapped ) {
            return done( err, mapped );
        })
    })
}

Stream.prototype.reduce = function ( fn, memo ) {
    fn = toAsync( fn, 3 )
    return this.substream( function ( data, done ) {
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
    fn = toAsync( fn, 2 )
    var res = true;
    return this.substream( function ( data, done ) {
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
    fn = toAsync( fn, 2 )
    var res = false;
    return this.substream( function ( data, done ) {
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
    fn = toAsync( fn, 2 )
    return this.substream( function ( data, done ) {
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

Stream.prototype.concat = function ( readable ) {
    if ( Array.isArray( readable ) ) {
        var data = [].concat( readable ).concat([ null ])
        readable = function () {
            this.push( data.shift() );
        }
    }

    var size = this._readableState.highWaterMark;
    var options = { objectMode: true, highWaterMark: size };
    if ( typeof readable == "function" ) {
        var fn = readable;
        readable = new stream.Readable( options );
        readable._read = fn;
    }

    var substream = new stream.PassThrough({ objectMode: true, highWaterMark: size });
    var piped = false;
    substream.end = function () {
        delete this.end;
        readable.pipe( this );
    }

    return this.substream( substream );
}



var syncfns = [ 
    JSON.parse, JSON.stringify, 
    console.log, console.error, console.warn, console.info, 
    Math.abs, Math.floor, Math.ceil, Math.round, Math.sqrt
];
function toAsync ( fn, expecting, context ) {
    if ( syncfns.indexOf( fn ) != -1 ) {
        expecting = Infinity; // force turning it to async
    }

    if ( context ) {
        fn = fn.bind( context )
    }

    var newfn = fn;
    if ( fn.length < expecting ) {
        newfn = function () {
            var done = [].slice.call( arguments, -1 ).pop();
            var args = [].slice.call( arguments, 0, -1 );
            var err;
            try {
                var ret = fn.apply( context || this, args )
            } catch ( _err ) {
                err = _err;
            }

            if ( typeof ret === "undefined" ) {
                done( err );
            } else {
                done( err, ret );
            }
        }
    }

    return newfn;
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