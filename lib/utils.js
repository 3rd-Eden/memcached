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
		throw new Error( "Low must be a non-negative integer" );
	
	while( low < high ){
		mid = Math.floor( ( low + high ) / 2 );
		
		if( x < array[ mid ] )
			high = mid;
		else 
			low = mid + 1;
	}
	
	return low;
};