import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || +(Math.random() * 1000000).toFixed()

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */
describe('Memcached CAS', () => {
    /**
     * For a proper CAS update in memcached you will need to know the CAS value
     * of a given key, this is done by the `gets` command. So we will need to make
     * sure that a `cas` key is given.
     */
    it('set and gets for cas result', async () => {
        const memcached = new Memcached(common.servers.single)
        const message = common.alphabet(256)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, message, 1000).then((ok) => {
            assert.equal(ok, true)

            return memcached.gets(`test:${testnr}`).then((answer) => {
                assert.isObject(answer)
                assert.exists(answer.cas)
                assert.equal(answer[`test:${testnr}`], message)

                memcached.end() // close connections
            })
        })
    })

    /**
     * Create a successful cas update, so we are sure we send a cas request correctly.
     */
    it('successful cas update', async () => {
        const memcached = new Memcached(common.servers.single)
        let message = common.alphabet(256)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, message, 1000).then((ok) => {
            assert.equal(ok, true)

            return memcached.gets(`test:${testnr}`).then((answer1) => {
                assert.exists(answer1.cas)

                // generate new message for the cas update
                message = common.alphabet(256)
                return memcached.cas(`test:${testnr}`, message, answer1.cas, 1000).then((answer2) => {
                    assert.exists(answer2)

                    return memcached.get(`test:${testnr}`).then((answer3) => {
                        assert.equal(answer3, message)

                        memcached.end() // close connections
                    })
                })
            })
        })
    })

    /**
     * Create a unsuccessful cas update, which would indicate that the server has changed
     * while we where doing nothing.
     */
    it('unsuccessful cas update', async () => {
        const memcached = new Memcached(common.servers.single)
        const testnr = ++(global as any).testnumbers
        let message = common.alphabet(256)

        return memcached.set(`test:${testnr}`, message, 1000).then((ok1) => {
            assert.equal(ok1, true)

            return memcached.gets(`test:${testnr}`).then((answer1) => {
                assert.exists(answer1.cas)

                // generate new message
                message = common.alphabet(256)
                return memcached.set(`test:${testnr}`, message, 1000).then((ok2) => {
                    assert.equal(ok2, true)

                    return memcached.cas(`test:${testnr}`, message, answer1.cas, 1000).then((answer2) => {
                        assert.exists(answer2)

                        return memcached.get(`test:${testnr}`).then((answer3) => {
                            assert.equal(answer3, message)

                            memcached.end() // close connections
                        })
                    })
                })
            })
        })
    })
})
