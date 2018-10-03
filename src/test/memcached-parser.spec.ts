import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || +(Math.random() * 1000000).toFixed()

/**
 * Expresso test suite for all `parser` related
 * memcached commands
 */
describe('Memcached parser', () => {
    it('chunked response', async () => {
        const memcached = new Memcached(common.servers.single)
        const message: string = common.alphabet(256)
        const chunks: Array<string> = []
        const chunk = (key: number, length: number): string => `VALUE tests::#${key} 2 ${length}`
        const chunkJSON: string = JSON.stringify({
            lines: [],
            message,
            id: null,
        })

        // Build up our tests
        const socket = {
            responseBuffer: '',
            bufferArray: [],
            metaData: [],
            streamID: 0,
        }

        // Build up our chunk data
        chunks.push(chunk(1, chunkJSON.length))
        chunks.push(chunkJSON)
        chunks.push(chunk(2, chunkJSON.length));

        // Insert first chunk
        (memcached as any)._buffer(socket, chunks.join('\r\n') + '\r\n')

        // We check for bufferArray length otherwise it will crash on 'SyntaxError: Unexpected token V'
        assert.equal(socket.bufferArray.length, 3)

        // Now add the value of the last response key in previous chunk
        chunks.unshift(chunkJSON)

        // Add it for the second chunk also
        chunks.push(chunkJSON);

        // Insert second chunk
        (memcached as any)._buffer(socket, chunks.join('\r\n') + '\r\nEND\r\n')

        // Check if everything is cleared up nicely.
        assert.equal(socket.responseBuffer.length, 0)
        assert.equal(socket.bufferArray.length, 0)
        assert.equal(socket.metaData.length, 0)

        memcached.end()
    })
})
