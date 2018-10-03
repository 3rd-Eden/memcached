var	nMemcached = require( '../../lib/memcached' ),
	count = 0,
	originalString = 'abcdefghijklmnopqrstuvwxyz0123456789',
	memcached;

memcached = new nMemcached();

function nowInSeconds() {
	return Math.floor(Date.now() / 1000);
}

memcached.set('xxx', 'yyy', nowInSeconds() + 1, err => {
	setTimeout(() => {
		memcached.get('xxx', (err, value) => {
			if (value == 'yyy') {
				console.log('ERROR, GOT VALUE')
			}
			else {
				console.log('OK, NO VALUE')
			}
		})
	}, 3000)
})