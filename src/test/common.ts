/**
 * Server ip addresses that get used during the tests
 * NOTE! Make sure you configure empty servers as they
 * will get flushed!.
 *
 * If your memcache hosts is not the default one
 * (localhost), you can pass another one using the
 * environment variable MEMCACHED__HOST. E.g.:
 *
 * MEMCACHED__HOST=localhost npm test
 *
 * @type {Object}
 * @api public
 */
const testMemcachedHost = process.env.MEMCACHED__HOST || 'localhost'

export const servers = {
    single: testMemcachedHost + ':11211',
    multi: [
      testMemcachedHost + ':11211',
      testMemcachedHost + ':11212',
      testMemcachedHost + ':11213',
  ],
}

/**
 * Generate a random alphabetical string.
 *
 * @param {Number} n The length of the generated string
 * @returns {String} a random generated string
 * @api public
 */
export function alphabet(n: number) {
    let result: string = ''
    for (let i = 0; i < n; i++) {
        result += String.fromCharCode(97 + Math.floor(Math.random() * 26))
    }

    return result
}

/**
 * Generate a bunch of random numbers
 *
 * @param {Number} n the amount of numbers
 * @returns {Number}
 * @api public
 */
export function numbers(n: number) {
    let result: number = 0
    for (let i = 0; i < n; i++) {
        result += Math.floor(Math.random() * 26)
    }

    return result
}

export function wait(delay: number): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(() => { resolve() }, delay)
    })
}
