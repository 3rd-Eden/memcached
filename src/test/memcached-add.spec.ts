import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || + (Math.random() * 1000000).toFixed()

/**
 * Expresso test suite for all `add` related
 * memcached commands
 */
describe('Memcached ADD', () => {
    /**
     * Make sure that adding a key which already exists returns an error.
     */
    it('fail to add an already existing key', async () => {
        const memcached = new Memcached(common.servers.single)
        const message = common.alphabet(256)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, message, 1000).then((ok: any) => {
            assert.exists(ok)
            return memcached.add(`test:${testnr}`, message, 1000).then((answer: any) => {
                memcached.end()
                throw new Error('Should fail')
            }, (err: any) => {
                memcached.end() // close connections
                assert.equal(err.message, 'Item is not stored')
            })
        })
    })
})
