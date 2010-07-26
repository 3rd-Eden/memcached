var CreateHash = require('crypto').createHash;

exports.validateArg = function validateArg( args, config ){
	var toString = Object.prototype.toString,
		err, callback;
	
	args.validate.forEach(function( tokens ){
		var key = tokens[0], value = args[ key ];
		
		switch( tokens[1] ){
			
			case Number:
				if( toString.call( value ) !== '[object Number]' )
					err = 'Argument "' + key + '" is not a valid Number.';
				break;
			
			case Boolean:
				if( toString.call( value ) !== '[object Boolean]' )
					err = 'Argument "' + key + '" is not a valid Boolean.';
				break;
			
			case Array:
				if( toString.call( value ) !== '[object Array]' )
					err = 'Argument "' + key + '" is not a valid Array.';
				break;
			
			case Object:
				if( toString.call( value ) !== '[object Object]' )
					err = 'Argument "' + key + '" is not a valid Object.';
				break;
			
			case Function:
				if( toString.call( value ) !== '[object Function]' )
					err = 'Argument "' + key + '" is not a valid Function.';
				break;
			
			case String: 
				if( toString.call( value ) !== '[object String]' )
					err = 'Argument "' + key + '" is not a valid String.';
				
				if( !err && key == 'key' && value.length > config.maxKeySize ){
					if( config.keyCompression ){
						args[ key ] = CreateHash( 'md5' ).update( value ).digest( 'hex' );
						
						// also make sure you update the command
						config.command.replace( new RegExp('^(' + value + ')' ), args[ key ] ); 
					}else{
						err = 'Argument "' + key + '" is longer than the maximum allowed length of ' + config.maxKeySize;
					}
				}
				
				break;
			
			default:
				if( toString.call( value ) == '[object global]' && !tokens[2] )
					err = 'Argument "' + key + '" is not defined.';
					
		}
	});
		
	if( err ){
		if( callback )
			callback( err, false );
			
		return false;
	}
	
	return true;
};

exports.curry = function curry( context, func ){
	var copy = Array.prototype.slice,
		args = copy.call( arguments, 2 );
	
	return function() {
		return func.apply( context || this, args.concat( copy.call( arguments) ) );
	}
};

exports.fuse = function fuse( target, handlers ){
	for( var i in handlers )
		if( handlers.hasOwnProperty(i) )
			target.on( i, handlers[i] );
};

exports.merge = function merge( target, obj ){
	for( var i in obj )
		target[i] = obj[i];
	
	return target;
};

exports.Bisection = function( array, x, low, high ){
	// The low and high bounds the inital slice of the array that needs to be searched
	// this is optional
	low = low || 0;
	high = high || array.length;
	
	var mid;
	
	if( low < 0 )
		throw new Error( 'Low must be a non-negative integer' );
	
	while( low < high ){
		mid = Math.floor( ( low + high ) / 2 );
		
		if( x < array[ mid ] )
			high = mid;
		else 
			low = mid + 1;
	}
	
	return low;
};