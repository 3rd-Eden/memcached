import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || +(Math.random() * 1000000).toFixed()

/**
 * Expresso test suite for all `touch` related
 * memcached commands
 */
describe('Memcached TOUCH', () => {
    /**
     * Make sure that touching a key with 1 sec lifetime and getting it 1.1 sec after invoke deletion
     */
    it('changes lifetime', async () => {
        const memcached = new Memcached(common.servers.single)
        const message = common.alphabet(256)
        const testnr = ++(global as any).testnumbers

        return memcached.set(`test:${testnr}`, message, 1).then((ok1) => {
            assert.equal(ok1, true)
            return memcached.touch(`test:${testnr}`, 1).then((ok2) => {
                assert.equal(ok2, true)
                return common.wait(1100).then(() => {
                    return memcached.get(`test:${testnr}`).then((answer) => {
                        assert.equal(answer, undefined)
                        memcached.end() // close connections
                    })
                }) // 1.1 sec after
            })
        })
    })
})
