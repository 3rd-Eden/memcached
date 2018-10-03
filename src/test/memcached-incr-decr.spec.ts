import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || +(Math.random() * 1000000).toFixed()

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */
describe('Memcached INCR DECR', () => {
    /**
     * Simple increments.. Just because.. we can :D
     */
    it('simple incr', async () => {
        const memcached = new Memcached(common.servers.single)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, 1, 1000).then((ok1) => {
            assert.equal(ok1, true)

            return memcached.incr(`test:${testnr}`, 1).then((ok2: number) => {
                memcached.end() // close connections
                assert.equal(ok2, 2)
            })
        })
    })

    /**
     * Simple decrement.. So we know that works as well. Nothing special here
     * move on.
     */
    it('simple decr', async () => {
        const memcached = new Memcached(common.servers.single)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, 0, 1000).then((ok1) => {
            assert.equal(ok1, true)

            memcached.incr(`test:${testnr}`, 10).then((answer1) => {
                assert.equal(answer1, 10)

                memcached.decr(`test:${testnr}`, 1).then((answer2) => {
                    assert.equal(answer2, 9)
                    memcached.end() // close connections
                })
            })
        })
    })

    /**
     * According to the spec, incr should just work fine on keys that
     * have intergers.. So lets test that.
     */
    it('simple increment on a large number', async () => {
        const memcached = new Memcached(common.servers.single)
        const message = common.numbers(10)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, message, 1000).then((ok) => {
            assert.equal(ok, true)
            memcached.incr(`test:${testnr}`, 1).then((answer) => {
                assert.ok(+answer === (message + 1))
                memcached.end() // close connections
            })
        })
    })

    /**
     * decrementing on a unkonwn key should fail.
     */
    it('decrement on a unknown key', async () => {
        const memcached = new Memcached(common.servers.single)
        const testnr = ++(global as any).testnumbers

        return memcached.decr(`test:${testnr}`, 1).then((ok: any) => {
            assert.equal(ok, false)
            memcached.end() // close connections
        })
    })

    /**
     * We can only increment on a integer, not on a string.
     */
    it('incrementing on a non string value throws a client_error', async () => {
        const memcached = new Memcached(common.servers.single)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, 'zing!', 0).then((ok1) => {
            assert.equal(ok1, true)
            memcached.incr(`test:${testnr}`, 1).then((ok2) => {
                memcached.end()
                throw new Error('Should reject')
            }, (err2) => {
                memcached.end() // close connections;
            })
        })
    })
})
