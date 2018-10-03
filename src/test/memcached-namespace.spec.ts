import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || +(Math.random() * 1000000).toFixed()

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */
describe('Memcached tests with Namespaces', () => {
    /**
     * Make sure that the string that we send to the server is correctly
     * stored and retrieved. We will be storing random strings to ensure
     * that we are not retrieving old data.
     */
    it("set with one namespace and verify it can't be read in another", async () => {
        const memcached = new Memcached(common.servers.single)
        const message = common.alphabet(256)
        const testnr = ++(global as any).testnumbers

        // Load an non-namespaced entry to memcached
        return memcached.set(`test:${testnr}`, message, 1000).then((ok1) => {
            assert.equal(ok1, true)

            const memcachedOther = new Memcached(common.servers.single, {
                namespace: 'mySegmentedMemcached:',
            })

            // Try to load that memcache key with the namespace prepended - this should fail
            return memcachedOther.get(`test:${testnr}`).then((answer1) => {
                assert.ok(answer1 === undefined)

                // OK, now let's put it in with the namespace prepended
                return memcachedOther.set(`test:${testnr}`, message, 1000).then((ok2) => {
                    assert.equal(ok2, true)

                    // Now when we request it back, it should be there
                    return memcachedOther.get(`test:${testnr}`).then((answer2) => {
                        assert.ok(typeof answer2 === 'string')
                        assert.equal(answer2, message)
                        memcachedOther.end() // close connections
                    })
                })
            })
        })
    })

    it('set, set, and multiget with custom namespace', async () => {
        const memcached = new Memcached(common.servers.single, {
            namespace: 'mySegmentedMemcached:',
        })

        // Load two namespaced variables into memcached
        return memcached.set('test1', 'test1answer', 1000).then((ok1) => {
            assert.equal(ok1, true)

            return memcached.set('test2', 'test2answer', 1000).then((ok2) => {
                assert.equal(ok2, true)

                return memcached.get(['test1', 'test2']).then((answer) => {
                    assert.ok(typeof answer === 'object')
                    assert.equal(answer.test1, 'test1answer')
                    assert.equal(answer.test2, 'test2answer')
                    memcached.end() // close connections
                })
            })
        })
    })

    /**
     * In this case, these keys will be allocated to servers like below.
     * test1,3,4 => :11211
     * test5     => :11212
     * test2     => :11213
     */
    it('multi get from multi server with custom namespace (inc. cache miss)', async () => {
        const memcached = new Memcached(common.servers.multi, {
            namespace: 'mySegmentedMemcached:',
        })

        // Load two namespaced variables into memcached
        return memcached.set('test1', 'test1answer', 1000).then((ok1) => {
            assert.equal(ok1, true)

            return memcached.set('test2', 'test2answer', 1000).then((ok2) => {
                assert.equal(ok2, true)

                return memcached.get(['test1', 'test2', 'test3', 'test4', 'test5']).then((answer) => {
                    assert.ok(typeof answer === 'object')
                    assert.equal(answer.test1, 'test1answer')
                    assert.equal(answer.test2, 'test2answer')
                    assert.ok(answer.test3 === undefined)
                    assert.ok(answer.test4 === undefined)
                    assert.ok(answer.test5 === undefined)

                    memcached.end() // close connections
                })
            })
        })
    })

    it('should allow namespacing on delete', async () => {
        const memcached = new Memcached(common.servers.single, {
            namespace: 'someNamespace:',
        })

        // put a value
        return memcached.set('test1', 'test1answer', 1000).then((ok) => {
            assert.equal(ok, true)
            // get it back
            return memcached.get('test1').then((answer1) => {
                assert.ok(typeof answer1 === 'string')
                assert.equal(answer1, 'test1answer')
                // delete it
                return memcached.del('test1').then(() => {
                    // no longer there
                    return memcached.get('test1').then((answer2) => {
                        assert.ok(!answer2)
                        memcached.end()
                    })
                })
            })
        })
    })

    it('should allow increment and decrement on namespaced values', async () => {
        const memcached = new Memcached(common.servers.single, {
            namespace: 'someNamespace:',
        })
        const callbacks = 0

        // put a value
        return memcached.set('test1', 1, 1000).then((ok) => {
            assert.equal(ok, true)
            // increment it
            return memcached.incr('test1', 1).then(() => {
                // get it back
                memcached.get('test1').then((answer1) => {
                    assert.ok(typeof answer1 === 'number')
                    assert.equal(answer1, 2)
                    // decrement it
                    return memcached.decr('test1', 1).then(() => {
                        // get it again
                        return memcached.get('test1').then((answer2) => {
                            assert.ok(typeof answer2 === 'number')
                            assert.equal(answer2, 1)
                            // get rid of it
                            return memcached.del('test1').then(() => {
                                memcached.end()
                            })
                        })
                    })
                })
            })
        })
    })
})
