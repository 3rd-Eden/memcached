exports.validate_arg = function validate_arg( args ){
	var toString = Object.prototype.toString,
		err, callback;
		
	args.validate.forEach(function( tokens ){
		switch( tokens[1] ){
			
			case Number:
				if( toString.call( args[ tokens[0] ] ) !== '[object Number]' )
					err = 'Argument "' + tokens[0] + '" is not a valid Number.';
				break;
			
			case Boolean:
				if( toString.call( args[ tokens[0] ] ) !== '[object Boolean]' )
					err = 'Argument "' + tokens[0] + '" is not a valid Boolean.';
				break;
			
			case Array:
				if( toString.call( args[ tokens[0] ] ) !== '[object Array]' )
					err = 'Argument "' + tokens[0] + '" is not a valid Array.';
				break;
			
			case Object:
				if( toString.call( args[ tokens[0] ] ) !== '[object Object]' )
					err = 'Argument "' + tokens[0] + '" is not a valid Object.';
				break;
			
			case Function:
				if( toString.call( args[ tokens[0] ] ) !== '[object Function]' )
					err = 'Argument "' + tokens[0] + '" is not a valid Object.';
				else 
					if( tokens[0] == "callback" )
						callback = args[ tokens[0] ];
				
				break;
			
			case String: 
				if( toString.call( args[ tokens[0] ] ) !== '[object String]' )
					err = 'Argument "' + tokens[0] + '" is not a valid String.';
				break;
			
			default:
				if( toString.call( args[ tokens[0] ] ) == '[object global]' && !tokens[2] )
					err = 'Argument "' + tokens[0] + '" is not defined.'
		}
	});
	
	if( err ){
		if( callback )
			callback( err, false );
		else
			throw new Error( err );
			
		return false;
	}
	
	return true;
};

exports.curry = function curry( obj, func ){
	var copy = Array.prototype.slice,
		args = copy.call( arguments, 2 );
		
	return function() {
		return func.apply(obj, args.concat( copy.call( arguments) ) );
	}
};

exports.fuse = function fuse( target, handlers ){
	for( var i in handlers )
		if( handlers.hasOwnProperty(i) )
			target.addListener( i, handlers[i] );
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